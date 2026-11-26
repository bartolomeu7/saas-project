import { goalProgress, monthName } from "@/lib/reports/goal";
import { formatCurrency } from "@/lib/format";

/** Barra e texto da meta do mês, usados nos Relatórios e no Dashboard. */
export function RevenueGoalProgress({ target, revenue, today }: { target: number; revenue: number; today: string }) {
  const progress = goalProgress(target, revenue, today);
  const percent = progress.percent.toLocaleString("pt-BR") + "%";

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <strong className="text-2xl font-semibold tracking-tight">{percent}</strong>
        <span className="text-sm text-muted-foreground">
          {formatCurrency(revenue)} de {formatCurrency(target)}
        </span>
      </div>
      <div
        className="h-2.5 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-label={`Meta de ${monthName(today)}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.min(100, progress.percent)}
        aria-valuetext={percent}
      >
        <div className="prime-meter h-full rounded-full bg-primary" style={{ width: `${Math.min(100, progress.percent)}%` }} />
      </div>
      <p className="text-sm text-muted-foreground">
        {progress.reached ? (
          <>Meta batida{progress.surplus > 0 ? `: ${formatCurrency(progress.surplus)} acima` : ""}.</>
        ) : (
          <>
            Faltam {formatCurrency(progress.remaining)}: {formatCurrency(progress.perDay)} por dia{" "}
            {progress.daysLeft === 1 ? "hoje, o último dia do mês" : `nos ${progress.daysLeft} dias que restam, contando hoje`}.{" "}
            {progress.onPace ? "No ritmo." : `Abaixo do ritmo: o esperado até hoje era ${formatCurrency(progress.expected)}.`}
          </>
        )}
      </p>
    </div>
  );
}
