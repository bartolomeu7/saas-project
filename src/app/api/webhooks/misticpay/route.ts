import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyMisticPayment } from "@/lib/billing/confirm-payment";
import { parseDepositNotice, paymentIdFromNotice, verifyWebhookToken, MIN_WEBHOOK_TOKEN_LENGTH } from "@/lib/misticpay/webhook";

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
      provider: "misticpay",
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
 * Webhook público da MisticPay (https://primeges.com.br/api/webhooks/misticpay?token=…), Pix.
 *
 * A MisticPay NÃO assina os webhooks. Defesa em duas camadas:
 *  1. o `token` da URL (MISTICPAY_WEBHOOK_TOKEN, enviado em `projectWebhook` ao criar cada cobrança) é conferido em tempo
 *     constante ANTES de ler o corpo; token ausente/errado => 401 e nada é gravado nem consultado;
 *  2. o corpo NÃO é confiado: serve só para descobrir qual pagamento consultar. O servidor pergunta à MisticPay
 *     (`POST /transactions/check`, com a chave secreta) e é essa resposta — status e valor ao centavo — que decide.
 *     Um webhook forjado com o token vazado ainda não libera nada sem a MisticPay confirmar o pagamento.
 *
 * Idempotência: a consulta gera o evento `<transactionId>:<estado>` (payment_events é único por provedor + evento), então
 * entregas repetidas ou fora de ordem não concedem acesso em dobro. Falha transitória (banco ou consulta) => 503, para a
 * MisticPay tentar de novo; recusa de negócio (valor divergente etc.) => 200 (repetir não adiantaria), registrada no painel.
 */
export async function POST(request: Request) {
  const expected = process.env.MISTICPAY_WEBHOOK_TOKEN?.trim() ?? "";
  if (expected.length < MIN_WEBHOOK_TOKEN_LENGTH) {
    console.error("[webhook] MISTICPAY_WEBHOOK_TOKEN não configurado (ou curto demais): entrega recusada.");
    return NextResponse.json({ error: "Webhook não configurado." }, { status: 503 });
  }

  const token = new URL(request.url).searchParams.get("token");
  if (!verifyWebhookToken(token, expected).ok) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  let json: unknown = null;
  try {
    json = JSON.parse(await request.text());
  } catch {
    return NextResponse.json({ received: true });
  }

  const parsed = parseDepositNotice(json);
  if (!parsed.ok) {
    // saques, infrações (MED) e formatos desconhecidos são aceitos e ignorados: o provedor não deve repetir
    return NextResponse.json({ received: true, ignored: parsed.reason });
  }
  const { transactionId } = parsed.notice;

  const admin = createAdminClient();
  let paymentId: string | null = null;
  const { data: byTransaction } = await admin
    .from("subscription_payments")
    .select("id")
    .eq("provider", "misticpay")
    .eq("provider_transaction_id", transactionId)
    .maybeSingle();
  paymentId = byTransaction?.id ?? null;

  if (!paymentId) {
    const ours = paymentIdFromNotice(transactionId);
    if (ours) {
      const { data: byId } = await admin.from("subscription_payments").select("id").eq("provider", "misticpay").eq("id", ours).maybeSingle();
      paymentId = byId?.id ?? null;
    }
  }

  if (!paymentId) {
    // transação da conta MisticPay que não é de assinatura do Prime Ges (a conta pode vender outras coisas)
    await recordDelivery({ externalId: transactionId, paymentId: null, outcome: "payment_not_found", detail: "Nenhum pagamento local com esta transação." });
    return NextResponse.json({ received: true });
  }

  let outcome: DeliveryOutcome = "processed";
  let detail: string | undefined;
  let transient = false;
  try {
    const result = await verifyMisticPayment(paymentId);
    if (!result.ok) {
      outcome = "error";
      detail = result.message ?? "Não foi possível confirmar o pagamento.";
      transient = result.transient === true;
    } else {
      detail = `Situação confirmada na MisticPay: ${result.status}.`;
    }
  } catch {
    outcome = "error";
    detail = "Erro inesperado ao confirmar o pagamento.";
    transient = true;
  }

  await recordDelivery({ externalId: transactionId, paymentId, outcome, detail });

  if (transient) return NextResponse.json({ error: "Tente novamente." }, { status: 503 });
  return NextResponse.json({ received: true });
}
