import type { Metadata } from "next";
import Link from "next/link";
import { Trophy } from "lucide-react";
import { getCurrentCompany } from "@/lib/companies/queries";
import {
  getCustomerRanking,
  resolvePeriodRange,
  type RankingPeriod,
} from "@/lib/customers/ranking";
import { RankingPeriodSelector } from "@/components/app/ranking-period-selector";
import { EmptyState } from "@/components/app/empty-state";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = {
  title: "Melhores clientes",
};

function parsePeriod(value?: string): RankingPeriod {
  return value === "quarter" || value === "semester" || value === "year" || value === "custom"
    ? value
    : "month";
}

export default async function CustomerRankingPage({
  searchParams,
}: {
  searchParams?: { period?: string; from?: string; to?: string };
}) {
  const current = (await getCurrentCompany())!;
  const period = parsePeriod(searchParams?.period);
  const range = resolvePeriodRange(period, searchParams?.from, searchParams?.to);
  const ranking = await getCustomerRanking(current.company.id, period, range);

  return (
    <div className="flex flex-col gap-6 px-4 py-6 sm:px-6">
      <div>
        <Link
          href="/app/clientes"
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          ← Voltar para Clientes
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Melhores clientes
        </h1>
        <p className="text-sm text-muted-foreground">
          Clientes mais lucrativos e cliente destaque, por período.
        </p>
      </div>

      <RankingPeriodSelector />

      <p className="text-xs text-muted-foreground">
        Período selecionado: {formatDate(range.from)} até {formatDate(range.to)}
      </p>

      {!ranking.hasRevenueData ? (
        <EmptyState
          icon={Trophy}
          title="Ainda não há dados suficientes para calcular o ranking."
          description="Esse indicador estará disponível quando houver vendas/serviços registrados. Assim que o módulo de Vendas existir, os clientes mais lucrativos e o cliente destaque do período aparecerão aqui automaticamente."
        />
      ) : (
        // Preparado para quando houver dados reais de vendas/serviços —
        // sem tabela/UI de ranking real ainda porque hasRevenueData
        // nunca é true nesta fase.
        <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
          Ranking indisponível.
        </div>
      )}

      <div className="rounded-lg border border-dashed border-border bg-card/40 p-5">
        <h2 className="text-sm font-semibold text-foreground">
          Como o ranking é calculado
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Quando houver dados de vendas e serviços, o ranking considera
          receita gerada, frequência de compras, recorrência e — quando
          houver custo cadastrado — a margem/contribuição estimada.{" "}
          <strong className="text-foreground">
            Nunca é definido apenas pelo valor total gasto.
          </strong>{" "}
          Se ainda não houver dados de custo suficientes, o ranking deixa
          explícito que está baseado em faturamento/receita, e não em
          lucro.
        </p>
      </div>
    </div>
  );
}
