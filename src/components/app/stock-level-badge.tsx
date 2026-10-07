import { Badge, type BadgeProps } from "@/components/ui/badge";
import { getStockLevel, STOCK_LEVEL_LABELS } from "@/types/product";
import type { Product } from "@/types/product";

const VARIANTS: Record<ReturnType<typeof getStockLevel>, BadgeProps["variant"]> = {
  normal: "success",
  low: "warning",
  out: "danger",
};

export function StockLevelBadge({
  product,
}: {
  product: Pick<Product, "stock_quantity" | "minimum_stock">;
}) {
  const level = getStockLevel(product);

  return <Badge variant={VARIANTS[level]}>{STOCK_LEVEL_LABELS[level]}</Badge>;
}
