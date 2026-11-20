/**
 * Datas do pedido de compra. Antes o servidor aceitava vencimento em 2099, previsão em 2020 e vencimento ANTES da
 * previsão de entrega (a conta a pagar nascia vencida sem a mercadoria ter chegado).
 * Datas em "AAAA-MM-DD"; vazio é permitido (ambas são opcionais).
 */
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function validDate(value: string): boolean {
  const match = DATE_PATTERN.exec(value);
  if (!match) return false;
  const [, year, month, day] = match.map(Number) as [number, number, number, number];
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/** Mensagem do primeiro problema nas datas do pedido, ou null. `currentYear` entra por parâmetro para o teste. */
export function purchaseDatesError(expectedAt: string, dueDate: string, currentYear: number): string | null {
  const expected = expectedAt.trim();
  const due = dueDate.trim();
  for (const [label, invalid, value] of [["Previsão de entrega", "inválida", expected], ["Vencimento", "inválido", due]] as const) {
    if (!value) continue;
    if (!validDate(value)) return `${label} ${invalid}.`;
    const year = Number(value.slice(0, 4));
    if (year < currentYear - 1 || year > currentYear + 5) {
      return `${label} fora do período permitido (de 1 ano atrás a 5 anos à frente).`;
    }
  }
  if (expected && due && due < expected) return "O vencimento não pode ser antes da previsão de entrega.";
  return null;
}
