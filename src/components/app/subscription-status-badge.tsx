import { cn } from "@/lib/utils";
import { SUBSCRIPTION_STATUS_LABELS } from "@/types/billing";
import type { SubscriptionStatus } from "@/types/billing";

const STYLES: Record<SubscriptionStatus, string> = {
  trialing: "bg-primary/10 text-primary",
  pending: "bg-warning/10 text-warning",
  active: "bg-success/10 text-success",
  expired: "bg-destructive/10 text-destructive",
  cancelled: "bg-muted text-muted-foreground",
};

export function SubscriptionStatusBadge({ status }: { status: SubscriptionStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        STYLES[status]
      )}
    >
      {SUBSCRIPTION_STATUS_LABELS[status]}
    </span>
  );
}
