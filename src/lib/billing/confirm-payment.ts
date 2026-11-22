import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { getTransaction, SyncPayError } from "@/lib/syncpay/client";
import { mapSyncPayStatus } from "@/lib/syncpay/webhook";
import { rejectionMessage, toCents } from "@/lib/billing/amount";
import { AUDIT_ACTIONS } from "@/types/audit";
import type { Json } from "@/types/supabase";
import type { SubscriptionPaymentStatus } from "@/types/billing";

export interface ConfirmPaymentResult {
  ok: boolean;
  status: SubscriptionPaymentStatus;
  message?: string;
  /** true quando o banco não respondeu (erro transitório): quem chama o webhook devolve 5xx para o provedor tentar de novo. */
  transient?: boolean;
}

/** Atualização de status vinda do provedor (webhook assinado ou consulta de contingência). */
export interface ProviderUpdate {
  /** `reference_id` da transação na SyncPay. */
  providerTransactionId: string;
  /** Chave de idempotência do evento (webhook: `event_id`; consulta: `<reference_id>:<status>`). */
  eventId: string;
  eventType: string;
  /** Status já mapeado para o enum interno. */
  status: SubscriptionPaymentStatus;
  /** Status original do provedor (só para auditoria). */
  providerStatus: string;
  /** Valor BRUTO pago em reais; ausente/ilegível => o banco recusa um "paid". */
  amount: number | null;
  endToEndId: string | null;
  /** Já minimizado (sem dados pessoais): vai para payment_events.payload. */
  payload: Record<string, unknown>;
}

/**
 * Máximo de consultas de contingência por pagamento. A SyncPay aceita 5 por transação (V1+V2 somadas) e responde 429 a
 * partir da 6ª; guardamos uma de folga. O caminho normal é o webhook assinado.
 */
export const MAX_STATUS_CHECKS = 4;

/** Antes disso o botão "Já paguei" não consulta o provedor: o webhook costuma chegar em segundos e cada consulta é contada. */
export const MIN_CHECK_AGE_SECONDS = 120;

export interface ConfirmPaymentOptions {
  /** Reconsulta o provedor mesmo com o pagamento local já "paid" (detectar estorno). Webhook e admin passam true. */
  recheckPaid?: boolean;
  /** Idade mínima do pagamento para consultar o provedor (padrão 120 s). O painel admin passa 0. */
  minAgeSeconds?: number;
}

/**
 * Aplica uma atualização do provedor ao pagamento. Toda a decisão (status, valor ao centavo, idempotência por evento,
 * renovação do acesso) é da função de banco `confirm_subscription_payment` (SECURITY DEFINER, só service_role), que trava
 * a linha do pagamento: duas confirmações simultâneas do MESMO pagamento não concedem o período em dobro.
 *
 * O webhook chega aqui já com a assinatura HMAC conferida; o valor (bruto) vem do evento e o banco só concede se for igual
 * ao valor gravado no servidor ao criar a cobrança. Valor ausente ou divergente => nenhuma concessão e auditoria.
 */
export async function applyProviderUpdate(paymentId: string, update: ProviderUpdate): Promise<ConfirmPaymentResult> {
  const supabase = createAdminClient();

  const { data: payment } = await supabase.from("subscription_payments").select("*").eq("id", paymentId).maybeSingle();
  if (!payment) return { ok: false, status: "pending", message: "Pagamento não encontrado." };
  if (payment.provider !== "syncpay") return { ok: false, status: payment.status, message: "Pagamento de outro provedor." };

  // O evento tem que ser da transação deste pagamento. Sem id gravado ainda (cartão cujo 200 veio sem transaction_id), o
  // vínculo é feito agora — o índice único (provider, provider_transaction_id) impede duas linhas com a mesma transação.
  if (payment.provider_transaction_id && payment.provider_transaction_id !== update.providerTransactionId) {
    return { ok: false, status: payment.status, message: "Divergência ao confirmar a cobrança." };
  }
  if (!payment.provider_transaction_id) {
    const { error: linkError } = await supabase
      .from("subscription_payments")
      .update({ provider_transaction_id: update.providerTransactionId, external_reference: payment.external_reference ?? `PRIMEGES:${payment.id}` })
      .eq("id", payment.id)
      .is("provider_transaction_id", null);
    if (linkError) return { ok: false, status: payment.status, message: "Não foi possível vincular a transação.", transient: true };
  }

  const providerCents = toCents(update.amount);
  const { data: rpcRows, error: rpcError } = await supabase.rpc("confirm_subscription_payment", {
    p_payment_id: payment.id,
    p_provider_status: update.status,
    // O parâmetro SQL aceita NULL de propósito; o gerador de tipos não expressa nullability de argumentos de função.
    p_end_to_end_id: (update.endToEndId ?? null) as unknown as string,
    p_event_id: update.eventId,
    p_event_type: update.eventType,
    p_event_payload: update.payload as unknown as Json,
    p_provider_amount: providerCents === null ? undefined : providerCents / 100,
  });

  if (rpcError) return { ok: false, status: payment.status, message: "Não foi possível confirmar o pagamento agora.", transient: true };

  const result = rpcRows?.[0];
  if (!result || result.not_found) return { ok: false, status: "pending", message: "Pagamento não encontrado." };

  if (result.rejection) {
    await supabase.from("audit_logs").insert({
      company_id: payment.company_id,
      entity_type: "subscription_payment",
      entity_id: payment.id,
      action: AUDIT_ACTIONS.PAYMENT_CONFIRMATION_REJECTED,
      metadata: { reason: result.rejection, provider_transaction_id: update.providerTransactionId, provider_status: update.providerStatus },
    });
    return { ok: false, status: payment.status, message: rejectionMessage(result.rejection) };
  }

  // Evento repetido e "status não mudou" não geram nova auditoria: só o primeiro processamento real de cada mudança grava.
  if (!result.already_processed && result.new_status !== payment.status) {
    const action = auditActionForStatus(result.new_status);
    if (action) {
      await supabase.from("audit_logs").insert({
        company_id: payment.company_id,
        entity_type: "subscription_payment",
        entity_id: payment.id,
        action,
        metadata: { provider_transaction_id: update.providerTransactionId, provider_status: update.providerStatus },
      });
    }
  }

  return { ok: result.ok, status: result.new_status };
}

/**
 * Consulta de CONTINGÊNCIA ("Já paguei", reverificação do admin, reconciliação): pergunta o status ao provedor. Não é o
 * caminho normal (esse é o webhook) e cada pagamento só pode ser consultado MAX_STATUS_CHECKS vezes: o contador é
 * incrementado no banco ANTES da chamada (atômico), então cliques simultâneos nunca estouram o limite da SyncPay.
 */
export async function confirmPaymentFromProvider(paymentId: string, options: ConfirmPaymentOptions = {}): Promise<ConfirmPaymentResult> {
  const supabase = createAdminClient();

  const { data: payment } = await supabase.from("subscription_payments").select("*").eq("id", paymentId).maybeSingle();
  if (!payment) return { ok: false, status: "pending", message: "Pagamento não encontrado." };

  if (payment.status === "refunded") return { ok: true, status: "refunded" };
  if (payment.status === "paid" && !options.recheckPaid) return { ok: true, status: "paid" };

  if (payment.provider !== "syncpay") {
    return { ok: false, status: payment.status, message: "Este pagamento é de um provedor anterior e não pode ser reverificado." };
  }
  if (!payment.provider_transaction_id) {
    return {
      ok: false,
      status: payment.status,
      message: payment.charge_method === "card" ? "Aguardando a confirmação do cartão pelo banco." : "A cobrança ainda não foi criada no provedor.",
    };
  }

  const minAge = options.minAgeSeconds ?? MIN_CHECK_AGE_SECONDS;
  const ageSeconds = (Date.now() - new Date(payment.created_at).getTime()) / 1000;
  if (ageSeconds < minAge) {
    return { ok: false, status: payment.status, message: "Aguarde alguns instantes: a confirmação chega automaticamente assim que o banco avisar." };
  }

  // reserva uma consulta (atômico): só avança se ainda houver saldo
  const { data: reserved } = await supabase
    .from("subscription_payments")
    .update({ status_checks: payment.status_checks + 1 })
    .eq("id", payment.id)
    .eq("status_checks", payment.status_checks)
    .lt("status_checks", MAX_STATUS_CHECKS)
    .select("id")
    .maybeSingle();
  if (!reserved) {
    return { ok: false, status: payment.status, message: "A confirmação ainda não chegou. Ela é automática: se você já pagou, aguarde alguns minutos ou fale com o suporte." };
  }

  let snapshot;
  try {
    snapshot = await getTransaction(payment.provider_transaction_id);
  } catch (error) {
    const rateLimited = error instanceof SyncPayError && error.status === 429;
    return {
      ok: false,
      status: payment.status,
      message: rateLimited ? "A confirmação ainda não chegou. Aguarde alguns minutos." : "Não foi possível consultar o status agora.",
    };
  }

  if (snapshot.referenceId !== payment.provider_transaction_id) {
    return { ok: false, status: payment.status, message: "Divergência ao confirmar a cobrança." };
  }

  const status = mapSyncPayStatus(snapshot.status);
  if (!status) return { ok: false, status: payment.status, message: "Situação desconhecida no provedor." };

  return applyProviderUpdate(payment.id, {
    providerTransactionId: snapshot.referenceId,
    eventId: `${snapshot.referenceId}:${snapshot.status}`,
    eventType: "transaction.status_check",
    status,
    providerStatus: snapshot.status,
    amount: snapshot.amount,
    endToEndId: snapshot.endToEndId,
    payload: { reference_id: snapshot.referenceId, status: snapshot.status, amount: snapshot.amount, ...(snapshot.endToEndId ? { end_to_end_id: snapshot.endToEndId } : {}) },
  });
}

function auditActionForStatus(status: SubscriptionPaymentStatus): string | null {
  switch (status) {
    case "paid":
      return AUDIT_ACTIONS.PAYMENT_PAID;
    case "expired":
      return AUDIT_ACTIONS.PAYMENT_EXPIRED;
    case "cancelled":
      return AUDIT_ACTIONS.PAYMENT_CANCELLED;
    case "failed":
      return AUDIT_ACTIONS.PAYMENT_FAILED;
    case "refunded":
      return AUDIT_ACTIONS.PAYMENT_REFUNDED;
    default:
      return null;
  }
}
