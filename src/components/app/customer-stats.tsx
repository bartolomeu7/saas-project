import { Users, UserCheck, Sparkles } from "lucide-react";
import { StatCard } from "@/components/app/stat-card";
import type { CustomerStats as CustomerStatsData } from "@/lib/customers/queries";

export function CustomerStats({ stats }: { stats: CustomerStatsData }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      <StatCard label="Total" value={stats.total} icon={Users} />
      <StatCard label="Ativos" value={stats.active} icon={UserCheck} />
      <StatCard label="Novos (7 dias)" value={stats.recent} icon={Sparkles} />
    </div>
  );
}
