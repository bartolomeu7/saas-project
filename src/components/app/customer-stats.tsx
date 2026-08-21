import { DashboardCard } from "@/components/app/dashboard-card";
import type { CustomerStats as CustomerStatsData } from "@/lib/customers/queries";

export function CustomerStats({ stats }: { stats: CustomerStatsData }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
      <DashboardCard label="Total" value={stats.total} />
      <DashboardCard label="Ativos" value={stats.active} />
      <DashboardCard label="Novos (7 dias)" value={stats.recent} />
    </div>
  );
}
