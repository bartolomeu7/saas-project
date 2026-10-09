/**
 * Leitura segura dos searchParams das listas do admin. Valores desconhecidos
 * viram `undefined` (filtro ignorado) — nunca vão direto para o banco.
 */

export type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function parseSearch(value: string | string[] | undefined): string | undefined {
  const text = first(value)?.trim().slice(0, 80);
  return text ? text : undefined;
}

export function parsePage(value: string | string[] | undefined): number {
  const page = Number.parseInt(first(value) ?? "1", 10);
  return Number.isFinite(page) && page >= 1 && page <= 100000 ? page : 1;
}

export function parseEnum<T extends string>(
  value: string | string[] | undefined,
  allowed: readonly T[]
): T | undefined {
  const text = first(value);
  return allowed.find((option) => option === text);
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseUuid(value: string | string[] | undefined): string | undefined {
  const text = first(value);
  return text && UUID_PATTERN.test(text) ? text : undefined;
}

/** `YYYY-MM-DD` válido (ou undefined). Mantido como texto para reaparecer no <input type="date">. */
export function parseDateParam(value: string | string[] | undefined): string | undefined {
  const text = first(value);
  if (!text || !/^\d{4}-\d{2}-\d{2}$/.test(text)) return undefined;
  return Number.isNaN(new Date(`${text}T00:00:00-03:00`).getTime()) ? undefined : text;
}

/** Início do dia (horário de Brasília) em ISO, para filtros `>=`. */
export function startOfDayIso(date: string): string {
  return new Date(`${date}T00:00:00-03:00`).toISOString();
}

/** Início do dia SEGUINTE (Brasília) em ISO, para filtros `<` que incluem o dia inteiro. */
export function endOfDayExclusiveIso(date: string): string {
  const next = new Date(`${date}T00:00:00-03:00`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString();
}
