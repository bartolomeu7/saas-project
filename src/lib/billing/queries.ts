import "server-only";

import { createSessionClient } from "@/lib/supabase/server";
import { createPublicClient } from "@/lib/supabase/public";
import { normalizePublicPlan } from "@/lib/billing/pricing-display";
import type {
  CompanyEntitlements,
  Plan,
  PublicPlan,
  Subscription,
  SubscriptionPayment,
  SubscriptionPaymentWithPlan,
} from "@/types/billing";

export { getActiveSubscription, getSubscriptionGuardStatus } from "@/lib/billing/guard";

/**
 * Catálogo completo (autenticado) — para a tela /app/assinatura/planos.
 * Por padrão só os planos ativos; o painel /admin passa `includeInactive`.
 */
export async function getPlans(options: { includeInactive?: boolean } = {}): Promise<Plan[]> {
  const supabase = await createSessionClient();
  let query = supabase.from("plans").select("*");

  if (!options.includeInactive) {
    // Cliente: só planos ativos e À VENDA. O plano vitalício é concedido pela equipe e nunca é oferecido.
    query = query.eq("status", "active").eq("lifetime", false);
  }

  const { data, error } = await query
    .order("sort_order", { ascending: true })
    .order("price", { ascending: true, nullsFirst: false });

  if (error) return [];
  return (data ?? []) as Plan[];
}

/**
 * Catálogo público — FONTE ÚNICA de planos para o site, via get_public_plans() (só planos ativos, visíveis, não
 * vitalícios; desconto calculado no banco e só com promoção vigente). Sem sessão: usa o cliente anônimo sem cookies,
 * então a home pode ser gerada de forma estática e revalidada. Falha => [] (a home mostra "indisponível"; nunca preço
 * inventado). Com `authenticated: true` usa a sessão do usuário (tela de planos do app).
 */
export async function getPublicPlans(options: { authenticated?: boolean } = {}): Promise<PublicPlan[]> {
  try {
    const supabase = options.authenticated ? await createSessionClient() : createPublicClient();
    const { data, error } = await supabase.rpc("get_public_plans");
    if (error) {
      console.error("[billing] get_public_plans() falhou:", error.message);
      return [];
    }
    return ((data ?? []) as unknown as Record<string, unknown>[]).map(normalizePublicPlan);
  } catch (error) {
    console.error("[billing] catálogo público indisponível:", error instanceof Error ? error.message : "erro desconhecido");
    return [];
  }
}

/** Resultado de get_my_trial_status(): o teste grátis foi negado por limite de cadastros da conexão? */
export async function getMyTrialStatus(): Promise<{ denied: boolean; windowHours: number }> {
  const supabase = (await createSessionClient()) as unknown as {
    rpc(fn: "get_my_trial_status"): Promise<{ data: { denied?: boolean; window_hours?: number } | null; error: { message: string } | null }>;
  };
  const { data, error } = await supabase.rpc("get_my_trial_status");
  if (error || !data) return { denied: false, windowHours: 24 };
  return { denied: data.denied === true, windowHours: Number(data.window_hours ?? 24) };
}

export async function getPlanById(id: string): Promise<Plan | null> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase.from("plans").select("*").eq("id", id).maybeSingle();

  if (error || !data) return null;
  return data as Plan;
}

/** A única subscription da empresa (pode não existir ainda, embora só aconteça em estado transitório). */
export async function getCurrentSubscription(companyId: string): Promise<Subscription | null> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("company_id", companyId)
    .maybeSingle();

  if (error || !data) return null;
  return data as Subscription;
}

export async function getCompanyEntitlements(companyId: string): Promise<CompanyEntitlements | null> {
  const supabase = await createSessionClient();
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
  const supabase = await createSessionClient();
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
  const supabase = await createSessionClient();
  const { data, error } = await supabase
    .from("subscription_payments")
    .select("*, plans(name)")
    .eq("company_id", companyId)
    .eq("id", id)
    .maybeSingle();

  if (error || !data) return null;
  return mapPaymentRow(data as SubscriptionPaymentRow);
}
