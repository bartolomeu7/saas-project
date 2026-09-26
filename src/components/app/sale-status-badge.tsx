import { Badge, type BadgeProps } from "@/components/ui/badge";
import { SALE_STATUS_LABELS } from "@/types/sale";
import type { SaleStatus } from "@/types/sale";

const VARIANTS: Record<SaleStatus, BadgeProps["variant"]> = {
  draft: "muted",
  completed: "success",
  cancelled: "danger",
};

export function SaleStatusBadge({ status }: { status: SaleStatus }) {
  return <Badge variant={VARIANTS[status]}>{SALE_STATUS_LABELS[status]}</Badge>;
}
