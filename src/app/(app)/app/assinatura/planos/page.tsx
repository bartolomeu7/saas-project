import type { Metadata } from "next";
import { getCurrentCompany } from "@/lib/companies/queries";
import { getPlans, getCurrentSubscription } from "@/lib/billing/queries";
import { PlanCard } from "@/components/app/plan-card";

export const metadata: Metadata = {
  title: "Planos",
};

export default async function PlansPage() {
  const current = (await getCurrentCompany())!;
  const companyId = current.company.id;

  const [plans, subscription] = await Promise.all([
    getPlans(),
    getCurrentSubscription(companyId),
  ]);

  // O teste grátis é concedido automaticamente na criação da empresa —
  // não aparece aqui como algo comprável.
  const purchasablePlans = plans.filter((plan) => !plan.trial);

  return (
    <div className="flex flex-col gap-6 px-4 py-6 sm:px-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Planos</h1>
        <p className="text-sm text-muted-foreground">
          Escolha o plano ideal para a sua empresa. Pagamento via Pix.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {purchasablePlans.map((plan) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            isCurrent={subscription?.plan_id === plan.id && subscription.status === "active"}
            highlighted={plan.code === "YEARLY"}
          />
        ))}
      </div>
    </div>
  );
}
