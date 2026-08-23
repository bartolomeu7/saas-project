import { cn } from "@/lib/utils";
import type { ProductStatus } from "@/types/product";

const LABELS: Record<ProductStatus, string> = {
  active: "Ativo",
  inactive: "Inativo",
};

export function ProductStatusBadge({ status }: { status: ProductStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        status === "active"
          ? "bg-success/10 text-success"
          : "bg-muted text-muted-foreground"
      )}
    >
      {LABELS[status]}
    </span>
  );
}
