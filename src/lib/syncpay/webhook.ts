/**
 * Webhook da SyncPay (docs.syncpayments.com.br, lida em 21/11/2026) — funções PURAS, sem rede e sem banco.
 *
 * Contrato usado (evento `transaction`, que cobre Pix e cartão):
 *  - POST com corpo JSON e cabeçalhos `X-SyncPay-Event`, `X-SyncPay-Delivery` e `X-SyncPay-Signature`;
 *  - assinatura `t=<unix>,v1=<hex>`: HMAC-SHA256 de `"{t}.{corpo bruto}"` com o segredo do webhook (mostrado uma única
 *    vez na criação); entregas com |agora − t| > 300 s são rejeitadas (replay);
 *  - corpo: `event`, `event_id` (chave de deduplicação por evento), `occurred_at`, `transaction{reference_id, status,
 *    previous_status, payment_method, amount (bruto), description, end_to_end_id, paid_at, ...}`;
 *  - o botão "Testar" do painel manda `test: true` SEM assinatura.
 * Libera acesso só em `completed`. Dados pessoais (customer, debtor_account) NUNCA são guardados: ver `minimizeEvent`.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export const SIGNATURE_TOLERANCE_SECONDS = 300;

export type SignatureResult = { ok: true } | { ok: false; reason: "missing" | "malformed" | "stale" | "mismatch" };

/** Confere `X-SyncPay-Signature` com o corpo CRU (antes de qualquer JSON.parse) e a janela de 5 minutos. */
export function verifySignature(header: string | null | undefined, rawBody: string, secret: string, nowMs: number = Date.now()): SignatureResult {
  if (!header || !secret) return { ok: false, reason: "missing" };

  let timestamp: number | null = null;
  const candidates: string[] = [];
  for (const part of header.split(",")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key === "t" && /^\d{1,12}$/.test(value)) timestamp = Number(value);
    else if (key === "v1" && /^[0-9a-fA-F]{64}$/.test(value)) candidates.push(value.toLowerCase());
  }
  if (timestamp === null || candidates.length === 0) return { ok: false, reason: "malformed" };
  if (Math.abs(nowMs / 1000 - timestamp) > SIGNATURE_TOLERANCE_SECONDS) return { ok: false, reason: "stale" };

  const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest();
  for (const candidate of candidates) {
    const received = Buffer.from(candidate, "hex");
    if (received.length === expected.length && timingSafeEqual(received, expected)) return { ok: true };
  }
  return { ok: false, reason: "mismatch" };
}

/** Status que a SyncPay documenta para uma transação. */
export const SYNCPAY_STATUSES = ["pending", "completed", "failed", "refused", "three_ds_failed", "refunding", "refunded", "chargeback", "med"] as const;
export type SyncPayStatus = (typeof SYNCPAY_STATUSES)[number];

/** Enum interno de subscription_payments.status (espelha public.subscription_payment_status). */
export type InternalPaymentStatus = "pending" | "paid" | "expired" | "cancelled" | "failed" | "refunded";

/**
 * Mapeia o status da SyncPay para o interno. Valor desconhecido => null (o chamador ignora: nunca vira "pago").
 *  - completed => paid (único que libera acesso);
 *  - failed/refused/three_ds_failed => failed (não paga; no Pix `failed` inclui expirada/cancelada);
 *  - refunding e med (estorno em andamento / contestação Pix aberta) => null (ignorados): se vierem fora de ordem antes do
 *    `completed`, NUNCA podem conceder acesso; se o pagamento já estava pago, nada muda até o desfecho (`refunded`/`chargeback`).
 *    A SyncPay manda "suspender a entrega"; o Prime Ges ainda não tem suspensão automática — o painel mostra o aviso;
 *  - refunded e chargeback => refunded (a SyncPay manda cancelar o pedido).
 */
export function mapSyncPayStatus(status: unknown): InternalPaymentStatus | null {
  switch (status) {
    case "completed":
      return "paid";
    case "pending":
      return "pending";
    case "failed":
    case "refused":
    case "three_ds_failed":
      return "failed";
    case "refunded":
    case "chargeback":
      return "refunded";
    default:
      return null;
  }
}

export interface TransactionEvent {
  event: string;
  eventId: string;
  occurredAt: string | null;
  referenceId: string;
  status: SyncPayStatus;
  previousStatus: string | null;
  paymentMethod: string | null;
  /** Valor BRUTO pago pelo comprador, em reais. */
  amount: number | null;
  netAmount: number | null;
  description: string | null;
  endToEndId: string | null;
  paidAt: string | null;
}

export type ParsedEvent =
  | { ok: true; event: TransactionEvent }
  | { ok: false; reason: "not_object" | "test" | "unsupported_event" | "no_event_id" | "no_reference" | "unknown_status" };

const text = (value: unknown, max = 200): string | null => (typeof value === "string" && value.trim() !== "" ? value.trim().slice(0, max) : null);
const num = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  return null;
};

/** Lê o corpo do evento `transaction.created` / `transaction.updated`. Qualquer outro formato é recusado. */
export function parseTransactionEvent(body: unknown): ParsedEvent {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false, reason: "not_object" };
  const root = body as Record<string, unknown>;
  if (root.test === true) return { ok: false, reason: "test" };

  const event = text(root.event, 60);
  if (event !== "transaction.created" && event !== "transaction.updated") return { ok: false, reason: "unsupported_event" };

  const eventId = text(root.event_id);
  if (!eventId) return { ok: false, reason: "no_event_id" };

  const tx = root.transaction;
  if (!tx || typeof tx !== "object" || Array.isArray(tx)) return { ok: false, reason: "no_reference" };
  const t = tx as Record<string, unknown>;

  const referenceId = text(t.reference_id, 80);
  if (!referenceId) return { ok: false, reason: "no_reference" };

  const status = t.status;
  if (typeof status !== "string" || !(SYNCPAY_STATUSES as readonly string[]).includes(status)) return { ok: false, reason: "unknown_status" };

  return {
    ok: true,
    event: {
      event,
      eventId,
      occurredAt: text(root.occurred_at, 40),
      referenceId,
      status: status as SyncPayStatus,
      previousStatus: text(t.previous_status, 40),
      paymentMethod: text(t.payment_method, 20),
      amount: num(t.amount),
      netAmount: num(t.net_amount),
      description: text(t.description, 300),
      endToEndId: text(t.end_to_end_id, 80),
      paidAt: text(t.paid_at, 40),
    },
  };
}

/** O que vai para `payment_events.payload` (LGPD): sem nome, e-mail, documento, telefone nem conta pagadora. */
export function minimizeEvent(event: TransactionEvent): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    event: event.event,
    reference_id: event.referenceId,
    status: event.status,
    amount: event.amount,
  };
  if (event.previousStatus) payload.previous_status = event.previousStatus;
  if (event.paymentMethod) payload.payment_method = event.paymentMethod;
  if (event.netAmount !== null) payload.net_amount = event.netAmount;
  if (event.endToEndId) payload.end_to_end_id = event.endToEndId;
  if (event.occurredAt) payload.occurred_at = event.occurredAt;
  if (event.paidAt) payload.paid_at = event.paidAt;
  return payload;
}

const REFERENCE = /PRIMEGES:([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})/;

/** Acha o id do pagamento interno na descrição da cobrança (`... PRIMEGES:<uuid>`), quando o reference_id ainda não foi gravado. */
export function paymentIdFromDescription(description: string | null | undefined): string | null {
  const match = REFERENCE.exec(description ?? "");
  return match ? match[1]!.toLowerCase() : null;
}
