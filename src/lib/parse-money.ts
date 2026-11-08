/** "280,00", "1.280,50" ou "280.5" → número; vazio ou inválido → null (o banco só aceita número). */
export function parseMoneyInput(value: string | undefined | null): number | null {
  const raw = (value ?? "").trim();
  if (!raw) return null;
  const normalized = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
  const number = Number(normalized);
  return Number.isFinite(number) && number >= 0 ? number : null;
}
