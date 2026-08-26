"use client";

import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

export function RankingSortSelector<T extends string>({
  current,
  labels,
}: {
  current: T;
  labels: Record<T, string>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  function setSort(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("sort", value);
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  }

  return (
    <div className="flex items-center gap-2">
      <div className="inline-flex flex-wrap gap-1 rounded-md border border-border p-1">
        {(Object.keys(labels) as T[]).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setSort(key)}
            className={cn(
              "rounded px-3 py-1.5 text-sm font-medium transition-colors",
              current === key
                ? "bg-secondary text-secondary-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {labels[key]}
          </button>
        ))}
      </div>
      {isPending && <span className="text-xs text-muted-foreground">Atualizando...</span>}
    </div>
  );
}
