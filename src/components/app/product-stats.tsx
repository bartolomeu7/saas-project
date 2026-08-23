import { Package, PackageCheck, AlertTriangle, PackageX } from "lucide-react";
import { StatCard } from "@/components/app/stat-card";
import type { ProductStats as ProductStatsData } from "@/lib/products/queries";

export function ProductStats({
  stats,
  lowStockLabel = "Estoque baixo",
}: {
  stats: ProductStatsData;
  /** Permite o rótulo adaptar por segmento (ex: dashboard) sem mudar a fonte dos dados. */
  lowStockLabel?: string;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <StatCard label="Total" value={stats.total} icon={Package} />
      <StatCard label="Ativos" value={stats.active} icon={PackageCheck} />
      <StatCard label={lowStockLabel} value={stats.lowStock} icon={AlertTriangle} />
      <StatCard label="Sem estoque" value={stats.outOfStock} icon={PackageX} />
    </div>
  );
}
