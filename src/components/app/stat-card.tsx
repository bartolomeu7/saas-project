import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";

export function StatCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  icon: LucideIcon;
}) {
  return (
    <Card className="flex items-center gap-3 bg-card/60 p-3.5 shadow-none transition-colors hover:border-primary/30 motion-reduce:transition-none">
      <span className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-md bg-secondary text-muted-foreground min-[400px]:flex">
        <Icon className="h-4 w-4" strokeWidth={1.75} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="break-words text-lg font-semibold leading-tight text-foreground">{value}</p>
        <p className="text-xs leading-tight text-muted-foreground">{label}</p>
      </div>
    </Card>
  );
}
