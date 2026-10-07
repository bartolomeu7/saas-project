import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * Indicador simples (rótulo + valor + detalhe) baseado no Card do shadcn/ui.
 * Usado nos resumos dos módulos; o dashboard mantém seus KPIs próprios.
 */
export function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
  className,
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  icon?: LucideIcon;
  className?: string;
}) {
  return (
    <Card
      className={cn(
        "relative overflow-hidden bg-gradient-to-br from-card to-card/80 p-4 shadow-soft transition-colors hover:border-primary/30 motion-reduce:transition-none",
        className
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        {Icon && (
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
          </span>
        )}
      </div>
      <p className="mt-2 truncate text-2xl font-semibold tracking-tight text-foreground">{value}</p>
      {detail && <p className="mt-1 text-xs text-muted-foreground">{detail}</p>}
    </Card>
  );
}
