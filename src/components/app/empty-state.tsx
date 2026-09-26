import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Inbox } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function EmptyState({
  title,
  description,
  actionLabel,
  actionHref,
  icon: Icon = Inbox,
}: {
  title: string;
  description?: string;
  actionLabel?: string;
  actionHref?: string;
  icon?: LucideIcon;
}) {
  return (
    <div className="flex animate-in fade-in flex-col items-center gap-3 rounded-lg border border-dashed border-border bg-card/40 p-10 text-center duration-300 motion-reduce:animate-none">
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary ring-8 ring-primary/5">
        <Icon className="h-5 w-5" strokeWidth={1.75} />
      </span>
      <p className="font-medium text-foreground">{title}</p>
      {description && (
        <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      )}
      {actionLabel && actionHref && (
        <Link href={actionHref} className={cn(buttonVariants({ size: "sm" }), "mt-2")}>
          {actionLabel}
        </Link>
      )}
    </div>
  );
}
