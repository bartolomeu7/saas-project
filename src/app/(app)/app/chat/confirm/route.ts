import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { getCurrentCompany } from "@/lib/companies/queries";
import { createSessionClient } from "@/lib/supabase/server";
import { createAppointmentCore } from "@/lib/agenda/create-core";
import { effectiveDuration } from "@/lib/chat/agenda-agendar.ts";
import { runAgendarTurn, type ChatMessage } from "@/lib/chat/agenda-turn.ts";
import { planConfirm, REFUSAL_MESSAGES } from "@/lib/chat/draft.ts";
import {
  appendMessages,
  claimDraft,
  completeDraft,
  getChatSettings,
  loadDraftById,
  recordFeedback,
  releaseDraft,
  saveDraft,
} from "@/lib/chat/server/store";
import { findCustomers, loadAgendaCatalog, loadSchedule } from "@/lib/chat/server/agenda-data";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

/**
 * Chat AI — CONFIRMAR (grava de verdade). Só funciona com CHAT_AI_ENABLED=true E CHAT_AI_CONFIRM_ENABLED=true E o Chat
 * ligado para a empresa. Fica em /app (passa pelas barreiras do middleware: conta ativa, consentimento, 2FA, assinatura).
 *
 * Garantias (docs/chat-ai/04, invariantes I1, I2, I6, I7):
 *  - o corpo traz só (rascunho, versão): os dados gravados vêm do rascunho guardado no servidor;
 *  - só o dono do rascunho, da empresa certa, na versão exibida, dentro da validade e sem pendências;
 *  - clique duplicado / abas simultâneas gravam UMA vez (reivindicação atômica + chave única; o 2º recebe o resultado);
 *  - TUDO é revalidado no banco agora (horário pode ter sido ocupado desde o resumo);
 *  - grava pelo mesmo núcleo da tela da Agenda, com a SESSÃO do usuário (RLS e permissões valem).
 */
const bodySchema = z.object({ draftId: z.string().uuid(), version: z.number().int().min(1) });

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "cache-control": "no-store" } });

const IN_PROGRESS = "Estou gravando esse pedido agora. Aguarde um instante.";

function nowClock(): { today: string; nowMinutes: number } {
  const local = new Date().toLocaleString("sv-SE", { timeZone: "America/Sao_Paulo" });
  const [h, m] = local.slice(11, 16).split(":").map(Number) as [number, number];
  return { today: local.slice(0, 10), nowMinutes: h * 60 + m };
}

const created = (): ChatMessage => ({ kind: "result", text: "Pronto! Agendamento criado.", link: { href: "/app/agenda", label: "Abrir a Agenda" } });

export async function POST(request: Request) {
  try {
    return await handle(request);
  } catch (error) {
    console.error("[chat/confirm] falha inesperada:", error instanceof Error ? error.message : error);
    return json({ error: "erro_interno" }, 500);
  }
}

async function handle(request: Request) {
  // 1) interruptores (padrão: desligados). Gravar exige o interruptor próprio, além do Chat ligado.
  if (process.env.CHAT_AI_ENABLED !== "true" || process.env.CHAT_AI_CONFIRM_ENABLED !== "true") return json({ error: "indisponivel" }, 404);

  const user = await getCurrentUser();
  const current = await getCurrentCompany();
  if (!user || !current) return json({ error: "nao_autenticado" }, 401);
  const companyId = current.company.id;

  let parsed: z.infer<typeof bodySchema>;
  try {
    parsed = bodySchema.parse(await request.json());
  } catch {
    return json({ error: "requisicao_invalida" }, 400);
  }

  const supabase = await createSessionClient();
  const settings = await getChatSettings(companyId);
  if (!settings?.enabled || !settings.modules.includes("agenda")) return json({ error: "desligado" }, 403);

  // 2) rascunho (só se for deste usuário e desta empresa)
  const row = await loadDraftById(companyId, user.id, parsed.draftId);
  if (!row || row.draft.module !== "agenda") return json({ error: "nao_encontrado" }, 404);
  const { draft } = row;

  // 3) o que fazer com este clique
  const plan = planConfirm(draft, { companyId, userId: user.id, version: parsed.version, now: new Date() });
  if (plan.action === "replay") return json({ status: "concluido", replay: true, messages: [{ ...created(), text: "Esse agendamento já foi criado." }] });
  if (plan.action === "in_progress") return json({ error: "em_andamento", message: IN_PROGRESS }, 409);
  if (plan.action === "refuse") return json({ error: "recusado", reason: plan.reason, message: REFUSAL_MESSAGES[plan.reason] }, 409);

  // 4) reivindica (atômico): só um clique passa daqui
  const claimed = await claimDraft(companyId, user.id, draft.id, draft.version);
  if (!claimed) return json({ error: "em_andamento", message: IN_PROGRESS }, 409);

  // Depois que o agendamento é criado, NADA pode liberar o rascunho (um novo clique criaria outro): este marcador guarda o ponto.
  let createdId: string | null = null;
  try {
    // 5) revalida TUDO com os dados de agora (mesmo motor da conversa, sem texto novo)
    const catalog = await loadAgendaCatalog(companyId);
    const recheck = await runAgendarTurn(
      { text: "", state: draft.slots, catalog, clock: nowClock() },
      { findCustomers: (t) => findCustomers(companyId, t), loadSchedule: (professionalId, date) => loadSchedule(companyId, professionalId, date) }
    );
    if (recheck.status !== "aguardando_confirmacao") {
      // algo mudou desde o resumo: não grava; devolve o que mudou e volta a coletar (versão nova)
      await releaseDraft(companyId, user.id, draft.id, "coletando");
      const revised = await saveDraft({
        companyId,
        userId: user.id,
        sessionId: row.sessionId,
        existing: { id: draft.id, version: draft.version, state: draft.slots },
        state: recheck.state,
        status: "coletando",
        missing: recheck.missing,
        blocks: recheck.blocks,
        warnings: recheck.warnings,
        rawText: "(revalidação na confirmação)",
      });
      const messages: ChatMessage[] = [{ kind: "notice", text: "Antes de gravar, conferi de novo e algo mudou desde o resumo." }, ...recheck.messages];
      await appendMessages({ companyId, userId: user.id, sessionId: row.sessionId, draftId: draft.id, userText: "(confirmar)", agent: messages });
      return json({ error: "mudou", draftId: draft.id, version: revised?.version ?? null, status: recheck.status, messages }, 409);
    }

    // 6) grava, pelo mesmo núcleo da tela da Agenda, com a sessão do usuário
    const s = draft.slots.slots;
    if (!s.servico || !s.profissional || !s.cliente || !s.date || !s.time) {
      await releaseDraft(companyId, user.id, draft.id);
      return json({ error: "incompleto", message: REFUSAL_MESSAGES.incompleto }, 409);
    }
    const result = await createAppointmentCore(supabase, {
      customerId: s.cliente.id,
      serviceId: s.servico.id,
      professionalId: s.profissional.id,
      startsAtLocal: `${s.date}T${s.time}`,
      // só manda duração/valor quando a PESSOA definiu; senão o banco aplica a mesma precedência do cartão
      durationMinutes: s.endTime ? effectiveDuration(s) ?? undefined : undefined,
      price: s.priceOverride,
      notes: s.notes,
    });

    if ("error" in result) {
      await releaseDraft(companyId, user.id, draft.id);
      await recordFeedback(companyId, draft.id, draft.intent, "falha");
      const messages: ChatMessage[] = [{ kind: "error", text: `${result.error} Nada foi gravado. Se quiser, confirme de novo ou ajuste o pedido.` }];
      await appendMessages({ companyId, userId: user.id, sessionId: row.sessionId, draftId: draft.id, userText: "(confirmar)", agent: messages });
      return json({ error: "falhou", status: "aguardando_confirmacao", messages }, 422);
    }

    // 7) fecha o rascunho com o que foi criado (falha aqui não desfaz nem libera: o agendamento já existe)
    createdId = result.id || "criado";
    const message = created();
    try {
      await completeDraft(companyId, user.id, draft.id, { appointmentId: result.id, module: "agenda", intent: draft.intent });
      await recordFeedback(companyId, draft.id, draft.intent, "confirmado");
      await appendMessages({ companyId, userId: user.id, sessionId: row.sessionId, draftId: draft.id, userText: "(confirmar)", agent: [message] });
    } catch {
      // o registro do chat falhou, mas o agendamento foi criado: segue e informa o sucesso
    }
    revalidatePath("/app/agenda");
    return json({ status: "concluido", messages: [message] });
  } catch {
    if (createdId) {
      // já criou: nunca libera para nova tentativa; informa o sucesso
      return json({ status: "concluido", messages: [created()] });
    }
    // falha inesperada ANTES de criar: libera para tentar de novo; nada é dado como gravado
    await releaseDraft(companyId, user.id, draft.id);
    const message: ChatMessage = { kind: "error", text: "Não consegui gravar agora. Nada foi alterado. Tente de novo." };
    return json({ error: "falhou", status: "aguardando_confirmacao", messages: [message] }, 500);
  }
}
