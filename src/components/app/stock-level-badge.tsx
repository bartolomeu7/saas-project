import { cn } from "@/lib/utils";
import { getStockLevel, STOCK_LEVEL_LABELS } from "@/types/product";
import type { Product } from "@/types/product";

const STYLES: Record<ReturnType<typeof getStockLevel>, string> = {
  normal: "bg-success/10 text-success",
  low: "bg-warning/10 text-warning",
  out: "bg-destructive/10 text-destructive",
};

export function StockLevelBadge({
  product,
}: {
  product: Pick<Product, "stock_quantity" | "minimum_stock">;
}) {
  const level = getStockLevel(product);

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        STYLES[level]
      )}
    >
      {STOCK_LEVEL_LABELS[level]}
    </span>
  );
}
