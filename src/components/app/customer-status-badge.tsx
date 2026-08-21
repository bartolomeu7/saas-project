import { cn } from "@/lib/utils";
import { CUSTOMER_STATUS_LABELS, type CustomerStatus } from "@/types/customer";

export function CustomerStatusBadge({ status }: { status: CustomerStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        status === "active"
          ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
          : "bg-muted text-muted-foreground"
      )}
    >
      {CUSTOMER_STATUS_LABELS[status]}
    </span>
  );
}
