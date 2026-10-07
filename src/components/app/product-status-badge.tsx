import { Badge } from "@/components/ui/badge";
import type { ProductStatus } from "@/types/product";

const LABELS: Record<ProductStatus, string> = {
  active: "Ativo",
  inactive: "Inativo",
};

export function ProductStatusBadge({ status }: { status: ProductStatus }) {
  return <Badge variant={status === "active" ? "success" : "muted"}>{LABELS[status]}</Badge>;
}
