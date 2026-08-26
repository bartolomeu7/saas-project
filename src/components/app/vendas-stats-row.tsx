import { getSaleStats, resolveSalePeriodRange } from "@/lib/sales/queries";
import { SaleStats } from "@/components/app/sale-stats";

/** Estatísticas de vendas do mês atual, para o Dashboard. */
export async function VendasStatsRow({ companyId }: { companyId: string }) {
  const range = resolveSalePeriodRange("month");
  const stats = await getSaleStats(companyId, range.from, range.to);

  return <SaleStats stats={stats} />;
}
