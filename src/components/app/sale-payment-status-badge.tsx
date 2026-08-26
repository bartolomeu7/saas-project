import { cn } from "@/lib/utils";
import { SALE_PAYMENT_STATUS_LABELS } from "@/types/sale";
import type { SalePaymentStatus } from "@/types/sale";

const STYLES: Record<SalePaymentStatus, string> = {
  pending: "bg-warning/10 text-warning",
  paid: "bg-success/10 text-success",
  cancelled: "bg-muted text-muted-foreground",
  refunded: "bg-destructive/10 text-destructive",
};

export function SalePaymentStatusBadge({ status }: { status: SalePaymentStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        STYLES[status]
      )}
    >
      {SALE_PAYMENT_STATUS_LABELS[status]}
    </span>
  );
}
