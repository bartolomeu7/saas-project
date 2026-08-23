import { Wrench, CheckCircle2, XCircle } from "lucide-react";
import { StatCard } from "@/components/app/stat-card";
import type { ServiceStats as ServiceStatsData } from "@/lib/services/queries";

export function ServiceStats({ stats }: { stats: ServiceStatsData }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      <StatCard label="Total" value={stats.total} icon={Wrench} />
      <StatCard label="Ativos" value={stats.active} icon={CheckCircle2} />
      <StatCard label="Inativos" value={stats.inactive} icon={XCircle} />
    </div>
  );
}
