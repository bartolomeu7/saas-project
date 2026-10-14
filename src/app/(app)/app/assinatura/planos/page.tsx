import type { Metadata } from "next";
import { getCurrentCompany } from "@/lib/companies/queries";
import { getCurrentSubscription, getPlanById, getPublicPlans } from "@/lib/billing/queries";
import { PlanCard } from "@/components/app/plan-card";
import { toPricingView } from "@/lib/billing/pricing-display";
import type { Plan, PublicPlan } from "@/types/billing";

export const metadata: Metadata = {
  title: "Planos",
};

/** Plano do cliente que saiu do catálogo (oculto), reduzido ao que o cartão precisa — sem promoção. */
function toCatalogShape(plan: Plan): PublicPlan {
  return {
    id: plan.id, code: plan.code, name: plan.name, description: plan.description, price: plan.price, currency: plan.currency,
    access_duration_days: plan.access_duration_days, additional_user_limit: plan.additional_user_limit, trial: plan.trial,
    support_enabled: plan.support_enabled, tickets_enabled: plan.tickets_enabled, exclusive_groups_enabled: plan.exclusive_groups_enabled,
    early_access_enabled: plan.early_access_enabled, status: plan.status, kind: plan.trial ? "trial" : plan.code === "CUSTOM" ? "custom" : "standard",
    tagline: null, highlight: null, cta_label: null, contact_url: null, benefits_title: null, sort_order: 0,
    compare_price: null, discount_percent: null, savings_amount: null, promo_ends_at: null, benefits: [],
  };
}

export default async function PlansPage() {
  const current = (await getCurrentCompany())!;
  const companyId = current.company.id;

  // FONTE ÚNICA: o mesmo catálogo da home (get_public_plans), agora com a sessão do usuário.
  const [catalog, subscription] = await Promise.all([
    getPublicPlans({ authenticated: true }),
    getCurrentSubscription(companyId),
  ]);

  // O teste grátis é concedido automaticamente na criação da empresa — não aparece aqui como algo comprável.
  const purchasable = catalog.filter((plan) => !plan.trial && plan.kind !== "lifetime");

  // Quem está num plano ativo que saiu do catálogo (oculto) continua podendo renovar o próprio plano.
  const currentInCatalog = subscription ? catalog.some((plan) => plan.id === subscription.plan_id) : true;
  const hiddenCurrent =
    subscription && !currentInCatalog
      ? await getPlanById(subscription.plan_id).then((plan) =>
          plan && plan.status === "active" && !plan.trial && !plan.lifetime && plan.price != null ? toCatalogShape(plan) : null
        )
      : null;

  const cards = [...(hiddenCurrent ? [{ plan: hiddenCurrent, hidden: true }] : []), ...purchasable.map((plan) => ({ plan, hidden: false }))];

  return (
    <div className="flex flex-col gap-6 px-4 py-6 sm:px-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Planos</h1>
        <p className="text-sm text-muted-foreground">Escolha o plano ideal para a sua empresa. Pagamento via Pix.</p>
      </div>

      {cards.length === 0 ? (
        <p className="rounded-md border border-border bg-card p-6 text-sm text-muted-foreground">
          Os planos estão indisponíveis no momento. Tente novamente em instantes ou fale com o suporte.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {cards.map(({ plan, hidden }) => (
            <PlanCard
              key={plan.id}
              plan={toPricingView(plan)}
              hiddenFromCatalog={hidden}
              isCurrent={subscription?.plan_id === plan.id && subscription.status === "active"}
              highlighted={plan.highlight !== null}
            />
          ))}
        </div>
      )}
    </div>
  );
}
