import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { confirmPaymentFromProvider } from "@/lib/billing/confirm-payment";

type DeliveryOutcome = "processed" | "payment_not_found" | "error";

/**
 * Registra a entrega para o painel (/admin/integrations). Guarda só o resultado e
 * o id externo — NUNCA o payload bruto, documento do pagador nem qualquer segredo.
 * Falha de log jamais pode impedir a resposta 2xx ao provedor.
 */
async function recordDelivery(delivery: {
  externalId: string | null;
  paymentId: string | null;
  outcome: DeliveryOutcome;
  detail?: string;
}) {
  try {
    await createAdminClient().from("webhook_deliveries").insert({
      provider: "evopay",
      external_id: delivery.externalId?.slice(0, 200) ?? null,
      payment_id: delivery.paymentId,
      outcome: delivery.outcome,
      detail: delivery.detail?.slice(0, 300) ?? null,
    });
  } catch {
    console.error("[webhook] não foi possível registrar a entrega.");
  }
}

/**
 * Webhook público da EvoPay (https://primeges.com.br/api/webhooks/evopay).
 *
 * A EvoPay não assina os webhooks (sem HMAC/secret) e faz uma única
 * tentativa de entrega, sem retry automático — por isso: (1) nunca
 * confiamos no payload para decidir o status, apenas usamos o `id` para
 * localizar o pagamento; (2) toda a confirmação real acontece em
 * confirmPaymentFromProvider, que refaz um GET /pix?id= server-to-server
 * antes de gravar qualquer status; (3) sempre respondemos 2xx rapidamente
 * (mesmo quando não encontramos o pagamento), para não gerar
 * reprocessamento externo que a EvoPay nem tentaria.
 *
 * O payload documentado (evento de depósito) não inclui external_reference
 * — apenas `id`, `type`, `status`, `amount`, `endToEndId`, `payerDocument`,
 * `payerName` — por isso a localização é sempre por
 * provider_transaction_id, nunca por external_reference aqui.
 *
 * Cada entrega é registrada em webhook_deliveries (resultado + id externo, sem
 * payload) para observabilidade. Como a EvoPay não reenvia, o "reprocessamento"
 * seguro é a reverificação manual no painel (idempotente via payment_events).
 */
export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  const transactionId = typeof payload?.id === "string" ? payload.id : null;

  // Payload sem id não identifica nada: não vira registro (o endpoint é público e não
  // assinado; só entregas que apontam para uma transação entram no histórico).
  if (!transactionId) {
    return NextResponse.json({ received: true });
  }

  const admin = createAdminClient();
  const { data: payment } = await admin
    .from("subscription_payments")
    .select("id")
    .eq("provider", "evopay")
    .eq("provider_transaction_id", transactionId)
    .maybeSingle();

  if (!payment) {
    await recordDelivery({
      externalId: transactionId,
      paymentId: null,
      outcome: "payment_not_found",
      detail: "Nenhum pagamento local com este id de transação.",
    });
    return NextResponse.json({ received: true });
  }

  let outcome: DeliveryOutcome = "processed";
  let detail: string | undefined;
  try {
    // recheckPaid: uma entrega depois do pagamento pode ser o estorno — sempre reconsulta o provedor.
    const result = await confirmPaymentFromProvider(payment.id, { recheckPaid: true });
    if (!result.ok) {
      outcome = "error";
      detail = result.message ?? "Não foi possível confirmar o pagamento.";
    } else {
      detail = `Status confirmado na EvoPay: ${result.status}.`;
    }
  } catch {
    outcome = "error";
    detail = "Erro inesperado ao confirmar o pagamento.";
  }

  await recordDelivery({ externalId: transactionId, paymentId: payment.id, outcome, detail });

  return NextResponse.json({ received: true });
}
