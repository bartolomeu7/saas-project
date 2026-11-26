"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Search } from "lucide-react";
import { OPEN_ADMIN_SEARCH_EVENT } from "@/components/admin/admin-command-menu";
import { BarChart, type ChartPoint } from "@/components/admin/admin-charts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

const REFRESH_MS = 60_000;
const COUNT_MS = 900;

/** Número que conta até o valor. O servidor já entrega o valor final (sem JavaScript ou sem animação, é o que aparece). */
export function CountUp({ value, format = "integer" }: { value: number; format?: "integer" | "currency" }) {
  const [counting, setCounting] = useState<number | null>(null);
  const from = useRef(0);

  useEffect(() => {
    const start = from.current;
    from.current = value;
    if (start === value || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const began = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - began) / COUNT_MS);
      setCounting(progress === 1 ? null : start + (value - start) * (1 - (1 - progress) ** 3));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      from.current = start;
      setCounting(null);
    };
  }, [value]);

  const shown = counting ?? value;
  return <>{format === "currency" ? formatCurrency(shown) : Math.round(shown).toLocaleString("pt-BR")}</>;
}

/** Atualiza o painel a cada minuto (só com a aba visível) e no botão. */
export function LiveRefresh() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") startTransition(() => router.refresh());
    }, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [router]);

  return (
    <Button type="button" variant="outline" size="sm" className="gap-2" disabled={pending} onClick={() => startTransition(() => router.refresh())}>
      <RefreshCw className={cn("size-4", pending && "animate-spin motion-reduce:animate-none")} strokeWidth={1.75} aria-hidden="true" />
      {pending ? "Atualizando…" : "Atualizar"}
    </Button>
  );
}

export function OpenSearchButton() {
  return (
    <Button type="button" size="sm" className="gap-2" onClick={() => window.dispatchEvent(new Event(OPEN_ADMIN_SEARCH_EVENT))}>
      <Search className="size-4" strokeWidth={1.75} aria-hidden="true" /> Buscar no painel
    </Button>
  );
}

const PERIODS = [7, 30] as const;

/** Gráfico diário com a escolha entre 7 e 30 dias (os 30 já vêm do servidor). */
export function PeriodChart({
  title,
  description,
  valueLabel,
  data,
  format = "integer",
}: {
  title: string;
  description: string;
  valueLabel: string;
  data: ChartPoint[];
  format?: "integer" | "currency";
}) {
  const [days, setDays] = useState<(typeof PERIODS)[number]>(30);
  const points = data.slice(-days);
  const total = points.reduce((sum, point) => sum + point.value, 0);

  return (
    <Card className="prime-admin-card">
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
        <div className="flex flex-col gap-1.5">
          <CardTitle className="text-base">{title}</CardTitle>
          <CardDescription>
            {description} Total no período:{" "}
            <strong className="font-semibold text-foreground">{format === "currency" ? formatCurrency(total) : total}</strong>
          </CardDescription>
        </div>
        <div className="flex shrink-0 rounded-lg border border-border p-0.5" role="group" aria-label={`Período de ${title}`}>
          {PERIODS.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={days === option}
              onClick={() => setDays(option)}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none",
                days === option ? "bg-primary/15 text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {option} dias
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        {/* A chave reinicia a animação das barras ao trocar o período. */}
        <BarChart key={days} title={`${title}, últimos ${days} dias`} valueLabel={valueLabel} data={points} height={180} />
      </CardContent>
    </Card>
  );
}
