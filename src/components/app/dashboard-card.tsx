import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const INDICATOR_COLOR: Record<"success" | "warning" | "neutral", string> = {
  success: "bg-success",
  warning: "bg-warning",
  neutral: "bg-muted-foreground/50",
};

export function DashboardCard({
  label,
  value,
  icon: Icon,
  hint,
  indicator = "neutral",
}: {
  label: string;
  value: string | number;
  icon: LucideIcon;
  /** Texto pequeno abaixo do valor — explica um estado vazio ou dá contexto. */
  hint?: string;
  /** Cor do indicador discreto ao lado do hint. */
  indicator?: "success" | "warning" | "neutral";
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-soft transition-colors hover:border-border/80">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{label}</p>
        <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Icon className="h-4 w-4" strokeWidth={1.75} />
        </span>
      </div>
      <p className="mt-3 text-2xl font-semibold tracking-tight text-foreground">
        {value}
      </p>
      {hint && (
        <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
          <span
            className={cn("h-1.5 w-1.5 shrink-0 rounded-full", INDICATOR_COLOR[indicator])}
            aria-hidden="true"
          />
          {hint}
        </p>
      )}
    </div>
  );
}
