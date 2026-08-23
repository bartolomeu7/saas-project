import { getCustomerStats } from "@/lib/customers/queries";
import { CustomerStats } from "@/components/app/customer-stats";

export async function ClientesStatsRow({ companyId }: { companyId: string }) {
  const stats = await getCustomerStats(companyId);
  return <CustomerStats stats={stats} />;
}
