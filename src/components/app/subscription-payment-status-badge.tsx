import { cn } from "@/lib/utils";
import { SUBSCRIPTION_PAYMENT_STATUS_LABELS } from "@/types/billing";
import type { SubscriptionPaymentStatus } from "@/types/billing";

const STYLES: Record<SubscriptionPaymentStatus, string> = {
  pending: "bg-warning/10 text-warning",
  paid: "bg-success/10 text-success",
  expired: "bg-destructive/10 text-destructive",
  cancelled: "bg-muted text-muted-foreground",
  failed: "bg-destructive/10 text-destructive",
  refunded: "bg-muted text-muted-foreground",
};

export function SubscriptionPaymentStatusBadge({
  status,
}: {
  status: SubscriptionPaymentStatus;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        STYLES[status]
      )}
    >
      {SUBSCRIPTION_PAYMENT_STATUS_LABELS[status]}
    </span>
  );
}
