import { Badge, type BadgeProps } from "@/components/ui/badge";
import { SALE_PAYMENT_STATUS_LABELS } from "@/types/sale";
import type { SalePaymentStatus } from "@/types/sale";

const VARIANTS: Record<SalePaymentStatus, BadgeProps["variant"]> = {
  pending: "warning",
  paid: "success",
  cancelled: "muted",
  refunded: "danger",
};

export function SalePaymentStatusBadge({ status }: { status: SalePaymentStatus }) {
  return <Badge variant={VARIANTS[status]}>{SALE_PAYMENT_STATUS_LABELS[status]}</Badge>;
}
