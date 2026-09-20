/**
 * Limites de dia/mês/ano fixados em America/Sao_Paulo, independentes do
 * fuso horário do processo Node (em produção/Vercel isso é UTC por
 * padrão). Usado em qualquer cálculo de período de negócio ("hoje",
 * "este mês", "este ano") — nunca `new Date().setHours(...)` puro, que
 * opera no fuso do processo, não no do usuário brasileiro.
 *
 * America/Sao_Paulo é sempre UTC-3, sem horário de verão (abolido no
 * Brasil desde 2019) — por isso um offset fixo é seguro aqui, sem
 * precisar de uma biblioteca de fuso horário completa.
 */
const SAO_PAULO_OFFSET_MS = 3 * 60 * 60 * 1000;

function saoPauloDateParts(reference: Date): { year: number; month: number; day: number } {
  const shifted = new Date(reference.getTime() - SAO_PAULO_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
  };
}

/** Instante real (UTC) de 00:00:00.000 em São Paulo, no dia do `reference` (padrão: agora). */
export function startOfDaySaoPaulo(reference: Date = new Date()): Date {
  const { year, month, day } = saoPauloDateParts(reference);
  return new Date(Date.UTC(year, month, day, 0, 0, 0, 0) + SAO_PAULO_OFFSET_MS);
}

/** Instante real (UTC) de 23:59:59.999 em São Paulo, no dia do `reference` (padrão: agora). */
export function endOfDaySaoPaulo(reference: Date = new Date()): Date {
  const { year, month, day } = saoPauloDateParts(reference);
  return new Date(Date.UTC(year, month, day, 23, 59, 59, 999) + SAO_PAULO_OFFSET_MS);
}

/** Instante real (UTC) de 00:00:00.000 do dia 1 do mês (0-indexado) informado, em São Paulo. */
export function startOfMonthSaoPaulo(monthOffsetFromCurrent = 0, reference: Date = new Date()): Date {
  const { year, month } = saoPauloDateParts(reference);
  return new Date(Date.UTC(year, month + monthOffsetFromCurrent, 1, 0, 0, 0, 0) + SAO_PAULO_OFFSET_MS);
}

/** Instante real (UTC) de 00:00:00.000 do dia 1 de janeiro do ano corrente, em São Paulo. */
export function startOfYearSaoPaulo(reference: Date = new Date()): Date {
  const { year } = saoPauloDateParts(reference);
  return new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0) + SAO_PAULO_OFFSET_MS);
}

/** Mês corrente (0-indexado) visto no relógio de São Paulo agora. */
export function currentMonthSaoPaulo(reference: Date = new Date()): number {
  return saoPauloDateParts(reference).month;
}

function parseDateOnlyString(dateStr: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr);
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]) - 1, day: Number(match[3]) };
}

/**
 * Instante real (UTC) de 00:00:00.000 em São Paulo para uma data-calendário
 * já escolhida pelo usuário (ex.: valor de um `&lt;input type="date"&gt;`,
 * sempre "YYYY-MM-DD"). Diferente de `new Date("YYYY-MM-DD")`, que o
 * ECMAScript sempre interpreta como UTC (nunca o fuso do usuário) — usar
 * isso diretamente como limite "a partir de" fica sistematicamente 3h
 * adiantado em relação ao início real do dia em São Paulo. Retorna `null`
 * se `dateStr` não estiver no formato esperado (o chamador decide o
 * fallback).
 */
export function startOfDaySaoPauloFromDateString(dateStr: string): Date | null {
  const parts = parseDateOnlyString(dateStr);
  if (!parts) return null;
  return new Date(Date.UTC(parts.year, parts.month, parts.day, 0, 0, 0, 0) + SAO_PAULO_OFFSET_MS);
}

/** Como acima, mas para o instante de 23:59:59.999 em São Paulo. */
export function endOfDaySaoPauloFromDateString(dateStr: string): Date | null {
  const parts = parseDateOnlyString(dateStr);
  if (!parts) return null;
  return new Date(Date.UTC(parts.year, parts.month, parts.day, 23, 59, 59, 999) + SAO_PAULO_OFFSET_MS);
}
