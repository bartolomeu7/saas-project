/**
 * Série diária de faturamento para o gráfico do dashboard. Função pura (sem acesso a banco):
 * recebe as vendas concluídas do período e devolve UM ponto por dia, inclusive dias sem venda (valor 0),
 * no fuso de São Paulo (o mesmo usado nos relatórios).
 */
export interface DailySeriesRow {
  completed_at: string | null;
  total_amount: number | string | null;
}

export interface DailyPoint {
  /** AAAA-MM-DD no fuso de São Paulo. */
  date: string;
  /** DD/MM. */
  label: string;
  /** Faturamento do dia (soma de total_amount das vendas concluídas). */
  value: number;
  /** Quantidade de vendas concluídas no dia. */
  count: number;
}

const DAY_KEY = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" });
const DAY_LABEL = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" });
const STEP_MS = 12 * 60 * 60 * 1000;

export function buildDailySeries(rows: DailySeriesRow[], fromIso: string, toIso: string): DailyPoint[] {
  const start = new Date(fromIso).getTime();
  const end = new Date(toIso).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return [];

  const days = new Map<string, DailyPoint>();
  // Passo de 12 h + deduplicação pela chave do dia: robusto a horário de verão, se um dia voltar a existir.
  for (let t = start; t <= end; t += STEP_MS) {
    const date = DAY_KEY.format(new Date(t));
    if (!days.has(date)) {
      days.set(date, { date, label: DAY_LABEL.format(new Date(t)), value: 0, count: 0 });
    }
  }

  for (const row of rows) {
    if (!row.completed_at) continue;
    const point = days.get(DAY_KEY.format(new Date(row.completed_at)));
    if (!point) continue;
    const amount = Number(row.total_amount ?? 0);
    point.value += Number.isFinite(amount) ? amount : 0;
    point.count += 1;
  }

  return Array.from(days.values());
}
