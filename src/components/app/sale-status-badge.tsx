import { cn } from "@/lib/utils";
import { SALE_STATUS_LABELS } from "@/types/sale";
import type { SaleStatus } from "@/types/sale";

const STYLES: Record<SaleStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  completed: "bg-success/10 text-success",
  cancelled: "bg-destructive/10 text-destructive",
};

export function SaleStatusBadge({ status }: { status: SaleStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        STYLES[status]
      )}
    >
      {SALE_STATUS_LABELS[status]}
    </span>
  );
}
