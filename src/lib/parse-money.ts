/**
 * Maior valor em dinheiro aceito (coluna numeric(12,2) do banco). Acima disso o Postgres devolve "numeric field overflow",
 * que não diz nada ao usuário: as telas checam antes e mostram MONEY_TOO_LARGE_MESSAGE.
 */
export const MAX_MONEY_INPUT = 999_999_999.99;
export const MONEY_TOO_LARGE_MESSAGE = "Valor muito alto (máximo R$ 999.999.999,99).";

/** "280,00", "1.280,50" ou "280.5" → número; vazio ou inválido → null (o banco só aceita número). */
export function parseMoneyInput(value: string | undefined | null): number | null {
  const raw = (value ?? "").trim();
  if (!raw) return null;
  const normalized = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
  const number = Number(normalized);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

/** true quando o valor tem fração de centavo ("0,005", "10,999"): o banco arredondaria sem avisar. */
export function hasFractionOfCent(value: string | undefined | null): boolean {
  const parsed = parseMoneyInput(value);
  return parsed !== null && Math.abs(parsed * 100 - Math.round(parsed * 100)) > 1e-6;
}

export const FRACTION_OF_CENT_MESSAGE = "Use no máximo 2 casas decimais (centavos).";

/** true quando o texto é um valor válido, porém acima do limite do banco. */
export function isMoneyTooLarge(value: string | undefined | null): boolean {
  const parsed = parseMoneyInput(value);
  return parsed !== null && parsed > MAX_MONEY_INPUT;
}
