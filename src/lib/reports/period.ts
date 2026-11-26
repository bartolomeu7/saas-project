/**
 * Período do relatório, período anterior usado na comparação e links para o detalhe. Funções puras, com datas de
 * calendário (AAAA-MM-DD) no fuso de São Paulo.
 */
import { endOfDaySaoPauloFromDateString, startOfDaySaoPauloFromDateString, todayDateSaoPaulo } from "../timezone.ts";
import type { ReportPeriod, ReportRange } from "../../types/report.ts";

const LABELS: Record<Exclude<ReportPeriod, "custom">, string> = {
  today: "Hoje",
  "7d": "Últimos 7 dias",
  "30d": "Últimos 30 dias",
  month: "Este mês",
  year: "Este ano",
};

/** Maior intervalo aceito nas datas personalizadas (5 anos): além disso o gráfico e a consulta perdem o sentido. */
export const MAX_CUSTOM_DAYS = 5 * 366;
const MIN_DATE = "2000-01-01";
const DAY_MS = 24 * 60 * 60 * 1000;

const asUtc = (date: string) => Date.parse(date + "T00:00:00Z");

function addDays(date: string, days: number): string {
  return new Date(asUtc(date) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Quantos dias o intervalo tem, contando as duas pontas. */
export function daysBetween(from: string, to: string): number {
  return Math.round((asUtc(to) - asUtc(from)) / DAY_MS) + 1;
}

function isCalendarDate(value: string | undefined): value is string {
  return !!value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(asUtc(value)) && addDays(value, 0) === value;
}

/** 2026-11-26 → 26/11/2026. */
export function formatDay(date: string): string {
  return date.split("-").reverse().join("/");
}

function buildRange(period: ReportPeriod, fromDate: string, toDate: string, label?: string): ReportRange {
  return {
    period,
    fromDate,
    toDate,
    from: startOfDaySaoPauloFromDateString(fromDate)!.toISOString(),
    to: endOfDaySaoPauloFromDateString(toDate)!.toISOString(),
    label: label ?? (fromDate === toDate ? formatDay(fromDate) : `${formatDay(fromDate)} a ${formatDay(toDate)}`),
  };
}

export function parseReportPeriod(value: string | undefined): ReportPeriod {
  return value === "custom" || (value !== undefined && Object.hasOwn(LABELS, value)) ? (value as ReportPeriod) : "month";
}

export function resolveReportRange(periodInput?: string, from?: string, to?: string, now: Date = new Date()): ReportRange {
  const period = parseReportPeriod(periodInput);
  const today = todayDateSaoPaulo(now);
  const monthStart = today.slice(0, 8) + "01";

  if (period === "custom") {
    if (!from && !to) return buildRange("custom", monthStart, today);
    if (isCalendarDate(from) && isCalendarDate(to) && from <= to && from >= MIN_DATE && daysBetween(from, to) <= MAX_CUSTOM_DAYS) {
      return buildRange("custom", from, to);
    }
    return { ...buildRange("custom", monthStart, today), invalid: true };
  }

  const start = {
    today,
    "7d": addDays(today, -6),
    "30d": addDays(today, -29),
    month: monthStart,
    year: today.slice(0, 4) + "-01-01",
  }[period];
  return buildRange(period, start, today, LABELS[period]);
}

/** O mesmo dia em outro mês; se o mês for mais curto, o último dia dele. `month` vai de 0 a 11 (pode ser negativo). */
function sameDayIn(year: number, month: number, day: number): string {
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(day, lastDay))).toISOString().slice(0, 10);
}

/**
 * Período usado na comparação. "Este mês" compara com os mesmos dias do mês anterior e "Este ano" com o mesmo
 * trecho do ano anterior; os demais, com o intervalo de mesmo tamanho logo antes.
 */
export function previousRange(range: ReportRange): ReportRange {
  const [year, month, day] = range.toDate.split("-").map(Number) as [number, number, number];
  if (range.period === "month") {
    return buildRange("custom", sameDayIn(year, month - 2, 1), sameDayIn(year, month - 2, day));
  }
  if (range.period === "year") {
    return buildRange("custom", `${year - 1}-01-01`, sameDayIn(year - 1, month - 1, day));
  }
  const length = daysBetween(range.fromDate, range.toDate);
  return buildRange("custom", addDays(range.fromDate, -length), addDays(range.fromDate, -1));
}

/**
 * Variação em relação ao período anterior. Sem percentual quando a base é zero ou negativa, ou o valor atual é
 * negativo: "−250% de resultado" não diz nada a ninguém.
 */
export function describeChange(current: number, previous: number): { direction: "up" | "down" | "same"; percent: number | null } {
  const difference = Math.round((current - previous) * 100) / 100;
  const direction = difference > 0 ? "up" : difference < 0 ? "down" : "same";
  const percent = previous > 0 && current >= 0 ? Math.round((Math.abs(difference) / previous) * 1000) / 10 : null;
  return { direction, percent };
}

/** Vendas que compõem o faturamento: concluídas no período, pela data da conclusão. */
export function salesDetailHref(range: ReportRange): string {
  return `/app/vendas?status=completed&base=conclusao&period=custom&from=${range.fromDate}&to=${range.toDate}`;
}

export type EntryComposition = "outras-receitas" | "despesas" | "recebimentos";

/** Lançamentos do Financeiro que compõem um número do relatório. */
export function entriesDetailHref(composition: EntryComposition, range: ReportRange): string {
  return `/app/financeiro?view=lancamentos&composicao=${composition}&de=${range.fromDate}&ate=${range.toDate}`;
}
