import { cn } from "@/lib/utils";
import { CUSTOMER_CLASSIFICATION_LABELS } from "@/lib/customers/classification";
import type { CustomerClassification } from "@/lib/customers/classification";

const STYLES: Record<CustomerClassification, string> = {
  novo: "bg-primary/10 text-primary",
  recorrente: "bg-success/10 text-success",
  vip: "bg-warning/10 text-warning",
  inativo: "bg-muted text-muted-foreground",
  em_risco: "bg-warning/10 text-warning",
  perdido: "bg-destructive/10 text-destructive",
};

export function CustomerClassificationBadge({
  classification,
}: {
  classification: CustomerClassification;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        STYLES[classification]
      )}
    >
      {CUSTOMER_CLASSIFICATION_LABELS[classification]}
    </span>
  );
}
