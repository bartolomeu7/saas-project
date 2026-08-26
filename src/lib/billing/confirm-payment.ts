import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { getPixCharge, EvoPayError } from "@/lib/evopay/client";
import { mapEvoPayStatus } from "@/lib/billing/mappers";
import { AUDIT_ACTIONS } from "@/types/audit";
import type { Database, Json } from "@/types/supabase";
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
 * Idempotente via payment_events (provider, event_id) — event_id
 * sintético "{transactionId}:{status}", conforme a própria EvoPay
 * recomenda na documentação para deduplicar.
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

  const { data: existingEvent } = await supabase
    .from("payment_events")
    .select("id, processed")
    .eq("provider", "evopay")
    .eq("event_id", eventId)
    .maybeSingle();

  if (existingEvent?.processed) {
    return { ok: true, status: newStatus };
  }

  if (!existingEvent) {
    await supabase.from("payment_events").insert({
      provider: "evopay",
      event_id: eventId,
      event_type: "pix.status_check",
      payload: transaction as unknown as Json,
      subscription_payment_id: payment.id,
      processed: false,
    });
  }

  if (newStatus === payment.status) {
    await markEventProcessed(supabase, eventId);
    return { ok: true, status: newStatus };
  }

  const paymentUpdates: Database["public"]["Tables"]["subscription_payments"]["Update"] = {
    status: newStatus,
    end_to_end_id: transaction.endToEndId ?? payment.end_to_end_id,
  };
  if (newStatus === "paid" && !payment.paid_at) {
    paymentUpdates.paid_at = new Date().toISOString();
  }

  await supabase.from("subscription_payments").update(paymentUpdates).eq("id", payment.id);

  if (newStatus === "paid") {
    await activateOrRenewSubscription(supabase, {
      companyId: payment.company_id,
      planId: payment.plan_id,
    });
  }

  await markEventProcessed(supabase, eventId);

  const action = auditActionForStatus(newStatus);
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

  return { ok: true, status: newStatus };
}

async function markEventProcessed(
  supabase: ReturnType<typeof createAdminClient>,
  eventId: string
) {
  await supabase
    .from("payment_events")
    .update({ processed: true, processed_at: new Date().toISOString() })
    .eq("provider", "evopay")
    .eq("event_id", eventId);
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

/**
 * Ativa/renova a assinatura da empresa após pagamento confirmado.
 *
 * Regra de renovação (nunca perde dias restantes): se a subscription
 * atual ainda está com status válido (active/trialing) e expires_at no
 * futuro, a nova validade soma access_duration_days à expires_at
 * ATUAL. Caso contrário (expirada/cancelada), soma a partir de agora.
 * Sempre um UPDATE na linha existente — nunca um INSERT novo (a
 * empresa já tem sua subscription criada em create_company_with_owner).
 */
async function activateOrRenewSubscription(
  supabase: ReturnType<typeof createAdminClient>,
  { companyId, planId }: { companyId: string; planId: string }
) {
  const { data: plan } = await supabase
    .from("plans")
    .select("*")
    .eq("id", planId)
    .maybeSingle();

  if (!plan || plan.access_duration_days == null) {
    return;
  }

  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("company_id", companyId)
    .maybeSingle();

  const now = new Date();
  const durationMs = plan.access_duration_days * 24 * 60 * 60 * 1000;

  let baseDate = now;
  if (subscription) {
    const currentExpiresAt = new Date(subscription.expires_at);
    const isCurrentlyValid =
      (subscription.status === "active" || subscription.status === "trialing") &&
      currentExpiresAt.getTime() > now.getTime();
    if (isCurrentlyValid) {
      baseDate = currentExpiresAt;
    }
  }

  const newExpiresAt = new Date(baseDate.getTime() + durationMs);

  if (subscription) {
    await supabase
      .from("subscriptions")
      .update({
        plan_id: plan.id,
        status: "active",
        expires_at: newExpiresAt.toISOString(),
        provider: "evopay",
      })
      .eq("company_id", companyId);
  } else {
    await supabase.from("subscriptions").insert({
      company_id: companyId,
      plan_id: plan.id,
      status: "active",
      starts_at: now.toISOString(),
      expires_at: newExpiresAt.toISOString(),
      provider: "evopay",
    });
  }

  await supabase.from("company_entitlements").upsert(
    {
      company_id: companyId,
      plan_id: plan.id,
      status: "active",
      access_starts_at: subscription?.starts_at ?? now.toISOString(),
      access_expires_at: newExpiresAt.toISOString(),
      max_additional_users: plan.additional_user_limit,
      support_enabled: plan.support_enabled,
      tickets_enabled: plan.tickets_enabled,
      exclusive_groups_enabled: plan.exclusive_groups_enabled,
      early_access_enabled: plan.early_access_enabled,
    },
    { onConflict: "company_id" }
  );
}
