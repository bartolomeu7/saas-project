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
