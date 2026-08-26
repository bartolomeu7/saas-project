import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import type { ActiveSubscriptionResult, Subscription } from "@/types/billing";

/**
 * Subconjunto do guard de assinatura sem NENHUMA dependência Node-only
 * (sem "server-only", sem createClient()/next-headers) — só recebe o
 * client já pronto como parâmetro. Isolado num arquivo próprio para
 * poder ser importado com segurança tanto pelo middleware (Edge
 * Runtime) quanto por src/lib/billing/queries.ts (Server
 * Components/Route Handlers/Server Actions), sem arrastar o restante do
 * módulo de queries (que usa cookies()/next/headers) para o bundle do
 * middleware.
 */

/**
 * Fonte de verdade central do acesso: status E expires_at, sempre
 * juntos — nunca confia só no status armazenado.
 */
export async function getActiveSubscription(
  supabase: SupabaseClient<Database>,
  companyId: string
): Promise<ActiveSubscriptionResult> {
  const { data } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("company_id", companyId)
    .maybeSingle();

  if (!data) {
    return { subscription: null, isActive: false };
  }

  const subscription = data as Subscription;
  const isActive =
    (subscription.status === "trialing" || subscription.status === "active") &&
    new Date(subscription.expires_at).getTime() > Date.now();

  return { subscription, isActive };
}

/**
 * Versão usada pelo middleware: resolve a empresa do usuário e já
 * retorna se o acesso está liberado. `hasCompany: false` significa
 * "ainda em onboarding", tratado à parte do guard de assinatura.
 */
export async function getSubscriptionGuardStatus(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<{ hasCompany: boolean; isActive: boolean }> {
  const { data: membership } = await supabase
    .from("company_members")
    .select("company_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();

  if (!membership) {
    return { hasCompany: false, isActive: false };
  }

  const { isActive } = await getActiveSubscription(supabase, membership.company_id);
  return { hasCompany: true, isActive };
}
