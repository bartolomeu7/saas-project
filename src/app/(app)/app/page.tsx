import type { Metadata } from "next";
import { getCurrentCompany } from "@/lib/companies/queries";
import { getCustomerStats, getRecentCustomers } from "@/lib/customers/queries";
import { DashboardCard } from "@/components/app/dashboard-card";
import { RecentCustomers } from "@/components/app/recent-customers";
import { EmptyState } from "@/components/app/empty-state";

export const metadata: Metadata = {
  title: "Dashboard",
};

/**
 * Dashboard principal. Nesta etapa, apenas o indicador de Clientes usa
 * dados reais — Faturamento, Vendas e Serviços ainda não existem no
 * sistema, então mostramos "—" em vez de inventar números.
 */
export default async function DashboardPage() {
  // A existência da empresa já foi garantida pelo layout de (app)
  // (redireciona para /onboarding caso contrário), então aqui é seguro
  // assumir que ela existe.
  const current = (await getCurrentCompany())!;
  const companyId = current.company.id;

  const [stats, recentCustomers] = await Promise.all([
    getCustomerStats(companyId),
    getRecentCustomers(companyId, 5),
  ]);

  return (
    <div className="flex flex-col gap-8 px-4 py-6 sm:px-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Visão geral da {current.company.name}.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <DashboardCard label="Faturamento" value="Em breve" />
        <DashboardCard label="Vendas" value="Em breve" />
        <DashboardCard label="Clientes" value={stats.total} />
        <DashboardCard label="Serviços" value="Em breve" />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <DashboardCard label="Total de clientes" value={stats.total} />
        <DashboardCard label="Clientes ativos" value={stats.active} />
        <DashboardCard
          label="Cadastrados nos últimos 7 dias"
          value={stats.recent}
        />
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold tracking-tight">
          Clientes recentes
        </h2>

        {recentCustomers.length === 0 ? (
          <EmptyState
            title="Você ainda não possui clientes."
            description="Cadastre o primeiro cliente para começar a usar o Prime Ges."
            actionLabel="Adicionar primeiro cliente"
            actionHref="/app/clientes/novo"
          />
        ) : (
          <RecentCustomers customers={recentCustomers} />
        )}
      </div>
    </div>
  );
}
