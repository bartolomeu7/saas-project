import { getServiceStats } from "@/lib/services/queries";
import { ServiceStats } from "@/components/app/service-stats";

export async function ServicosStatsRow({ companyId }: { companyId: string }) {
  const stats = await getServiceStats(companyId);

  return <ServiceStats stats={stats} />;
}
