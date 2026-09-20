import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { getPixCharge, EvoPayError } from "@/lib/evopay/client";
import { mapEvoPayStatus } from "@/lib/billing/mappers";
import { AUDIT_ACTIONS } from "@/types/audit";
import type { Json } from "@/types/supabase";
import type { SubscriptionPaymentStatus } from "@/types/billing";

export interface ConfirmPaymentResult {
  ok: boolean;
  status: SubscriptionPaymentStatus;
  message?: string;
}

/**
 * Único ponto de confirmação de pagamento Pix — chamado tanto pelo
 * webhook (POST /api/webhooks/evopay) quanto pela ação "Já paguei"
 * (checkPaymentNowAction). NUNCA confia no payload recebido: sempre
 * refaz a consulta GET /pix?id= diretamente na EvoPay usando o
 * provider_transaction_id já salvo no nosso banco (não o que veio no
 * payload), pois a EvoPay não assina os webhooks.
 *
 * A decisão de status + gravação + idempotência + renovação de assinatura
 * é TODA delegada à função de banco `confirm_subscription_payment`
 * (migration 019, SECURITY DEFINER, restrita a service_role), que trava a
 * linha do pagamento com FOR UPDATE antes de decidir qualquer coisa — só
 * assim duas confirmações concorrentes do MESMO pagamento (webhook
 * duplicado, "Já paguei" clicado ao mesmo tempo em que o webhook chega,
 * reenvio de webhook) não conseguem conceder o período pago em dobro.
 * Esta função em TypeScript só cuida do que só pode ser feito aqui: a
 * chamada HTTP real à EvoPay.
 */
export async function confirmPaymentFromProvider(
  paymentId: string
): Promise<ConfirmPaymentResult> {
  const supabase = createAdminClient();

  const { data: payment } = await supabase
    .from("subscription_payments")
    .select("*")
    .eq("id", paymentId)
    .maybeSingle();

  if (!payment) {
    return { ok: false, status: "pending", message: "Pagamento não encontrado." };
  }

  if (payment.status === "paid") {
    return { ok: true, status: "paid" };
  }

  if (!payment.provider_transaction_id) {
    return {
      ok: false,
      status: payment.status,
      message: "A cobrança ainda não foi criada na EvoPay.",
    };
  }

  let transaction;
  try {
    transaction = await getPixCharge(payment.provider_transaction_id);
  } catch (error) {
    const message =
      error instanceof EvoPayError
        ? "Não foi possível consultar o status na EvoPay agora."
        : "Erro inesperado ao consultar o pagamento.";
    return { ok: false, status: payment.status, message };
  }

  if (transaction.id !== payment.provider_transaction_id) {
    return {
      ok: false,
      status: payment.status,
      message: "Divergência ao confirmar a cobrança.",
    };
  }

  const newStatus = mapEvoPayStatus(transaction.status);
  const eventId = `${transaction.id}:${transaction.status}`;

  const { data: rpcRows, error: rpcError } = await supabase.rpc("confirm_subscription_payment", {
    p_payment_id: paymentId,
    p_provider_status: newStatus,
    // O parâmetro SQL aceita NULL de propósito (coalesce com o valor já
    // salvo) — o gerador de tipos do Supabase não expressa nullability de
    // argumentos de função, então o cast abaixo só contorna essa limitação
    // de tipagem, sem mudar o valor realmente enviado.
    p_end_to_end_id: (transaction.endToEndId ?? null) as unknown as string,
    p_event_id: eventId,
    p_event_type: "pix.status_check",
    p_event_payload: transaction as unknown as Json,
  });

  if (rpcError) {
    return {
      ok: false,
      status: payment.status,
      message: "Não foi possível confirmar o pagamento agora.",
    };
  }

  const result = rpcRows?.[0];
  if (!result || result.not_found) {
    return { ok: false, status: "pending", message: "Pagamento não encontrado." };
  }

  // already_processed=true (evento repetido já tratado) e "status não
  // mudou" (idempotência de estado) não geram nova auditoria — só o
  // primeiro processamento real de cada mudança de status grava o log.
  if (!result.already_processed && result.new_status !== payment.status) {
    const action = auditActionForStatus(result.new_status);
    if (action) {
      await supabase.from("audit_logs").insert({
        company_id: payment.company_id,
        entity_type: "subscription_payment",
        entity_id: payment.id,
        action,
        metadata: {
          provider_transaction_id: transaction.id,
          provider_status: transaction.status,
        },
      });
    }
  }

  return { ok: result.ok, status: result.new_status };
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
