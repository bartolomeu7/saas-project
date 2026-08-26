import { ShoppingCart, DollarSign } from "lucide-react";
import { DashboardCard } from "@/components/app/dashboard-card";
import { getSaleStats, resolveSalePeriodRange } from "@/lib/sales/queries";

function formatMoney(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Vendas e faturamento do mês atual, para o resumo do topo do Dashboard. */
export async function VendasResumoCards({ companyId }: { companyId: string }) {
  const range = resolveSalePeriodRange("month");
  const stats = await getSaleStats(companyId, range.from, range.to);

  return (
    <>
      <DashboardCard
        label="Vendas (mês)"
        value={stats.totalInPeriod}
        icon={ShoppingCart}
        hint={stats.totalInPeriod === 0 ? "Nenhuma venda registrada este mês." : undefined}
      />
      <DashboardCard
        label="Faturamento (mês)"
        value={formatMoney(stats.revenue)}
        icon={DollarSign}
        hint={stats.completedCount === 0 ? "Considera só vendas concluídas." : undefined}
      />
    </>
  );
}
