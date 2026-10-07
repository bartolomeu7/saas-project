import { Badge, type BadgeProps } from "@/components/ui/badge";
import { SUBSCRIPTION_STATUS_LABELS } from "@/types/billing";
import type { SubscriptionStatus } from "@/types/billing";

const VARIANTS: Record<SubscriptionStatus, BadgeProps["variant"]> = {
  trialing: "info",
  pending: "warning",
  active: "success",
  expired: "danger",
  cancelled: "muted",
};

export function SubscriptionStatusBadge({ status }: { status: SubscriptionStatus }) {
  return <Badge variant={VARIANTS[status]}>{SUBSCRIPTION_STATUS_LABELS[status]}</Badge>;
}
