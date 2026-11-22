/**
 * Webhook da MisticPay (docs.misticpay.com, lida em 22/11/2026) — funções PURAS, sem rede e sem banco.
 *
 * Contrato usado: POST com JSON `{ transactionId, transactionType, transactionMethod, clientName, clientDocument, status,
 * value, fee, e2e, ispb, bankName }` (depósito). O mesmo corpo vem nos reembolsos (com o objeto `refund`) e nos saques
 * (`transactionType: "RETIRADA"`); infrações MED chegam com `event: "INFRACTION"`.
 *
 * A MisticPay NÃO assina os webhooks (a documentação não descreve assinatura nem segredo). Por isso:
 *  1. a URL que informamos na cobrança leva um token secreto (`?token=`), conferido em tempo constante: quem não o conhece
 *     não consegue sequer disparar consultas;
 *  2. NADA do corpo é confiado: ele só diz QUAL pagamento consultar. Status e valor vêm da consulta `POST /transactions/check`
 *     feita pelo servidor com a chave secreta — um webhook forjado jamais libera acesso.
 * O valor do webhook também não serve de base: o exemplo da documentação o traz em centavos, e o `check`, em reais.
 */
import { createHash, timingSafeEqual } from "node:crypto";

/** Enum interno de subscription_payments.status (espelha public.subscription_payment_status). */
export type InternalPaymentStatus = "pending" | "paid" | "expired" | "cancelled" | "failed" | "refunded";

/**
 * Mapeia o estado da MisticPay para o interno. Valor desconhecido => null (o chamador ignora: nunca vira "pago").
 *  - COMPLETO => paid (único que libera acesso); PENDENTE => pending; FALHA => failed; CANCELADO => cancelled;
 *  - DEVOLVIDO => refunded; DEVOLVIDO_PARCIAL => null (ignorado: o valor pago não bate mais e não há política de estorno parcial).
 */
export function mapMisticPayStatus(state: unknown): InternalPaymentStatus | null {
  switch (state) {
    case "COMPLETO":
      return "paid";
    case "PENDENTE":
      return "pending";
    case "FALHA":
      return "failed";
    case "CANCELADO":
      return "cancelled";
    case "DEVOLVIDO":
      return "refunded";
    default:
      return null;
  }
}

export type TokenResult = { ok: true } | { ok: false; reason: "missing" | "mismatch" };

/** Confere o token da URL do webhook em tempo constante (compara os hashes, que têm sempre o mesmo tamanho). */
export function verifyWebhookToken(provided: string | null | undefined, expected: string): TokenResult {
  if (!expected || !provided) return { ok: false, reason: "missing" };
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b) ? { ok: true } : { ok: false, reason: "mismatch" };
}

/** Token mínimo aceito para o segredo do webhook (gerado com `openssl rand -hex 24` ou equivalente). */
export const MIN_WEBHOOK_TOKEN_LENGTH = 24;

/** URL pública do webhook que vai em `projectWebhook`. Sem token válido não há URL (a cobrança não deve ser criada). */
export function buildWebhookUrl(origin: string | null, token: string | null | undefined): string | null {
  const secret = token?.trim() ?? "";
  if (!origin || secret.length < MIN_WEBHOOK_TOKEN_LENGTH || !/^[A-Za-z0-9._~-]+$/.test(secret)) return null;
  return `${origin}/api/webhooks/misticpay?token=${secret}`;
}

export interface DepositNotice {
  /** Identificador citado pelo webhook: o da MisticPay (numérico) ou o nosso, conforme o evento. Só serve para achar o pagamento. */
  transactionId: string;
  /** Estado citado (ignorado para decidir: a consulta é que manda). */
  status: string | null;
}

export type ParsedNotice =
  | { ok: true; notice: DepositNotice }
  | { ok: false; reason: "not_object" | "med" | "not_deposit" | "no_transaction" };

const text = (value: unknown, max: number): string | null => {
  if (typeof value === "string" && value.trim() !== "") return value.trim().slice(0, max);
  if (typeof value === "number" && Number.isFinite(value)) return String(value).slice(0, max);
  return null;
};

/** Lê o aviso de depósito (inclusive reembolso de depósito). Saques e infrações MED são recusados aqui. */
export function parseDepositNotice(body: unknown): ParsedNotice {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false, reason: "not_object" };
  const root = body as Record<string, unknown>;
  if (root.event === "INFRACTION" || (root.infraction && typeof root.infraction === "object")) return { ok: false, reason: "med" };
  if (root.transactionType !== "DEPOSITO") return { ok: false, reason: "not_deposit" };
  const transactionId = text(root.transactionId, 120);
  if (!transactionId) return { ok: false, reason: "no_transaction" };
  return { ok: true, notice: { transactionId, status: text(root.status, 30) } };
}

const UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/** Se o identificador do aviso é o nosso (id do pagamento, UUID), devolve-o em minúsculas; senão null. */
export function paymentIdFromNotice(transactionId: string): string | null {
  return UUID.test(transactionId) ? transactionId.toLowerCase() : null;
}
