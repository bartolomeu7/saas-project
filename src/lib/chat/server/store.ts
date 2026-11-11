import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { emptyState, type AgendarState, type ChatMessage } from "../agenda-turn.ts";
import { DEFAULT_DRAFT_TTL_MINUTES, idempotencyKeyFor, type Draft, type DraftStatus } from "../draft.ts";

/**
 * Chat AI — persistência do estado da conversa (tabelas `chat_*`, migration 20261111200000).
 * EXCEÇÃO consciente à regra "nunca service role no chat": estas tabelas só aceitam escrita do servidor, e aqui
 * empresa e usuário vêm SEMPRE da sessão já autenticada pela rota (nunca do corpo da requisição). A gravação nos
 * módulos continua com a sessão do usuário.
 */

const db = () => createAdminClient() as any;

export interface StoredDraft {
  id: string;
  version: number;
  state: AgendarState;
}

export async function getOrCreateSession(companyId: string, userId: string, sessionId: string | null): Promise<string | null> {
  const supabase = db();
  if (sessionId) {
    const { data } = await supabase.from("chat_sessions").select("id").eq("id", sessionId).eq("company_id", companyId).eq("user_id", userId).maybeSingle();
    if (data?.id) {
      await supabase.from("chat_sessions").update({ last_active_at: new Date().toISOString() }).eq("id", data.id);
      return data.id as string;
    }
  }
  const { data, error } = await supabase.from("chat_sessions").insert({ company_id: companyId, user_id: userId }).select("id").single();
  return error || !data ? null : (data.id as string);
}

/** Rascunho de agendamento ainda em andamento nesta sessão (não expirado). */
export async function loadActiveDraft(companyId: string, userId: string, sessionId: string): Promise<StoredDraft | null> {
  const { data } = await db()
    .from("chat_drafts")
    .select("id, version, slots, status, expires_at")
    .eq("company_id", companyId)
    .eq("user_id", userId)
    .eq("session_id", sessionId)
    .eq("module", "agenda")
    .in("status", ["coletando", "aguardando_confirmacao"])
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  const state = (data.slots ?? emptyState()) as AgendarState;
  return { id: data.id as string, version: data.version as number, state };
}

export interface SaveDraftInput {
  companyId: string;
  userId: string;
  sessionId: string;
  existing: StoredDraft | null;
  state: AgendarState;
  status: "coletando" | "aguardando_confirmacao";
  missing: string[];
  blocks: string[];
  warnings: string[];
  rawText: string;
  ttlMinutes?: number;
}

/** Cria ou atualiza o rascunho (versão +1 a cada alteração). Devolve id e versão. */
export async function saveDraft(input: SaveDraftInput): Promise<{ id: string; version: number } | null> {
  const supabase = db();
  const expiresAt = new Date(Date.now() + (input.ttlMinutes ?? DEFAULT_DRAFT_TTL_MINUTES) * 60_000).toISOString();
  const fields = {
    slots: input.state,
    raw: { lastText: input.rawText.slice(0, 500) },
    missing: input.missing,
    warnings: input.warnings,
    blocks: input.blocks,
    status: input.status,
    expires_at: expiresAt,
    updated_at: new Date().toISOString(),
  };
  if (input.existing) {
    const version = input.existing.version + 1;
    const { error } = await supabase.from("chat_drafts").update({ ...fields, version }).eq("id", input.existing.id).eq("company_id", input.companyId).eq("user_id", input.userId);
    return error ? null : { id: input.existing.id, version };
  }
  const { data, error } = await supabase
    .from("chat_drafts")
    .insert({ ...fields, company_id: input.companyId, user_id: input.userId, session_id: input.sessionId, module: "agenda", intent: "agenda.agendar", risk: "R1", version: 1 })
    .select("id, version")
    .single();
  return error || !data ? null : { id: data.id as string, version: data.version as number };
}

/** Descarta o rascunho em andamento (a pessoa cancelou). */
export async function discardDraft(companyId: string, userId: string, draftId: string): Promise<void> {
  await db().from("chat_drafts").update({ status: "descartado", updated_at: new Date().toISOString() }).eq("id", draftId).eq("company_id", companyId).eq("user_id", userId);
}

export async function appendMessages(args: {
  companyId: string;
  userId: string;
  sessionId: string;
  draftId: string | null;
  userText: string;
  agent: ChatMessage[];
}): Promise<void> {
  const rows = [
    { session_id: args.sessionId, company_id: args.companyId, user_id: args.userId, role: "user", kind: "text", text: args.userText.slice(0, 4000), draft_id: args.draftId },
    ...args.agent.map((m) => ({
      session_id: args.sessionId,
      company_id: args.companyId,
      user_id: args.userId,
      role: "agent",
      kind: m.kind,
      text: m.text.slice(0, 4000),
      payload: m,
      draft_id: args.draftId,
    })),
  ];
  await db().from("chat_messages").insert(rows);
}

/** Soma 1 mensagem no dia e devolve o total do dia (atômico, `chat_bump_usage`). null se falhar. */
export async function bumpUsage(companyId: string, day: string): Promise<number | null> {
  const { data, error } = await db().rpc("chat_bump_usage", { p_company_id: companyId, p_day: day });
  return error || typeof data !== "number" ? null : data;
}

// ---------------------------------------------------------------------------------------------------- confirmação
export interface DraftRow {
  draft: Draft<AgendarState>;
  sessionId: string;
  idempotencyKey: string | null;
  result: unknown;
}

/** Rascunho por id, só se for DESTE usuário e DESTA empresa (senão null: nunca revela que existe). */
export async function loadDraftById(companyId: string, userId: string, draftId: string): Promise<DraftRow | null> {
  const { data } = await db()
    .from("chat_drafts")
    .select("id, company_id, user_id, session_id, module, intent, risk, slots, missing, warnings, blocks, version, status, expires_at, created_at, idempotency_key, result")
    .eq("id", draftId)
    .eq("company_id", companyId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) return null;
  return {
    sessionId: data.session_id as string,
    idempotencyKey: (data.idempotency_key as string | null) ?? null,
    result: data.result ?? null,
    draft: {
      id: data.id as string,
      companyId: data.company_id as string,
      userId: data.user_id as string,
      module: data.module as string,
      intent: data.intent as string,
      risk: data.risk as Draft["risk"],
      slots: (data.slots ?? emptyState()) as AgendarState,
      missing: (data.missing ?? []) as string[],
      warnings: (data.warnings ?? []) as string[],
      blocks: (data.blocks ?? []) as string[],
      version: data.version as number,
      status: data.status as DraftStatus,
      expiresAt: data.expires_at as string,
      createdAt: data.created_at as string,
    },
  };
}

/**
 * Reivindica o rascunho para executar, de forma ATÔMICA: só um clique vence (mesma versão, ainda aguardando, sem chave).
 * O UPDATE condicional é a barreira contra duplo clique e abas simultâneas; a coluna `idempotency_key` é única.
 */
export async function claimDraft(companyId: string, userId: string, draftId: string, version: number): Promise<boolean> {
  const { data, error } = await db()
    .from("chat_drafts")
    .update({ status: "executando", idempotency_key: idempotencyKeyFor(draftId, version), updated_at: new Date().toISOString() })
    .eq("id", draftId)
    .eq("company_id", companyId)
    .eq("user_id", userId)
    .eq("version", version)
    .eq("status", "aguardando_confirmacao")
    .is("idempotency_key", null)
    .select("id");
  return !error && Array.isArray(data) && data.length === 1;
}

/** Terminou bem: guarda o resultado (o que foi criado) e fecha o rascunho. */
export async function completeDraft(companyId: string, userId: string, draftId: string, result: Record<string, unknown>): Promise<void> {
  const now = new Date().toISOString();
  await db().from("chat_drafts").update({ status: "concluido", result, executed_at: now, updated_at: now }).eq("id", draftId).eq("company_id", companyId).eq("user_id", userId);
}

/** Não gravou (erro ou mudou algo): devolve o rascunho para ser confirmado de novo e libera a chave. */
export async function releaseDraft(companyId: string, userId: string, draftId: string, status: "aguardando_confirmacao" | "coletando" = "aguardando_confirmacao"): Promise<void> {
  await db().from("chat_drafts").update({ status, idempotency_key: null, updated_at: new Date().toISOString() }).eq("id", draftId).eq("company_id", companyId).eq("user_id", userId).eq("status", "executando");
}

export async function recordFeedback(companyId: string, draftId: string, intent: string, kind: "confirmado" | "falha" | "correcao" | "descarte"): Promise<void> {
  await db().from("chat_feedback").insert({ company_id: companyId, draft_id: draftId, intent, kind });
}

export interface ChatSettings {
  enabled: boolean;
  modules: string[];
  draftTtlMinutes: number | null;
  agentName: string;
}

export const DEFAULT_CHAT_SETTINGS: ChatSettings = { enabled: true, modules: ["agenda"], draftTtlMinutes: null, agentName: "Cláudia" };

/** Configuração do Chat da empresa (a empresa vem da sessão autenticada pela rota). Sem linha: o padrão liberado (DEFAULT_CHAT_SETTINGS). null se a tabela não existir ou a leitura falhar. */
export async function getChatSettings(companyId: string): Promise<ChatSettings | null> {
  const { data, error } = await db().from("chat_settings").select("enabled, modules, draft_ttl_minutes, agent_name").eq("company_id", companyId).maybeSingle();
  if (error) return null;
  // Sem linha = padrão liberado para todas as empresas (Agenda, agente "Cláudia"). Uma linha com enabled=false desliga a empresa.
  if (!data) return { ...DEFAULT_CHAT_SETTINGS };
  return { enabled: data.enabled === true, modules: Array.isArray(data.modules) ? (data.modules as string[]) : [], draftTtlMinutes: (data.draft_ttl_minutes as number | null) ?? null, agentName: String(data.agent_name || "Cláudia") };
}
