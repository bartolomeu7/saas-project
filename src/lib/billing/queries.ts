import "server-only";

import { createClient } from "@/lib/supabase/server";
import type {
  CompanyEntitlements,
  Plan,
  PublicPlan,
  Subscription,
  SubscriptionPayment,
  SubscriptionPaymentWithPlan,
} from "@/types/billing";

export { getActiveSubscription, getSubscriptionGuardStatus } from "@/lib/billing/guard";

/** Catálogo completo (autenticado) — para a tela /app/assinatura/planos. */
export async function getPlans(): Promise<Plan[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("plans")
    .select("*")
    .eq("status", "active")
    .order("price", { ascending: true, nullsFirst: false });

  if (error) return [];
  return (data ?? []) as Plan[];
}

/** Catálogo público (landing page, anon) — via get_public_plans(), sem provider/provider_plan_id. */
export async function getPublicPlans(): Promise<PublicPlan[]> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("get_public_plans");

  if (error) return [];
  return (data ?? []) as PublicPlan[];
}

export async function getPlanById(id: string): Promise<Plan | null> {
  const supabase = createClient();
  const { data, error } = await supabase.from("plans").select("*").eq("id", id).maybeSingle();

  if (error || !data) return null;
  return data as Plan;
}

/** A única subscription da empresa (pode não existir ainda, embora só aconteça em estado transitório). */
export async function getCurrentSubscription(companyId: string): Promise<Subscription | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("company_id", companyId)
    .maybeSingle();

  if (error || !data) return null;
  return data as Subscription;
}

export async function getCompanyEntitlements(companyId: string): Promise<CompanyEntitlements | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("company_entitlements")
    .select("*")
    .eq("company_id", companyId)
    .maybeSingle();

  if (error || !data) return null;
  return data as CompanyEntitlements;
}

interface SubscriptionPaymentRow extends SubscriptionPayment {
  plans: { name: string } | null;
}

function mapPaymentRow(row: SubscriptionPaymentRow): SubscriptionPaymentWithPlan {
  const { plans, ...rest } = row;
  return { ...rest, plan_name: plans?.name ?? "—" };
}

/** Histórico de cobranças da assinatura (/app/assinatura/historico). */
export async function getSubscriptionPayments(companyId: string): Promise<SubscriptionPaymentWithPlan[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("subscription_payments")
    .select("*, plans(name)")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });

  if (error) return [];
  return ((data ?? []) as SubscriptionPaymentRow[]).map(mapPaymentRow);
}

/** Um pagamento específico, garantindo que pertence à empresa (/app/assinatura/pagamento/[id]). */
export async function getSubscriptionPaymentById(
  companyId: string,
  id: string
): Promise<SubscriptionPaymentWithPlan | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("subscription_payments")
    .select("*, plans(name)")
    .eq("company_id", companyId)
    .eq("id", id)
    .maybeSingle();

  if (error || !data) return null;
  return mapPaymentRow(data as SubscriptionPaymentRow);
}
