import { Badge } from "@/components/ui/badge";
import { CUSTOMER_STATUS_LABELS, type CustomerStatus } from "@/types/customer";

export function CustomerStatusBadge({ status }: { status: CustomerStatus }) {
  return (
    <Badge variant={status === "active" ? "success" : "muted"}>
      {CUSTOMER_STATUS_LABELS[status]}
    </Badge>
  );
}
