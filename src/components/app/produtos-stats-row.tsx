import { getProductStats } from "@/lib/products/queries";
import { ProductStats } from "@/components/app/product-stats";
import { getProductSegmentHints } from "@/config/product-segments";
import type { BusinessType } from "@/types/company";

export async function ProdutosStatsRow({
  companyId,
  businessType,
}: {
  companyId: string;
  businessType: BusinessType;
}) {
  const stats = await getProductStats(companyId);
  const hints = getProductSegmentHints(businessType);

  return <ProductStats stats={stats} lowStockLabel={hints.lowStockDashboardLabel} />;
}
