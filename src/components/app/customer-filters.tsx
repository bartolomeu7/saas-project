"use client";

import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

const FILTERS: { label: string; value: "all" | "active" | "inactive" }[] = [
  { label: "Todos", value: "all" },
  { label: "Ativos", value: "active" },
  { label: "Inativos", value: "inactive" },
];

export interface CustomerFilterCounts {
  all: number;
  active: number;
  inactive: number;
}

export function CustomerFilters({ counts }: { counts?: CustomerFilterCounts }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const current = searchParams.get("status") ?? "all";
  const [isPending, startTransition] = useTransition();

  function setStatus(value: string) {
    const params = new URLSearchParams(searchParams.toString());

    if (value === "all") {
      params.delete("status");
    } else {
      params.set("status", value);
    }
    params.delete("page");

    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  }

  return (
    <div className="flex items-center gap-2">
      <div className="inline-flex max-w-full flex-wrap rounded-lg border border-border bg-background/40 p-1">
        {FILTERS.map((filter) => (
          <button
            key={filter.value}
            type="button"
            onClick={() => setStatus(filter.value)}
            aria-pressed={current === filter.value}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              current === filter.value
                ? "bg-primary/15 text-primary-text shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {filter.label}
            {counts && (
              <span className="ml-1.5 rounded-full bg-background/60 px-1.5 py-0.5 text-[11px] tabular-nums text-muted-foreground">
                {counts[filter.value]}
              </span>
            )}
          </button>
        ))}
      </div>
      {isPending && (
        <span className="text-xs text-muted-foreground">Atualizando...</span>
      )}
    </div>
  );
}
