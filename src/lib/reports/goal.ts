/**
 * Meta mensal de faturamento: quanto já foi, quanto falta e o ritmo necessário. Funções puras, com teste unitário.
 */
import { isMoneyTooLarge, hasFractionOfCent, parseMoneyInput, FRACTION_OF_CENT_MESSAGE, MONEY_TOO_LARGE_MESSAGE } from "../parse-money.ts";

const cents = (value: number) => Math.round(value * 100) / 100;
const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

/** Nome do mês de uma data AAAA-MM-DD. */
export function monthName(date: string): string {
  return MONTHS[Number(date.slice(5, 7)) - 1] ?? "";
}

/**
 * Valor digitado no campo da meta. Vazio ou zero remove a meta. "5.000" é cinco mil (no uso geral do sistema o ponto
 * sem vírgula é decimal, o que faria de uma meta de cinco mil uma de cinco reais).
 */
export function parseGoalInput(value: string): { ok: true; target: number } | { ok: false; error: string } {
  let text = value.trim().replace(/^R\$\s*/i, "");
  if (!text) return { ok: true, target: 0 };
  if (/^\d{1,3}(\.\d{3})+$/.test(text)) text = text.replaceAll(".", "");
  if (isMoneyTooLarge(text)) return { ok: false, error: MONEY_TOO_LARGE_MESSAGE };
  if (hasFractionOfCent(text)) return { ok: false, error: FRACTION_OF_CENT_MESSAGE };
  const target = parseMoneyInput(text);
  return target === null ? { ok: false, error: "Informe um valor válido, como 5.000,00." } : { ok: true, target };
}

/** `today` é o dia de hoje em São Paulo (AAAA-MM-DD); `revenue`, o faturamento do mês até agora. */
export function goalProgress(target: number, revenue: number, today: string) {
  const [year, month, day] = today.split("-").map(Number) as [number, number, number];
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const remaining = cents(Math.max(0, target - revenue));
  /** Dias que ainda restam, contando hoje. */
  const daysLeft = daysInMonth - day + 1;
  const expected = cents((target * day) / daysInMonth);
  return {
    percent: target > 0 ? Math.floor((revenue / target) * 1000) / 10 : 0,
    reached: target > 0 && revenue >= target,
    remaining,
    surplus: cents(Math.max(0, revenue - target)),
    daysLeft,
    perDay: cents(remaining / daysLeft),
    expected,
    onPace: revenue >= expected,
  };
}
