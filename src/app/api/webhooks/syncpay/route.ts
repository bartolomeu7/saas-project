import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { applyProviderUpdate } from "@/lib/billing/confirm-payment";
import { mapSyncPayStatus, minimizeEvent, parseTransactionEvent, paymentIdFromDescription, verifySignature } from "@/lib/syncpay/webhook";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type DeliveryOutcome = "processed" | "payment_not_found" | "ignored" | "error";

/**
 * Registra a entrega para o painel (/admin/integrations). Guarda só o resultado e o id externo — NUNCA o corpo bruto,
 * dados do pagador nem segredo. Falha de log jamais impede a resposta ao provedor.
 */
async function recordDelivery(delivery: { externalId: string | null; paymentId: string | null; outcome: DeliveryOutcome; detail?: string }) {
  try {
    await createAdminClient().from("webhook_deliveries").insert({
      provider: "syncpay",
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
 * Webhook público da SyncPay (https://primeges.com.br/api/webhooks/syncpay), evento `transaction` (Pix e cartão).
 *
 * Segurança: a SyncPay assina cada entrega (`X-SyncPay-Signature: t=<unix>,v1=<hmac-sha256 de "t.corpo">`). O corpo é lido CRU
 * e a assinatura (e a janela de 5 minutos contra replay) é conferida ANTES de qualquer interpretação; assinatura ausente,
 * inválida ou vencida => 401 e nada é gravado (o endpoint é público, não vira vetor de lixo no banco).
 *
 * Idempotência: o `event_id` do corpo é a chave (payment_events é único por provedor + event_id) — o cabeçalho
 * `X-SyncPay-Delivery` muda a cada retentativa e não serve. Eventos podem chegar repetidos e fora de ordem: a função de banco
 * trata (pago nunca volta a pendente; estornado é terminal).
 *
 * O pagamento é achado pelo `reference_id` já gravado; se ainda não houver (cartão cujo 200 veio sem transaction_id), pela
 * referência `PRIMEGES:<uuid>` que vai na descrição da cobrança. Acesso só é liberado em `completed`, com o valor bruto igual
 * ao valor gravado no servidor (conferido no banco). Erro transitório do banco => 503 para o provedor tentar de novo; recusa
 * de negócio (valor divergente etc.) => 200 (repetir não adiantaria), registrada em webhook_deliveries e na auditoria.
 */
export async function POST(request: Request) {
  const secret = process.env.SYNCPAY_WEBHOOK_SECRET?.trim();
  if (!secret) {
    console.error("[webhook] SYNCPAY_WEBHOOK_SECRET não configurada: entrega recusada.");
    return NextResponse.json({ error: "Webhook não configurado." }, { status: 503 });
  }

  const rawBody = await request.text();
  const signature = verifySignature(request.headers.get("x-syncpay-signature"), rawBody, secret);
  if (!signature.ok) {
    return NextResponse.json({ error: "Assinatura inválida." }, { status: 401 });
  }

  let json: unknown = null;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ received: true });
  }

  const parsed = parseTransactionEvent(json);
  if (!parsed.ok) {
    // eventos de outros tipos (ou teste) são aceitos e ignorados: o provedor não deve repetir
    return NextResponse.json({ received: true, ignored: parsed.reason });
  }
  const event = parsed.event;

  const status = mapSyncPayStatus(event.status);
  const admin = createAdminClient();

  let paymentId: string | null = null;
  const { data: byTransaction } = await admin
    .from("subscription_payments")
    .select("id")
    .eq("provider", "syncpay")
    .eq("provider_transaction_id", event.referenceId)
    .maybeSingle();
  paymentId = byTransaction?.id ?? null;

  if (!paymentId) {
    const fromDescription = paymentIdFromDescription(event.description);
    if (fromDescription) {
      const { data: byReference } = await admin.from("subscription_payments").select("id").eq("provider", "syncpay").eq("id", fromDescription).maybeSingle();
      paymentId = byReference?.id ?? null;
    }
  }

  if (!paymentId) {
    // transação da conta SyncPay que não é de assinatura do Prime Ges (a conta pode vender outras coisas)
    await recordDelivery({ externalId: event.referenceId, paymentId: null, outcome: "payment_not_found", detail: "Nenhum pagamento local com esta transação." });
    return NextResponse.json({ received: true });
  }

  if (!status) {
    await recordDelivery({ externalId: event.referenceId, paymentId, outcome: "ignored", detail: `Situação não tratada: ${event.status}.` });
    return NextResponse.json({ received: true });
  }

  let outcome: DeliveryOutcome = "processed";
  let detail: string | undefined;
  let transient = false;
  try {
    const result = await applyProviderUpdate(paymentId, {
      provider: "syncpay",
      providerTransactionId: event.referenceId,
      eventId: event.eventId,
      eventType: event.event,
      status,
      providerStatus: event.status,
      amount: event.amount,
      endToEndId: event.endToEndId,
      payload: minimizeEvent(event),
    });
    if (!result.ok) {
      outcome = "error";
      detail = result.message ?? "Não foi possível confirmar o pagamento.";
      transient = result.transient === true;
    } else {
      detail = `Situação confirmada: ${event.status}.`;
    }
  } catch {
    outcome = "error";
    detail = "Erro inesperado ao confirmar o pagamento.";
    transient = true;
  }

  await recordDelivery({ externalId: event.referenceId, paymentId, outcome, detail });

  if (transient) return NextResponse.json({ error: "Tente novamente." }, { status: 503 });
  return NextResponse.json({ received: true });
}
