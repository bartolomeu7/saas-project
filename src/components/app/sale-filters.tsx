"use client";

import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";

const STATUS_FILTERS: { label: string; value: "all" | "draft" | "completed" | "cancelled" }[] = [
  { label: "Todos", value: "all" },
  { label: "Rascunho", value: "draft" },
  { label: "Concluídas", value: "completed" },
  { label: "Canceladas", value: "cancelled" },
];

const PAYMENT_FILTERS: { label: string; value: string }[] = [
  { label: "Pagamento: todos", value: "all" },
  { label: "Pagamento: pendente", value: "pending" },
  { label: "Pagamento: pago", value: "paid" },
];

const PERIOD_FILTERS: { label: string; value: string }[] = [
  { label: "Todo o período", value: "all" },
  { label: "Hoje", value: "today" },
  { label: "7 dias", value: "7d" },
  { label: "30 dias", value: "30d" },
  { label: "Mês atual", value: "month" },
  { label: "Ano atual", value: "year" },
  { label: "Personalizado", value: "custom" },
];

export function SaleFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const status = searchParams.get("status") ?? "all";
  const paymentStatus = searchParams.get("paymentStatus") ?? "all";
  const period = searchParams.get("period") ?? "all";

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "all" || value === "") {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    params.delete("page");
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex max-w-full flex-wrap rounded-md border border-border p-1">
          {STATUS_FILTERS.map((filter) => (
            <button
              key={filter.value}
              type="button"
              onClick={() => updateParam("status", filter.value)}
              className={cn(
                "rounded px-3 py-1.5 text-sm font-medium transition-colors",
                status === filter.value
                  ? "bg-secondary text-secondary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {filter.label}
            </button>
          ))}
        </div>

        <NativeSelect
          value={paymentStatus}
          onChange={(event) => updateParam("paymentStatus", event.target.value)}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {PAYMENT_FILTERS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </NativeSelect>

        <NativeSelect
          value={period}
          onChange={(event) => updateParam("period", event.target.value)}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {PERIOD_FILTERS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </NativeSelect>

        {isPending && (
          <span className="text-xs text-muted-foreground">Atualizando...</span>
        )}
      </div>

      {period === "custom" && (
        <form method="get" className="flex flex-wrap items-end gap-3">
          {Array.from(searchParams.entries())
            .filter(([key]) => !["from", "to", "page"].includes(key))
            .map(([key, value]) => (
              <input key={key} type="hidden" name={key} value={value} />
            ))}
          <input type="hidden" name="period" value="custom" />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="from" className="text-xs">
              De
            </Label>
            <Input
              id="from"
              name="from"
              type="date"
              defaultValue={searchParams.get("from")?.slice(0, 10) ?? ""}
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
              defaultValue={searchParams.get("to")?.slice(0, 10) ?? ""}
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
