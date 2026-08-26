import { Receipt, DollarSign, Ticket, CheckCircle2, XCircle } from "lucide-react";
import { StatCard } from "@/components/app/stat-card";
import type { SaleStats as SaleStatsData } from "@/lib/sales/queries";

function formatMoney(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function SaleStats({ stats }: { stats: SaleStatsData }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
      <StatCard label="Vendas no período" value={stats.totalInPeriod} icon={Receipt} />
      <StatCard label="Faturamento" value={formatMoney(stats.revenue)} icon={DollarSign} />
      <StatCard
        label="Ticket médio"
        value={stats.averageTicket === null ? "—" : formatMoney(stats.averageTicket)}
        icon={Ticket}
      />
      <StatCard label="Concluídas" value={stats.completedCount} icon={CheckCircle2} />
      <StatCard label="Canceladas" value={stats.cancelledCount} icon={XCircle} />
    </div>
  );
}
