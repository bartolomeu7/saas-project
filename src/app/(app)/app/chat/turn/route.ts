import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { getCurrentCompany } from "@/lib/companies/queries";
import { createSessionClient } from "@/lib/supabase/server";
import { todayDateSaoPaulo } from "@/lib/timezone";
import { sanitizeUserText, MAX_MESSAGE_LENGTH } from "@/lib/chat/text.ts";
import { emptyState, runAgendarTurn, type ChatMessage } from "@/lib/chat/agenda-turn.ts";
import { appendMessages, bumpUsage, discardDraft, getOrCreateSession, loadActiveDraft, saveDraft } from "@/lib/chat/server/store";
import { findCustomers, loadAgendaCatalog, loadSchedule } from "@/lib/chat/server/agenda-data";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

/**
 * Chat AI — um turno da conversa (MODO SOMBRA): entende, pergunta, valida e mostra o cartão, mas NÃO grava nada nos
 * módulos (não existe rota de confirmação ainda). Desligado por padrão: precisa de CHAT_AI_ENABLED=true no ambiente
 * E de `chat_settings.enabled` com o módulo "agenda" para a empresa. Docs: docs/chat-ai/01.
 */
// A rota vive em /app/chat/turn (e não em /api) DE PROPÓSITO: tudo em /app passa pelo middleware com as barreiras do
// produto (conta ativa, consentimento, 2FA, assinatura). Uma rota em /api ficaria fora dessas barreiras.
const bodySchema = z.object({
  text: z.string().max(MAX_MESSAGE_LENGTH * 3).default(""),
  sessionId: z.string().uuid().optional(),
  choice: z.object({ field: z.enum(["cliente", "servico", "profissional", "data", "hora"]), id: z.string().min(1).max(64) }).optional(),
});

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "cache-control": "no-store" } });

function dailyLimit(): number {
  const n = Number(process.env.CHAT_DAILY_LIMIT);
  return Number.isInteger(n) && n > 0 ? n : 200;
}

function nowClock(): { today: string; nowMinutes: number } {
  const local = new Date().toLocaleString("sv-SE", { timeZone: "America/Sao_Paulo" });
  const [h, m] = local.slice(11, 16).split(":").map(Number) as [number, number];
  return { today: local.slice(0, 10), nowMinutes: h * 60 + m };
}

export async function POST(request: Request) {
  // 1) interruptor global (padrão: desligado)
  if (process.env.CHAT_AI_ENABLED !== "true") return json({ error: "indisponivel" }, 404);

  // 2) quem é e de qual empresa (nunca do corpo da requisição)
  const user = await getCurrentUser();
  const current = await getCurrentCompany();
  if (!user || !current) return json({ error: "nao_autenticado" }, 401);
  const companyId = current.company.id;

  // 3) corpo
  let parsed: z.infer<typeof bodySchema>;
  try {
    parsed = bodySchema.parse(await request.json());
  } catch {
    return json({ error: "requisicao_invalida" }, 400);
  }
  const text = sanitizeUserText(parsed.text);
  if (!text && !parsed.choice) return json({ error: "mensagem_vazia" }, 400);

  // 4) a empresa ligou o Chat e o módulo Agenda? (RLS: o membro lê a configuração da própria empresa)
  const supabase = (await createSessionClient()) as any;
  const { data: settings } = await supabase.from("chat_settings").select("enabled, modules, draft_ttl_minutes").eq("company_id", companyId).maybeSingle();
  if (!settings?.enabled || !Array.isArray(settings.modules) || !settings.modules.includes("agenda")) return json({ error: "desligado" }, 403);

  // 5) cota diária por empresa (contador atômico no banco)
  const total = await bumpUsage(companyId, todayDateSaoPaulo());
  if (total !== null && total > dailyLimit()) return json({ error: "limite_diario" }, 429);

  // 6) conversa e rascunho em andamento
  const sessionId = await getOrCreateSession(companyId, user.id, parsed.sessionId ?? null);
  if (!sessionId) return json({ error: "falha_sessao" }, 500);
  const existing = await loadActiveDraft(companyId, user.id, sessionId);

  // 7) um turno (lógica pura; o banco entra pelas portas, todas só de leitura)
  const catalog = await loadAgendaCatalog(companyId);
  const result = await runAgendarTurn(
    { text, choice: parsed.choice, state: existing?.state ?? emptyState(), catalog, clock: nowClock() },
    {
      findCustomers: (t) => findCustomers(companyId, t),
      loadSchedule: (professionalId, date) => loadSchedule(companyId, professionalId, date),
    }
  );

  // 8) modo sombra: o cartão não tem botão de confirmar e o texto diz isso
  const messages: ChatMessage[] = result.messages.map((m) => (m.kind === "confirm" ? { ...m, text: "Modo teste: entendi e conferi tudo, mas ainda não gravo nada na agenda." } : m));

  // 9) guarda o estado (rascunho com versão) e a conversa
  let draft: { id: string; version: number } | null = null;
  if (!result.state.started) {
    if (existing) await discardDraft(companyId, user.id, existing.id);
  } else {
    draft = await saveDraft({
      companyId,
      userId: user.id,
      sessionId,
      existing,
      state: result.state,
      status: result.status,
      missing: result.missing,
      blocks: result.blocks,
      warnings: result.warnings,
      rawText: text,
      ttlMinutes: settings.draft_ttl_minutes ?? undefined,
    });
  }
  await appendMessages({ companyId, userId: user.id, sessionId, draftId: draft?.id ?? null, userText: text || "(escolha)", agent: messages });

  return json({ sessionId, draftId: draft?.id ?? null, version: draft?.version ?? null, status: result.status, shadow: true, messages });
}
