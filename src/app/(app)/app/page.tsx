import type { Metadata } from "next";
import { Suspense } from "react";
import { ShoppingCart, DollarSign, Wrench, Receipt, Activity } from "lucide-react";
import { getCurrentProfile } from "@/lib/auth/session";
import { getCurrentCompany } from "@/lib/companies/queries";
import { DashboardCard } from "@/components/app/dashboard-card";
import { QuickActions } from "@/components/app/quick-actions";
import { EmptyState } from "@/components/app/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { ClientesCadastradosCard } from "@/components/app/clientes-cadastrados-card";
import { ClientesStatsRow } from "@/components/app/clientes-stats-row";
import { ClientesRecentesSection } from "@/components/app/clientes-recentes-section";
import { ProdutosStatsRow } from "@/components/app/produtos-stats-row";
import { ServicosStatsRow } from "@/components/app/servicos-stats-row";

export const metadata: Metadata = {
  title: "Dashboard",
};

function DashboardCardSkeleton() {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-8 w-8 rounded-md" />
      </div>
      <Skeleton className="mt-3 h-7 w-14" />
      <Skeleton className="mt-2 h-3 w-32" />
    </div>
  );
}

function StatCardSkeleton() {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card/60 p-3.5">
      <Skeleton className="h-9 w-9 shrink-0 rounded-md" />
      <div className="flex-1">
        <Skeleton className="h-5 w-10" />
        <Skeleton className="mt-1.5 h-3 w-16" />
      </div>
    </div>
  );
}

// Grade igual à de CustomerStats — evita layout shift quando os dados reais substituem o skeleton.
function StatsRowSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {[0, 1, 2].map((i) => (
        <StatCardSkeleton key={i} />
      ))}
    </div>
  );
}

// Grade igual à de ProductStats (4 colunas).
function ProductStatsRowSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {[0, 1, 2, 3].map((i) => (
        <StatCardSkeleton key={i} />
      ))}
    </div>
  );
}

function RecentCustomersSkeleton() {
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <div className="divide-y divide-border">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3">
            <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
            <Skeleton className="h-4 w-40" />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Dashboard principal. Nesta etapa, apenas os indicadores de Clientes usam
 * dados reais — Vendas, Faturamento, Serviços e Valores a receber ainda
 * não existem no sistema (sem tabela no banco), então mostram um
 * estado vazio explícito em vez de números inventados.
 *
 * As seções dependentes de dados de clientes (card "Clientes cadastrados",
 * estatísticas e "Clientes recentes") ficam em componentes assíncronos
 * separados dentro de <Suspense>, para que o restante da página (saudação,
 * cards estáticos, ações rápidas) apareça imediatamente com um skeleton
 * nos blocos que ainda estão carregando.
 */
export default async function DashboardPage() {
  // A existência da empresa já foi garantida pelo layout de (app)
  // (redireciona para /onboarding caso contrário), então aqui é seguro
  // assumir que ela existe.
  const [current, profile] = await Promise.all([
    getCurrentCompany(),
    getCurrentProfile(),
  ]);
  const company = current!.company;
  const firstName = profile?.full_name?.trim().split(" ")[0];

  return (
    <div className="flex flex-col gap-8 px-4 py-6 sm:px-6 lg:px-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          {firstName ? `Olá, ${firstName}.` : "Olá."}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Visão geral da {company.name}.
        </p>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Resumo do negócio
        </h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          <Suspense fallback={<DashboardCardSkeleton />}>
            <ClientesCadastradosCard companyId={company.id} />
          </Suspense>
          <DashboardCard
            label="Vendas"
            value="—"
            icon={ShoppingCart}
            hint="Você ainda não possui vendas registradas."
          />
          <DashboardCard
            label="Faturamento"
            value="—"
            icon={DollarSign}
            hint="Nenhum faturamento registrado ainda."
          />
          <DashboardCard
            label="Serviços realizados"
            value="—"
            icon={Wrench}
            hint="Nenhum serviço registrado ainda."
          />
          <DashboardCard
            label="Valores a receber"
            value="—"
            icon={Receipt}
            hint="Nenhum valor pendente registrado."
          />
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Ações rápidas
        </h2>
        <QuickActions />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Estatísticas de clientes
        </h2>
        <Suspense fallback={<StatsRowSkeleton />}>
          <ClientesStatsRow companyId={company.id} />
        </Suspense>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Estatísticas de produtos
        </h2>
        <Suspense fallback={<ProductStatsRowSkeleton />}>
          <ProdutosStatsRow companyId={company.id} businessType={company.business_type} />
        </Suspense>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Estatísticas de serviços
        </h2>
        <Suspense fallback={<StatsRowSkeleton />}>
          <ServicosStatsRow companyId={company.id} />
        </Suspense>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Atividades recentes
        </h2>
        <EmptyState
          icon={Activity}
          title="Nenhuma atividade recente"
          description="Suas atividades (vendas, serviços, cadastros) aparecerão aqui conforme você usar o Prime Ges."
        />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Clientes recentes
        </h2>
        <Suspense fallback={<RecentCustomersSkeleton />}>
          <ClientesRecentesSection companyId={company.id} />
        </Suspense>
      </section>
    </div>
  );
}
