import { NextResponse } from "next/server";
import { createSessionClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentCompany } from "@/lib/companies/queries";
import { getCurrentUser } from "@/lib/auth/session";
import { ACCOUNT_BLOCKED_MESSAGE, AccountInactiveError } from "@/lib/auth/account-status";
import { writeAuditLog } from "@/lib/audit/log";
import { AUDIT_ACTIONS } from "@/types/audit";
import { payCardSchema } from "@/lib/validations/billing";
import { cardCheckoutConfig, createCardCharge, SyncPayError } from "@/lib/syncpay/client";
import { buildBuyer, incompleteProfileMessage, isCardToken, siteOrigin } from "@/lib/billing/buyer";
import { buildExternalReference } from "@/types/billing";
import { readIpEnv, resolveClientIp } from "@/lib/security/client-ip";
import { siteConfig } from "@/config/site";

export const dynamic = "force-dynamic";

/** Tentativas de cartão por pagamento (cada uma usa um token novo do iFrame). */
const MAX_CARD_ATTEMPTS = 3;

/** IP do comprador para o antifraude: o confiável de TRUSTED_PROXY_HOPS; senão o que a Cloudflare (única porta de entrada) informa. */
function buyerIp(request: Request): string | null {
  const fromProxy = resolveClientIp(request.headers, readIpEnv());
  if (fromProxy) return fromProxy;
  const cf = request.headers.get("cf-connecting-ip")?.trim() ?? "";
  return /^[0-9a-fA-F:.]{3,45}$/.test(cf) ? cf : null;
}

/**
 * Cobra o cartão com o token de uso único gerado pelo iFrame da SyncPay (os dados do cartão nunca passam por aqui).
 *
 * Regras que importam (documentação da SyncPay):
 *  - o valor é o do PAGAMENTO salvo no banco, nunca o do navegador; só o token e o id do pagamento chegam do cliente;
 *  - `POST /credit-card` NÃO tem idempotência: um token novo para o mesmo pedido cria OUTRA cobrança. Por isso a tentativa é
 *    "reservada" no banco antes de chamar a SyncPay (card_submitted_at, atômico): no máximo uma cobrança em andamento por pagamento;
 *  - `200` quer dizer só "submetida"; nunca se retenta depois de 200 nem de 5xx/timeout — o resultado final vem pelo webhook
 *    (e só `completed` libera o acesso);
 *  - recusas definitivas (401/403/422/429: a cobrança NÃO existe) devolvem a vaga para o comprador tentar com outro cartão.
 */
export async function POST(request: Request) {
  let current, user;
  try {
    [current, user] = await Promise.all([getCurrentCompany(), getCurrentUser()]);
  } catch (error) {
    if (error instanceof AccountInactiveError) return NextResponse.json({ error: ACCOUNT_BLOCKED_MESSAGE }, { status: 403 });
    throw error;
  }
  if (!current || !user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (current.role !== "owner" && current.role !== "admin") {
    return NextResponse.json({ error: "Apenas o proprietário ou administradores podem pagar o plano." }, { status: 403 });
  }
  if (!cardCheckoutConfig().enabled) {
    return NextResponse.json({ error: "O pagamento por cartão não está disponível no momento. Use o Pix." }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const parsed = payCardSchema.safeParse(body);
  if (!parsed.success || !isCardToken(parsed.data.token)) {
    return NextResponse.json({ error: "Dados do cartão inválidos. Tente novamente." }, { status: 400 });
  }
  const { paymentId, token } = parsed.data;

  // O pagamento tem que ser da empresa do usuário (RLS) e estar aberto para cartão.
  const session = await createSessionClient();
  const { data: payment } = await session
    .from("subscription_payments")
    .select("id, amount, status, provider, charge_method, card_submitted_at, card_attempts, plan_id")
    .eq("id", paymentId)
    .eq("company_id", current.company.id)
    .maybeSingle();
  if (!payment || payment.provider !== "syncpay" || payment.charge_method !== "card") {
    return NextResponse.json({ error: "Pagamento não encontrado." }, { status: 404 });
  }
  if (payment.status !== "pending") {
    return NextResponse.json({ error: "Este pagamento não está mais aberto. Volte aos planos para gerar um novo." }, { status: 409 });
  }
  if (payment.card_submitted_at) {
    return NextResponse.json({ error: "Seu pagamento está sendo processado. Aguarde a confirmação.", code: "PAYMENT_IN_PROGRESS" }, { status: 409 });
  }
  if (payment.card_attempts >= MAX_CARD_ATTEMPTS) {
    return NextResponse.json({ error: "Número máximo de tentativas com cartão atingido. Use o Pix ou fale com o suporte." }, { status: 429 });
  }

  const buyerResult = buildBuyer({
    companyName: current.company.name,
    legalName: current.company.legal_name,
    document: current.company.document,
    phone: current.company.phone,
    whatsapp: current.company.whatsapp,
    companyEmail: current.company.email,
    userEmail: user.email,
  });
  if (!buyerResult.ok) {
    return NextResponse.json({ error: incompleteProfileMessage(buyerResult.missing), code: "BILLING_PROFILE_INCOMPLETE" }, { status: 422 });
  }

  const ip = buyerIp(request);
  const origin = siteOrigin(siteConfig.url);
  if (!ip || !origin) {
    return NextResponse.json({ error: "Não foi possível identificar a sua conexão. Tente novamente ou use o Pix." }, { status: 400 });
  }

  const admin = createAdminClient();

  // reserva a tentativa (atômico): só quem conseguir marcar card_submitted_at chama a SyncPay
  const { data: reserved } = await admin
    .from("subscription_payments")
    .update({ card_submitted_at: new Date().toISOString(), card_attempts: payment.card_attempts + 1 })
    .eq("id", payment.id)
    .eq("status", "pending")
    .is("card_submitted_at", null)
    .eq("card_attempts", payment.card_attempts)
    .select("id")
    .maybeSingle();
  if (!reserved) {
    return NextResponse.json({ error: "Seu pagamento está sendo processado. Aguarde a confirmação.", code: "PAYMENT_IN_PROGRESS" }, { status: 409 });
  }

  const externalReference = buildExternalReference(payment.id);
  const userAgent = (request.headers.get("user-agent") ?? "desconhecido").slice(0, 400);

  /** Devolve a vaga: a SyncPay recusou antes de criar qualquer cobrança. */
  async function release() {
    await admin.from("subscription_payments").update({ card_submitted_at: null }).eq("id", payment!.id).eq("status", "pending");
  }

  try {
    const result = await createCardCharge({
      amount: Number(payment.amount),
      description: `Prime Ges assinatura ${externalReference}`.slice(0, 120),
      cardToken: token,
      buyer: buyerResult.buyer,
      device: { ip, userAgent, pageUrl: `${origin}/app/assinatura/pagamento/${payment.id}`, metadata: { payment: payment.id } },
    });

    await admin
      .from("subscription_payments")
      .update({ external_reference: externalReference, ...(result.transactionId ? { provider_transaction_id: result.transactionId } : {}) })
      .eq("id", payment.id);

    await writeAuditLog(admin, {
      companyId: current.company.id,
      actorUserId: user.id,
      entityType: "subscription_payment",
      entityId: payment.id,
      action: AUDIT_ACTIONS.PAYMENT_CREATED,
      metadata: { method: "card", step: "charge_submitted", provider_transaction_id: result.transactionId },
    });

    return NextResponse.json({ status: "processing" });
  } catch (error) {
    if (!(error instanceof SyncPayError)) {
      // erro inesperado: não se sabe se a cobrança saiu — não libera a vaga nem retenta
      console.error("[billing] erro inesperado ao cobrar cartão.");
      return NextResponse.json({ error: "Estamos confirmando o seu pagamento. Se não for aprovado em alguns minutos, tente novamente.", code: "PAYMENT_UNKNOWN" }, { status: 202 });
    }

    console.error(`[billing] SyncPay respondeu HTTP ${error.status}${error.code ? ` (${error.code})` : ""} ao cobrar cartão.`);

    if (error.status === 409) {
      // token já usado: pode existir cobrança anterior — mantém a vaga fechada e espera o webhook
      return NextResponse.json({ error: "Seu pagamento está sendo processado. Aguarde a confirmação.", code: "PAYMENT_IN_PROGRESS" }, { status: 409 });
    }
    if (error.status === 422) {
      await release();
      return NextResponse.json({ error: "Não foi possível processar o pagamento com este cartão. Tente novamente ou use outro cartão." }, { status: 422 });
    }
    if (error.status === 403) {
      await release();
      return NextResponse.json({ error: "O pagamento não foi aceito pela análise de segurança. Use o Pix ou fale com o suporte." }, { status: 403 });
    }
    if (error.status === 401 || error.status === 429) {
      await release();
      return NextResponse.json({ error: "O pagamento por cartão está indisponível agora. Tente novamente em instantes ou use o Pix." }, { status: 503 });
    }
    // timeout (status 0) ou 5xx: resultado desconhecido — a SyncPay manda aguardar o webhook e NÃO retentar
    return NextResponse.json({ error: "Estamos confirmando o seu pagamento. Se não for aprovado em alguns minutos, tente novamente.", code: "PAYMENT_UNKNOWN" }, { status: 202 });
  }
}
