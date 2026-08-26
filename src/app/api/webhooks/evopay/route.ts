import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { confirmPaymentFromProvider } from "@/lib/billing/confirm-payment";

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
 */
export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  const transactionId = typeof payload?.id === "string" ? payload.id : null;

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
    return NextResponse.json({ received: true });
  }

  await confirmPaymentFromProvider(payment.id);

  return NextResponse.json({ received: true });
}
