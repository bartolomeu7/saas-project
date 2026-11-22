"use server";

import { revalidatePath } from "next/cache";
import { createSessionClient } from "@/lib/supabase/server";
import { getCurrentCompany } from "@/lib/companies/queries";
import { confirmPaymentFromProvider } from "@/lib/billing/confirm-payment";
import { checkBillingProfile, type BillingProfileInput } from "@/lib/billing/checkout-profile";
import type { SubscriptionPaymentStatus } from "@/types/billing";

export interface PaymentStatusResult {
  status?: SubscriptionPaymentStatus;
  error?: string;
}

/**
 * Garante que o pagamento pertence à empresa do usuário logado antes de
 * qualquer leitura/ação — nunca confia apenas no id vindo do cliente.
 */
async function assertOwnPayment(paymentId: string): Promise<string | null> {
  const current = await getCurrentCompany();
  if (!current) return null;

  const supabase = await createSessionClient();
  const { data } = await supabase
    .from("subscription_payments")
    .select("id")
    .eq("id", paymentId)
    .eq("company_id", current.company.id)
    .maybeSingle();

  return data ? current.company.id : null;
}

/**
 * Leitura leve para o polling automático da tela de pagamento — apenas
 * relê o status já salvo no nosso banco (nenhuma chamada à SyncPay): o status real chega pelo
 * webhook assinado e a API do provedor limita as consultas por transação.
 */
export async function getPaymentStatusAction(paymentId: string): Promise<PaymentStatusResult> {
  const companyId = await assertOwnPayment(paymentId);
  if (!companyId) {
    return { error: "Pagamento não encontrado." };
  }

  const supabase = await createSessionClient();
  const { data, error } = await supabase
    .from("subscription_payments")
    .select("status")
    .eq("id", paymentId)
    .single();

  if (error || !data) {
    return { error: "Não foi possível consultar o pagamento." };
  }

  return { status: data.status };
}

/**
 * Ação do botão "Já paguei" — APENAS consulta o servidor (via
 * confirmPaymentFromProvider: contingência, com idade mínima do pagamento e no máximo 4
 * consultas à SyncPay por pagamento). Nunca altera o status diretamente a partir do clique.
 */
export async function checkPaymentNowAction(paymentId: string): Promise<PaymentStatusResult> {
  const companyId = await assertOwnPayment(paymentId);
  if (!companyId) {
    return { error: "Pagamento não encontrado." };
  }

  const result = await confirmPaymentFromProvider(paymentId);

  if (!result.ok) {
    return { error: result.message ?? "Não foi possível confirmar o pagamento agora." };
  }

  revalidatePath(`/app/assinatura/pagamento/${paymentId}`);
  revalidatePath("/app/assinatura");

  return { status: result.status };
}

export interface SaveBillingProfileResult {
  ok: boolean;
  error?: string;
  errors?: { document?: string; phone?: string };
}

// A função de banco ainda não consta nos tipos gerados: a chamada passa por um tipo mínimo.
type LooseRpc = { rpc(fn: string, args?: Record<string, unknown>): Promise<{ error: { message: string } | null }> };

/**
 * Salva no cadastro da empresa o CPF/CNPJ e/ou o telefone pedidos no checkout (a SyncPay exige os dois). Só proprietário ou
 * administrador. `update_company_profile` troca TODOS os campos de uma vez; por isso os demais dados vêm do cadastro atual,
 * lido no servidor, e só os campos enviados são alterados — nada é apagado.
 */
export async function saveBillingProfileAction(input: BillingProfileInput): Promise<SaveBillingProfileResult> {
  const current = await getCurrentCompany();
  if (!current) return { ok: false, error: "Não autenticado." };
  if (current.role !== "owner" && current.role !== "admin") {
    return { ok: false, error: "Apenas o proprietário ou administradores podem alterar os dados da empresa." };
  }

  const checked = checkBillingProfile({
    document: typeof input?.document === "string" ? input.document : undefined,
    phone: typeof input?.phone === "string" ? input.phone : undefined,
  });
  if (!checked.ok) return { ok: false, errors: checked.errors };

  const company = current.company;
  const supabase = (await createSessionClient()) as unknown as LooseRpc;
  const { error } = await supabase.rpc("update_company_profile", {
    p_legal_name: company.legal_name ?? "",
    p_document: checked.document ?? company.document ?? "",
    p_phone: checked.phone ?? company.phone ?? "",
    p_whatsapp: company.whatsapp ?? "",
    p_email: company.email ?? "",
    p_website: company.website ?? "",
    p_postal_code: company.postal_code ?? "",
    p_address: company.address ?? "",
    p_address_number: company.address_number ?? "",
    p_complement: company.complement ?? "",
    p_neighborhood: company.neighborhood ?? "",
    p_city: company.city ?? "",
    p_state: company.state ?? "",
  });
  if (error) {
    console.error("[billing] não foi possível salvar os dados do checkout:", error.message);
    return { ok: false, error: "Não foi possível salvar agora. Tente novamente." };
  }

  revalidatePath("/app/configuracoes/empresa");
  return { ok: true };
}
