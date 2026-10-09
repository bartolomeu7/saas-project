import { NextResponse } from "next/server";
import { createSessionClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentCompany } from "@/lib/companies/queries";
import { getCurrentUser } from "@/lib/auth/session";
import { ACCOUNT_BLOCKED_MESSAGE, AccountInactiveError } from "@/lib/auth/account-status";
import { writeAuditLog } from "@/lib/audit/log";
import { AUDIT_ACTIONS } from "@/types/audit";
import { siteConfig } from "@/config/site";
import { createPaymentSchema } from "@/lib/validations/billing";
import { createPixCharge, EvoPayError } from "@/lib/evopay/client";
import { buildExternalReference } from "@/types/billing";
import { amountsMatch } from "@/lib/billing/amount";
import { confirmPaymentFromProvider } from "@/lib/billing/confirm-payment";

/**
 * Cria (ou REAPROVEITA) a cobrança Pix da assinatura da empresa do usuário logado.
 *
 * Nunca confia em preço/company_id vindos do frontend: o plan_id é validado e o preço é sempre lido
 * de public.plans no momento da chamada. subscription_payments não tem policy de INSERT para
 * `authenticated` (só service_role escreve) — por isso as escritas usam createAdminClient().
 *
 * Idempotência (a mesma intenção = mesma empresa + mesmo plano): a reserva é feita no banco por
 * claim_subscription_payment() (advisory lock + índice parcial único de UMA cobrança evopay
 * "pending" por empresa+plano). Repetição após timeout, clique duplo ou chamadas simultâneas devolvem
 * a MESMA cobrança em vez de criar outra. Uma nova compra legítima (outro plano, ou o mesmo plano
 * depois de a anterior expirar/cancelar/ser paga) gera uma nova cobrança.
 */
export async function POST(request: Request) {
  let current, user;
  try {
    [current, user] = await Promise.all([getCurrentCompany(), getCurrentUser()]);
  } catch (error) {
    // Conta inativa/suspensa não contrata nem renova plano.
    if (error instanceof AccountInactiveError) {
      return NextResponse.json({ error: ACCOUNT_BLOCKED_MESSAGE }, { status: 403 });
    }
    throw error;
  }
  if (!current || !user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  if (current.role !== "owner" && current.role !== "admin") {
    return NextResponse.json(
      { error: "Apenas o proprietário ou administradores podem contratar ou renovar o plano." },
      { status: 403 }
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = createPaymentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Plano inválido." }, { status: 400 });
  }

  const supabase = await createSessionClient();
  const { data: plan } = await supabase
    .from("plans")
    .select("*")
    .eq("id", parsed.data.planId)
    .eq("status", "active")
    .maybeSingle();

  if (!plan) {
    return NextResponse.json({ error: "Plano não encontrado." }, { status: 404 });
  }

  if (plan.code === "CUSTOM" || plan.price == null || plan.access_duration_days == null) {
    return NextResponse.json(
      { error: "Este plano é sob consulta — entre em contato com o suporte para um orçamento." },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  async function claim() {
    const { data, error } = await admin.rpc("claim_subscription_payment", {
      p_company_id: current!.company.id,
      p_plan_id: plan!.id,
      p_amount: Number(plan!.price),
      p_currency: plan!.currency,
    });
    return { claim: data?.[0] ?? null, error };
  }

  let { claim: reservation, error: claimError } = await claim();
  if (claimError || !reservation) {
    return NextResponse.json({ error: "Não foi possível iniciar o pagamento." }, { status: 500 });
  }

  if (!reservation.created) {
    if (!reservation.has_charge) {
      // Outra requisição da mesma intenção está criando a cobrança neste instante.
      return NextResponse.json(
        { error: "Seu pagamento já está sendo preparado. Aguarde alguns segundos e tente novamente.", code: "PAYMENT_IN_PROGRESS" },
        { status: 409 }
      );
    }

    // Já existe cobrança aberta no provedor: reconsulta para não reaproveitar um Pix expirado/pago.
    const refreshed = await confirmPaymentFromProvider(reservation.payment_id).catch(() => null);
    const stillOpen = !refreshed || !refreshed.ok || refreshed.status === "pending" || refreshed.status === "paid";
    if (stillOpen) {
      // Provedor indisponível => também reaproveita (evita cobrança duplicada com estado desconhecido).
      return NextResponse.json({ paymentId: reservation.payment_id, reused: true });
    }

    // A anterior terminou (expirada/cancelada/falha): a vaga foi liberada, cria uma nova.
    ({ claim: reservation, error: claimError } = await claim());
    if (claimError || !reservation) {
      return NextResponse.json({ error: "Não foi possível iniciar o pagamento." }, { status: 500 });
    }
    if (!reservation.created) {
      return NextResponse.json({ paymentId: reservation.payment_id, reused: true });
    }
  }

  const paymentId = reservation.payment_id;
  const externalReference = buildExternalReference(paymentId);

  try {
    const charge = await createPixCharge({
      amount: Number(plan.price),
      externalReference,
      callbackUrl: `${siteConfig.url}/api/webhooks/evopay`,
    });

    // O provedor tem que ter criado a cobrança exatamente no valor pedido; senão não existe QR para ninguém pagar.
    if (!amountsMatch(plan.price, charge.amount)) {
      await admin
        .from("subscription_payments")
        .update({ status: "failed", provider_transaction_id: charge.id ?? null, notes: "Valor da cobrança no provedor diferente do pedido." })
        .eq("id", paymentId);
      return NextResponse.json(
        { error: "Não foi possível gerar o Pix agora. Tente novamente em instantes." },
        { status: 502 }
      );
    }

    const { error: updateError } = await admin
      .from("subscription_payments")
      .update({
        provider_transaction_id: charge.id,
        external_reference: externalReference,
        amount_with_tax: charge.amountWithTax ?? null,
        tax_amount: charge.taxAmount ?? null,
        pix_qr_code_text: charge.qrCodeText ?? null,
        pix_qr_code_url: charge.qrCodeUrl ?? null,
      })
      .eq("id", paymentId);

    if (updateError) {
      return NextResponse.json(
        { error: "Cobrança criada, mas houve um problema ao salvar os dados. Tente novamente." },
        { status: 500 }
      );
    }

    await writeAuditLog(admin, {
      companyId: current.company.id,
      actorUserId: user.id,
      entityType: "subscription_payment",
      entityId: paymentId,
      action: AUDIT_ACTIONS.PAYMENT_CREATED,
      metadata: { plan_code: plan.code, provider_transaction_id: charge.id },
    });

    return NextResponse.json({ paymentId });
  } catch (error) {
    // Libera a vaga: a reserva só fica "pending" enquanto há chance de existir cobrança no provedor.
    await admin.from("subscription_payments").update({ status: "failed" }).eq("id", paymentId);

    const message =
      error instanceof EvoPayError
        ? "Não foi possível gerar o Pix agora. Tente novamente em instantes."
        : "Erro inesperado ao gerar o pagamento.";

    return NextResponse.json({ error: message }, { status: 502 });
  }
}
