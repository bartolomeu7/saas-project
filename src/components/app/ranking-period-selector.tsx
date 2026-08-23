"use client";

import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const PERIODS: { label: string; value: string }[] = [
  { label: "Mês atual", value: "month" },
  { label: "Trimestre atual", value: "quarter" },
  { label: "Semestre atual", value: "semester" },
  { label: "Ano atual", value: "year" },
  { label: "Personalizado", value: "custom" },
];

export function RankingPeriodSelector() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const current = searchParams.get("period") ?? "month";
  const [isPending, startTransition] = useTransition();

  function setPeriod(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("period", value);
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <div className="inline-flex flex-wrap gap-1 rounded-md border border-border p-1">
          {PERIODS.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => setPeriod(p.value)}
              className={cn(
                "rounded px-3 py-1.5 text-sm font-medium transition-colors",
                current === p.value
                  ? "bg-secondary text-secondary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
        {isPending && (
          <span className="text-xs text-muted-foreground">Atualizando...</span>
        )}
      </div>

      {current === "custom" && (
        <form method="get" className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="period" value="custom" />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="from" className="text-xs">
              De
            </Label>
            <Input
              id="from"
              name="from"
              type="date"
              defaultValue={searchParams.get("from") ?? ""}
              className="h-9 w-40"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="to" className="text-xs">
              Até
            </Label>
            <Input
              id="to"
              name="to"
              type="date"
              defaultValue={searchParams.get("to") ?? ""}
              className="h-9 w-40"
            />
          </div>
          <button
            type="submit"
            className="h-9 rounded-md border border-border px-3 text-sm font-medium text-foreground hover:bg-secondary"
          >
            Aplicar
          </button>
        </form>
      )}
    </div>
  );
}
