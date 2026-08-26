"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentCompany } from "@/lib/companies/queries";
import { confirmPaymentFromProvider } from "@/lib/billing/confirm-payment";
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

  const supabase = createClient();
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
 * relê o status já salvo no nosso banco (nenhuma chamada à EvoPay), para
 * não sobrecarregar a API do provedor a cada 5-10s.
 */
export async function getPaymentStatusAction(paymentId: string): Promise<PaymentStatusResult> {
  const companyId = await assertOwnPayment(paymentId);
  if (!companyId) {
    return { error: "Pagamento não encontrado." };
  }

  const supabase = createClient();
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
 * confirmPaymentFromProvider, que sempre re-verifica na EvoPay antes de
 * confirmar). Nunca altera o status diretamente a partir do clique.
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
