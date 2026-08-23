import { cn } from "@/lib/utils";
import { CUSTOMER_STATUS_LABELS, type CustomerStatus } from "@/types/customer";

export function CustomerStatusBadge({ status }: { status: CustomerStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        status === "active"
          ? "bg-success/10 text-success"
          : "bg-muted text-muted-foreground"
      )}
    >
      {CUSTOMER_STATUS_LABELS[status]}
    </span>
  );
}
