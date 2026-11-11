/**
 * Chat AI — rascunho (draft) e máquina de estados. Funções puras: o armazenamento (banco) vem depois.
 * Regras (docs/chat-ai/01 §4): versão a cada alteração, confirmação só da versão exibida, validade, idempotência,
 * um rascunho só executa uma vez, áudio é apagado quando o rascunho chega a um estado final.
 */

export type Risk = "R0" | "R1" | "R2" | "R3";

export type DraftStatus =
  | "coletando"
  | "aguardando_confirmacao"
  | "executando"
  | "concluido"
  | "descartado"
  | "expirado"
  | "falhou";

export const FINAL_STATUSES: readonly DraftStatus[] = ["concluido", "descartado", "expirado", "falhou"];

export const DEFAULT_DRAFT_TTL_MINUTES = 30;

export interface Draft<Slots = Record<string, unknown>> {
  id: string;
  companyId: string;
  userId: string;
  module: string;
  intent: string;
  risk: Risk;
  slots: Slots;
  /** campos obrigatórios que ainda faltam */
  missing: string[];
  /** avisos que não bloqueiam */
  warnings: string[];
  /** problemas que bloqueiam o Confirmar */
  blocks: string[];
  version: number;
  status: DraftStatus;
  /** ISO 8601 */
  expiresAt: string;
  createdAt: string;
}

const TRANSITIONS: Record<DraftStatus, readonly DraftStatus[]> = {
  coletando: ["aguardando_confirmacao", "descartado", "expirado"],
  aguardando_confirmacao: ["coletando", "executando", "descartado", "expirado"],
  executando: ["concluido", "falhou", "aguardando_confirmacao"],
  concluido: [],
  descartado: [],
  expirado: [],
  falhou: ["aguardando_confirmacao", "descartado", "expirado"],
};

export const isFinal = (status: DraftStatus): boolean => FINAL_STATUSES.includes(status) && status !== "falhou";

/**
 * "Ordem terminou" para efeito de apagar o áudio: estados finais; `falhou` só conta depois do prazo sem nova tentativa
 * (quem chama passa `failedRetryWindowPassed`).
 */
export function audioMayBeDeleted(status: DraftStatus, failedRetryWindowPassed = false): boolean {
  if (status === "falhou") return failedRetryWindowPassed;
  return isFinal(status);
}

export function canTransition(from: DraftStatus, to: DraftStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function newDraft<Slots>(input: {
  id: string;
  companyId: string;
  userId: string;
  module: string;
  intent: string;
  risk: Risk;
  slots: Slots;
  now: Date;
  ttlMinutes?: number;
}): Draft<Slots> {
  const ttl = input.ttlMinutes ?? DEFAULT_DRAFT_TTL_MINUTES;
  return {
    id: input.id,
    companyId: input.companyId,
    userId: input.userId,
    module: input.module,
    intent: input.intent,
    risk: input.risk,
    slots: input.slots,
    missing: [],
    warnings: [],
    blocks: [],
    version: 1,
    status: "coletando",
    expiresAt: new Date(input.now.getTime() + ttl * 60_000).toISOString(),
    createdAt: input.now.toISOString(),
  };
}

export function isExpired(draft: Draft, now: Date): boolean {
  return now.getTime() >= new Date(draft.expiresAt).getTime();
}

/** Qualquer alteração (resposta, correção) sobe a versão e volta a coletar: o cartão antigo deixa de valer. */
export function revise<Slots>(
  draft: Draft<Slots>,
  patch: { slots?: Slots; missing?: string[]; warnings?: string[]; blocks?: string[] },
  now: Date,
  ttlMinutes = DEFAULT_DRAFT_TTL_MINUTES
): Draft<Slots> {
  if (isFinal(draft.status) || draft.status === "executando") return draft;
  const missing = patch.missing ?? draft.missing;
  const blocks = patch.blocks ?? draft.blocks;
  return {
    ...draft,
    slots: patch.slots ?? draft.slots,
    missing,
    warnings: patch.warnings ?? draft.warnings,
    blocks,
    version: draft.version + 1,
    status: missing.length === 0 && blocks.length === 0 ? "aguardando_confirmacao" : "coletando",
    expiresAt: new Date(now.getTime() + ttlMinutes * 60_000).toISOString(),
  };
}

export type ConfirmRefusal = "empresa" | "usuario" | "versao" | "expirado" | "status" | "incompleto" | "bloqueado";

export interface ConfirmInput {
  companyId: string;
  userId: string;
  version: number;
  now: Date;
}

/**
 * Pode executar? Todas as condições têm de valer; o primeiro motivo de recusa é devolvido.
 * Nada aqui grava: quem executa só roda depois de `ok: true`.
 */
export function checkConfirm(draft: Draft, input: ConfirmInput): { ok: true } | { ok: false; reason: ConfirmRefusal } {
  if (draft.companyId !== input.companyId) return { ok: false, reason: "empresa" };
  if (draft.userId !== input.userId) return { ok: false, reason: "usuario" };
  if (draft.status !== "aguardando_confirmacao") return { ok: false, reason: "status" };
  if (isExpired(draft, input.now)) return { ok: false, reason: "expirado" };
  if (draft.version !== input.version) return { ok: false, reason: "versao" };
  if (draft.missing.length > 0) return { ok: false, reason: "incompleto" };
  if (draft.blocks.length > 0) return { ok: false, reason: "bloqueado" };
  return { ok: true };
}

/** Marca como executando (uma vez). Quem chama garante que `checkConfirm` deu ok. */
export function startExecution<Slots>(draft: Draft<Slots>): Draft<Slots> {
  if (!canTransition(draft.status, "executando")) return draft;
  return { ...draft, status: "executando" };
}

export function finishExecution<Slots>(draft: Draft<Slots>, outcome: "concluido" | "falhou"): Draft<Slots> {
  if (!canTransition(draft.status, outcome)) return draft;
  return { ...draft, status: outcome };
}

export function discard<Slots>(draft: Draft<Slots>): Draft<Slots> {
  return canTransition(draft.status, "descartado") ? { ...draft, status: "descartado" } : draft;
}

export function expireIfDue<Slots>(draft: Draft<Slots>, now: Date): Draft<Slots> {
  if (!isFinal(draft.status) && draft.status !== "executando" && isExpired(draft as Draft, now)) return { ...draft, status: "expirado" };
  return draft;
}

/** Chave única por (rascunho, versão): duplo clique e reenvio gravam uma vez. */
export const idempotencyKeyFor = (draftId: string, version: number): string => `${draftId}:v${version}`;

/** Textos exibidos quando o Confirmar é recusado. */
export const REFUSAL_MESSAGES: Record<ConfirmRefusal, string> = {
  empresa: "Esse pedido não pertence a esta empresa.",
  usuario: "Esse pedido é de outra pessoa.",
  versao: "Este resumo foi atualizado. Confira o novo resumo antes de confirmar.",
  expirado: "Esse pedido expirou. Quer que eu refaça?",
  status: "Esse pedido já foi concluído ou cancelado.",
  incompleto: "Ainda faltam informações para concluir.",
  bloqueado: "Há um problema a resolver antes de confirmar.",
};
