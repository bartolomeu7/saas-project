import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function SectionHeading({
  eyebrow,
  title,
  description,
  align = "center",
  className,
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: string;
  align?: "center" | "left";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3",
        align === "center" ? "items-center text-center" : "items-start text-left",
        className
      )}
    >
      {eyebrow && (
        <span className="inline-flex items-center rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-xs font-medium uppercase tracking-wide text-primary">
          {eyebrow}
        </span>
      )}
      <h2 className="max-w-3xl text-balance text-3xl font-semibold leading-[1.1] tracking-tight text-foreground sm:text-4xl">
        {title}
      </h2>
      {description && (
        <p className="max-w-xl text-balance text-base leading-7 text-muted-foreground sm:text-lg">
          {description}
        </p>
      )}
    </div>
  );
}
