import { Badge } from "@/components/ui/badge";
import type { ServiceStatus } from "@/types/service";

const LABELS: Record<ServiceStatus, string> = {
  active: "Ativo",
  inactive: "Inativo",
};

export function ServiceStatusBadge({ status }: { status: ServiceStatus }) {
  return <Badge variant={status === "active" ? "success" : "muted"}>{LABELS[status]}</Badge>;
}
