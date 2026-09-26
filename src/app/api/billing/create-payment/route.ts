import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentCompany } from "@/lib/companies/queries";
import { getCurrentUser } from "@/lib/auth/session";
import { writeAuditLog } from "@/lib/audit/log";
import { AUDIT_ACTIONS } from "@/types/audit";
import { siteConfig } from "@/config/site";
import { createPaymentSchema } from "@/lib/validations/billing";
import { createPixCharge, EvoPayError } from "@/lib/evopay/client";
import { buildExternalReference } from "@/types/billing";

/**
 * Cria uma cobrança Pix para a assinatura da empresa do usuário logado.
 *
 * Nunca confia em preço/company_id vindos do frontend: o plan_id é
 * validado e o preço é sempre lido de public.plans no momento da
 * chamada. subscription_payments não tem policy de INSERT para
 * `authenticated` (só service_role escreve) — por isso as escritas usam
 * createAdminClient(), nunca o client de sessão do usuário.
 */
export async function POST(request: Request) {
  const [current, user] = await Promise.all([getCurrentCompany(), getCurrentUser()]);
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

  const supabase = createClient();
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

  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("id")
    .eq("company_id", current.company.id)
    .maybeSingle();

  const admin = createAdminClient();

  const { data: payment, error: insertError } = await admin
    .from("subscription_payments")
    .insert({
      company_id: current.company.id,
      subscription_id: subscription?.id ?? null,
      plan_id: plan.id,
      provider: "evopay",
      status: "pending",
      amount: plan.price,
      currency: plan.currency,
    })
    .select("*")
    .single();

  if (insertError || !payment) {
    return NextResponse.json({ error: "Não foi possível iniciar o pagamento." }, { status: 500 });
  }

  const externalReference = buildExternalReference(payment.id);

  try {
    const charge = await createPixCharge({
      amount: Number(plan.price),
      externalReference,
      callbackUrl: `${siteConfig.url}/api/webhooks/evopay`,
    });

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
      .eq("id", payment.id);

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
      entityId: payment.id,
      action: AUDIT_ACTIONS.PAYMENT_CREATED,
      metadata: { plan_code: plan.code, provider_transaction_id: charge.id },
    });

    return NextResponse.json({ paymentId: payment.id });
  } catch (error) {
    await admin
      .from("subscription_payments")
      .update({ status: "failed" })
      .eq("id", payment.id);

    const message =
      error instanceof EvoPayError
        ? "Não foi possível gerar o Pix agora. Tente novamente em instantes."
        : "Erro inesperado ao gerar o pagamento.";

    return NextResponse.json({ error: message }, { status: 502 });
  }
}
