import { cn } from "@/lib/utils";

export interface ChartPoint {
  label: string;
  value: number;
  /** Texto do tooltip/leitor de tela (ex.: "R$ 89,00 · 1 pagamento"). */
  detail?: string;
}

/**
 * Gráfico de barras leve (CSS puro, sem dependência de biblioteca de gráficos),
 * acessível: o desenho é aria-hidden e uma tabela equivalente fica disponível
 * para leitores de tela. Cores vêm dos tokens do tema (bg-primary).
 */
export function BarChart({
  data,
  title,
  valueLabel,
  height = 140,
  className,
}: {
  data: ChartPoint[];
  title: string;
  valueLabel: string;
  height?: number;
  className?: string;
}) {
  const max = Math.max(...data.map((point) => point.value), 0);
  const total = data.reduce((sum, point) => sum + point.value, 0);

  return (
    <figure className={cn("flex flex-col gap-2", className)}>
      <figcaption className="sr-only">{title}</figcaption>
      {total === 0 ? (
        <p className="flex items-center justify-center rounded-md border border-dashed border-border text-sm text-muted-foreground" style={{ height }}>
          Sem dados no período.
        </p>
      ) : (
        <div className="flex items-end gap-[3px]" style={{ height }} aria-hidden="true">
          {data.map((point) => (
            <div
              key={point.label}
              title={`${point.label}: ${point.detail ?? point.value}`}
              className="min-w-0 flex-1 rounded-t-sm bg-primary/70 transition-colors hover:bg-primary motion-reduce:transition-none"
              style={{ height: `${max === 0 ? 0 : Math.max(point.value > 0 ? 4 : 0, (point.value / max) * 100)}%` }}
            />
          ))}
        </div>
      )}
      <div className="flex justify-between text-[11px] text-muted-foreground" aria-hidden="true">
        <span>{data[0]?.label}</span>
        <span>{data[data.length - 1]?.label}</span>
      </div>
      <table className="sr-only">
        <caption>{title}</caption>
        <thead>
          <tr>
            <th scope="col">Dia</th>
            <th scope="col">{valueLabel}</th>
          </tr>
        </thead>
        <tbody>
          {data.map((point) => (
            <tr key={point.label}>
              <th scope="row">{point.label}</th>
              <td>{point.detail ?? point.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

/** Barras horizontais para distribuições (assinaturas por plano, pagamentos por método...). */
export function BreakdownBars({
  items,
  emptyLabel = "Sem dados.",
}: {
  items: { label: string; value: number; detail?: string }[];
  emptyLabel?: string;
}) {
  const max = Math.max(...items.map((item) => item.value), 0);

  if (items.length === 0 || max === 0) {
    return <p className="text-sm text-muted-foreground">{emptyLabel}</p>;
  }

  return (
    <ul className="flex flex-col gap-3">
      {items.map((item) => (
        <li key={item.label} className="flex flex-col gap-1">
          <div className="flex items-baseline justify-between gap-2 text-sm">
            <span className="truncate text-foreground">{item.label}</span>
            <span className="shrink-0 text-muted-foreground">{item.detail ?? item.value}</span>
          </div>
          <div
            className="h-2 overflow-hidden rounded-full bg-secondary"
            role="progressbar"
            aria-label={item.label}
            aria-valuemin={0}
            aria-valuemax={max}
            aria-valuenow={item.value}
          >
            <div className="h-full rounded-full bg-primary" style={{ width: `${(item.value / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
