import { Badge, type BadgeProps } from "@/components/ui/badge";
import { SUBSCRIPTION_PAYMENT_STATUS_LABELS } from "@/types/billing";
import type { SubscriptionPaymentStatus } from "@/types/billing";

const VARIANTS: Record<SubscriptionPaymentStatus, BadgeProps["variant"]> = {
  pending: "warning",
  paid: "success",
  expired: "danger",
  cancelled: "muted",
  failed: "danger",
  refunded: "muted",
};

export function SubscriptionPaymentStatusBadge({
  status,
}: {
  status: SubscriptionPaymentStatus;
}) {
  return (
    <Badge variant={VARIANTS[status]}>{SUBSCRIPTION_PAYMENT_STATUS_LABELS[status]}</Badge>
  );
}
