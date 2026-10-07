import { Badge, type BadgeProps } from "@/components/ui/badge";
import { CUSTOMER_CLASSIFICATION_LABELS } from "@/lib/customers/classification";
import type { CustomerClassification } from "@/lib/customers/classification";

const VARIANTS: Record<CustomerClassification, BadgeProps["variant"]> = {
  novo: "info",
  recorrente: "success",
  vip: "warning",
  inativo: "muted",
  em_risco: "warning",
  perdido: "danger",
};

export function CustomerClassificationBadge({
  classification,
}: {
  classification: CustomerClassification;
}) {
  return (
    <Badge variant={VARIANTS[classification]}>
      {CUSTOMER_CLASSIFICATION_LABELS[classification]}
    </Badge>
  );
}
