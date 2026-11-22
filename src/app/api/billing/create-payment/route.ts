import { NextResponse } from "next/server";
import { createSessionClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentCompany } from "@/lib/companies/queries";
import { getCurrentUser } from "@/lib/auth/session";
import { ACCOUNT_BLOCKED_MESSAGE, AccountInactiveError } from "@/lib/auth/account-status";
import { writeAuditLog } from "@/lib/audit/log";
import { AUDIT_ACTIONS } from "@/types/audit";
import { createPaymentSchema } from "@/lib/validations/billing";
import { cardCheckoutConfig, createPixCharge, SyncPayError } from "@/lib/syncpay/client";
import { buildExternalReference } from "@/types/billing";
import { buildBuyer, incompleteProfileMessage } from "@/lib/billing/buyer";

/**
 * Cria (ou REAPROVEITA) a cobrança da assinatura da empresa do usuário logado, em Pix ou cartão (SyncPay).
 *
 * Nunca confia em preço/company_id vindos do frontend: o plan_id é validado e o preço é sempre lido de public.plans no
 * momento da chamada. subscription_payments não tem policy de INSERT para `authenticated` (só service_role escreve) — por
 * isso as escritas usam createAdminClient().
 *
 * Idempotência (mesma intenção = empresa + plano + forma): a reserva é feita no banco por claim_gateway_payment() (advisory
 * lock + índice parcial único de UMA cobrança aberta por empresa+plano+forma). Repetição após timeout, clique duplo ou
 * chamadas simultâneas devolvem a MESMA cobrança em vez de criar outra.
 *  - Pix: a cobrança é criada aqui (POST /cash-in) e a tela mostra o QR Code.
 *  - Cartão: aqui só nasce a reserva; a cobrança acontece em /api/billing/pay-card, com o token do iFrame da SyncPay.
 * A SyncPay exige nome, CPF/CNPJ válido, e-mail e telefone do comprador: saem do cadastro da empresa (nunca do navegador).
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

  if (method === "card" && !cardCheckoutConfig().enabled) {
    return NextResponse.json({ error: "O pagamento por cartão não está disponível no momento. Use o Pix." }, { status: 400 });
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
    const charge = await createPixCharge({
      amount: Number(plan.price),
      description: `Prime Ges ${plan.code} ${externalReference}`.slice(0, 120),
      buyer: buyerResult.buyer,
    });

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
      metadata: { plan_code: plan.code, method: "pix", provider_transaction_id: charge.identifier },
    });

    return NextResponse.json({ paymentId });
  } catch (error) {
    // Libera a vaga: a reserva só fica "pending" enquanto há chance de existir cobrança no provedor.
    await admin.from("subscription_payments").update({ status: "failed" }).eq("id", paymentId);

    if (error instanceof SyncPayError) {
      // 401/403/422 aqui costumam ser configuração (credenciais, IP não autorizado, conta ainda não aprovada): vai para o log do servidor, sem dados do usuário.
      console.error(`[billing] SyncPay recusou a criação do Pix (HTTP ${error.status}).`);
    }
    const message = error instanceof SyncPayError ? "Não foi possível gerar o Pix agora. Tente novamente em instantes." : "Erro inesperado ao gerar o pagamento.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
