import { NextResponse } from "next/server";
import { createSessionClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentCompany } from "@/lib/companies/queries";
import { getCurrentUser } from "@/lib/auth/session";
import { ACCOUNT_BLOCKED_MESSAGE, AccountInactiveError } from "@/lib/auth/account-status";
import { writeAuditLog } from "@/lib/audit/log";
import { AUDIT_ACTIONS } from "@/types/audit";
import { createPaymentSchema } from "@/lib/validations/billing";
import { cardCheckoutConfig, createPixCharge as createSyncPayPix, SyncPayError } from "@/lib/syncpay/client";
import { createPixCharge as createMisticPayPix, MisticPayError } from "@/lib/misticpay/client";
import { buildWebhookUrl } from "@/lib/misticpay/webhook";
import { buildExternalReference } from "@/types/billing";
import { buildBuyer, incompleteProfileMessage, siteOrigin } from "@/lib/billing/buyer";
import { providerFailureNote } from "@/lib/syncpay/errors";
import { gatewayConfigured, getActiveGateway } from "@/lib/billing/gateway";
import { siteConfig } from "@/config/site";

/**
 * Cria (ou REAPROVEITA) a cobrança da assinatura da empresa do usuário logado, no gateway ATIVO (MisticPay ou SyncPay,
 * escolha do super administrador): Pix em ambos; cartão só na SyncPay.
 *
 * Nunca confia em preço/company_id vindos do frontend: o plan_id é validado e o preço é sempre lido de public.plans no
 * momento da chamada. subscription_payments não tem policy de INSERT para `authenticated` (só service_role escreve) — por
 * isso as escritas usam createAdminClient().
 *
 * Idempotência (mesma intenção = empresa + plano + forma): a reserva é feita no banco por claim_gateway_payment() (advisory
 * lock + índice parcial único de UMA cobrança aberta por empresa+plano+forma). Repetição após timeout, clique duplo ou
 * chamadas simultâneas devolvem a MESMA cobrança em vez de criar outra.
 *  - Pix: a cobrança é criada aqui (SyncPay: POST /cash-in; MisticPay: POST /transactions/create) e a tela mostra o QR Code.
 *  - Cartão: aqui só nasce a reserva; a cobrança acontece em /api/billing/pay-card, com o token do iFrame da SyncPay.
 * Os gateways exigem nome e CPF/CNPJ válido do comprador (a SyncPay também e-mail e telefone): saem do cadastro da empresa
 * (nunca do navegador).
 */
export async function POST(request: Request) {
  let current, user;
  try {
    [current, user] = await Promise.all([getCurrentCompany(), getCurrentUser()]);
  } catch (error) {
    if (error instanceof AccountInactiveError) {
      return NextResponse.json({ error: ACCOUNT_BLOCKED_MESSAGE }, { status: 403 });
    }
    throw error;
  }
  if (!current || !user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  if (current.role !== "owner" && current.role !== "admin") {
    return NextResponse.json({ error: "Apenas o proprietário ou administradores podem contratar ou renovar o plano." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = createPaymentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Plano inválido." }, { status: 400 });
  }
  const method = parsed.data.method;

  const gateway = await getActiveGateway();
  if (method === "card" && !(gateway === "syncpay" && cardCheckoutConfig().enabled)) {
    return NextResponse.json({ error: "O pagamento por cartão não está disponível no momento. Use o Pix." }, { status: 400 });
  }
  if (!gatewayConfigured(gateway)) {
    console.error(`[billing] gateway ativo (${gateway}) sem credenciais neste ambiente.`);
    return NextResponse.json({ error: "O pagamento online não está disponível no momento. Tente novamente mais tarde ou fale com o suporte." }, { status: 503 });
  }

  const supabase = await createSessionClient();
  const { data: plan } = await supabase.from("plans").select("*").eq("id", parsed.data.planId).eq("status", "active").maybeSingle();

  if (!plan) {
    return NextResponse.json({ error: "Plano não encontrado." }, { status: 404 });
  }
  if (plan.trial || (plan.price != null && Number(plan.price) <= 0)) {
    return NextResponse.json({ error: "O teste grátis não é contratado: ele é concedido automaticamente." }, { status: 400 });
  }
  if (plan.lifetime) {
    return NextResponse.json({ error: "O acesso vitalício é concedido pelo suporte e não é contratado por aqui." }, { status: 400 });
  }
  if (plan.code === "CUSTOM" || plan.price == null || plan.access_duration_days == null) {
    return NextResponse.json({ error: "Este plano é sob consulta — entre em contato com o suporte para um orçamento." }, { status: 400 });
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

  const admin = createAdminClient();

  const { data: claimRows, error: claimError } = await admin.rpc("claim_gateway_payment", {
    p_company_id: current.company.id,
    p_plan_id: plan.id,
    p_amount: Number(plan.price),
    p_currency: plan.currency,
    p_method: method,
    p_provider: gateway,
  });
  const reservation = claimRows?.[0] ?? null;
  if (claimError || !reservation) {
    return NextResponse.json({ error: "Não foi possível iniciar o pagamento." }, { status: 500 });
  }

  const paymentId = reservation.payment_id;

  if (!reservation.created) {
    if (!reservation.has_charge) {
      // Outra requisição da mesma intenção está criando a cobrança neste instante.
      return NextResponse.json({ error: "Seu pagamento já está sendo preparado. Aguarde alguns segundos e tente novamente.", code: "PAYMENT_IN_PROGRESS" }, { status: 409 });
    }
    // Já existe cobrança aberta: reaproveita. O status real chega pelo webhook; não se reconsulta o provedor (limite de 5 por transação).
    return NextResponse.json({ paymentId, reused: true });
  }

  if (method === "card") {
    await writeAuditLog(admin, {
      companyId: current.company.id,
      actorUserId: user.id,
      entityType: "subscription_payment",
      entityId: paymentId,
      action: AUDIT_ACTIONS.PAYMENT_CREATED,
      metadata: { plan_code: plan.code, method: "card" },
    });
    return NextResponse.json({ paymentId });
  }

  const externalReference = buildExternalReference(paymentId);

  try {
    let charge: { identifier: string; pixCode: string };
    if (gateway === "misticpay") {
      const webhookUrl = buildWebhookUrl(siteOrigin(siteConfig.url), process.env.MISTICPAY_WEBHOOK_TOKEN);
      if (!webhookUrl) throw new Error("Webhook da MisticPay sem URL/token válidos.");
      const created = await createMisticPayPix({
        amount: Number(plan.price),
        transactionId: paymentId,
        description: `Prime Ges ${plan.code}`.slice(0, 120),
        payerName: buyerResult.buyer.name,
        payerDocument: buyerResult.buyer.document,
        webhookUrl,
      });
      charge = { identifier: created.transactionId, pixCode: created.pixCode };
    } else {
      charge = await createSyncPayPix({
        amount: Number(plan.price),
        description: `Prime Ges ${plan.code} ${externalReference}`.slice(0, 120),
        buyer: buyerResult.buyer,
      });
    }

    const { error: updateError } = await admin
      .from("subscription_payments")
      .update({
        provider_transaction_id: charge.identifier,
        external_reference: externalReference,
        pix_qr_code_text: charge.pixCode,
      })
      .eq("id", paymentId);

    if (updateError) {
      return NextResponse.json({ error: "Cobrança criada, mas houve um problema ao salvar os dados. Tente novamente." }, { status: 500 });
    }

    await writeAuditLog(admin, {
      companyId: current.company.id,
      actorUserId: user.id,
      entityType: "subscription_payment",
      entityId: paymentId,
      action: AUDIT_ACTIONS.PAYMENT_CREATED,
      metadata: { plan_code: plan.code, method: "pix", provider: gateway, provider_transaction_id: charge.identifier },
    });

    return NextResponse.json({ paymentId });
  } catch (error) {
    // Libera a vaga: a reserva só fica "pending" enquanto há chance de existir cobrança no provedor.
    const providerError = error instanceof SyncPayError || error instanceof MisticPayError;
    const note = providerError ? providerFailureNote(error.status, error.message) : "Erro inesperado ao criar a cobrança.";
    await admin.from("subscription_payments").update({ status: "failed", notes: note }).eq("id", paymentId);

    if (providerError) {
      // 401/403/422/500 aqui costumam ser configuração da conta (credenciais, IP não autorizado, conta não aprovada, Pix não habilitado):
      // o motivo exato vai para o log do servidor e para as observações do pagamento (painel admin), sem dados do usuário.
      const code = error.code ? ` [${error.code}]` : "";
      console.error(`[billing] ${gateway} recusou a criação do Pix${code}. ${note}`);
    }
    const message = providerError ? "Não foi possível gerar o Pix agora. Tente novamente em instantes." : "Erro inesperado ao gerar o pagamento.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
