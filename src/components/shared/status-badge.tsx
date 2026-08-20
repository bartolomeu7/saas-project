import { cn } from "@/lib/utils";

interface StatusBadgeProps {
  label: string;
  online?: boolean;
  className?: string;
}

export function StatusBadge({ label, online = true, className }: StatusBadgeProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-1.5 text-sm font-medium",
        className
      )}
    >
      <span className="relative flex h-2 w-2">
        {online && (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
        )}
        <span
          className={cn(
            "relative inline-flex h-2 w-2 rounded-full",
            online ? "bg-emerald-500" : "bg-red-500"
          )}
        />
      </span>
      {label}
    </div>
  );
}
