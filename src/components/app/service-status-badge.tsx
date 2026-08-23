import { cn } from "@/lib/utils";
import type { ServiceStatus } from "@/types/service";

const LABELS: Record<ServiceStatus, string> = {
  active: "Ativo",
  inactive: "Inativo",
};

export function ServiceStatusBadge({ status }: { status: ServiceStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        status === "active"
          ? "bg-success/10 text-success"
          : "bg-muted text-muted-foreground"
      )}
    >
      {LABELS[status]}
    </span>
  );
}
