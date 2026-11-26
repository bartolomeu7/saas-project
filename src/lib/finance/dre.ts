/**
 * Regras puras (sem banco) do resultado simplificado (DRE) do Financeiro e dos Relatórios.
 * Ficam aqui, sem `server-only`, para os dois módulos usarem a mesma conta e para teste unitário.
 *
 * `financial_entries.source_type`:
 * - `sale_payment`: recebimento de venda (já contado no faturamento, que vem das vendas);
 * - `sale_payment_refund`: estorno de venda cancelada (a venda cancelada não entra na receita);
 * - `accounts_payable` / `accounts_payable_payment`: compra de estoque (caixa, não DRE);
 * - vazio (`null`): lançamento feito à mão no Financeiro (receita ou despesa avulsa).
 */

/** Despesas que movimentam caixa mas não são despesa operacional do DRE. */
export const NON_OPERATING_EXPENSE_SOURCES: ReadonlySet<string> = new Set([
  "accounts_payable",
  "accounts_payable_payment",
  "sale_payment_refund",
]);

/** Receitas que já estão no faturamento (vendas) e por isso não podem ser somadas de novo. */
export const NON_OTHER_INCOME_SOURCES: ReadonlySet<string> = new Set(["sale_payment"]);

export interface FinancialEntryAmountRow {
  amount: unknown;
  source_type?: string | null;
}

const money = (value: unknown) => Number(value ?? 0);

/** Soma das despesas operacionais do período. */
export function sumOperatingExpenses(rows: readonly FinancialEntryAmountRow[]): number {
  return rows.reduce(
    (sum, row) => (NON_OPERATING_EXPENSE_SOURCES.has(row.source_type ?? "") ? sum : sum + money(row.amount)),
    0
  );
}

/** Soma das receitas avulsas (lançadas à mão), fora o recebimento de vendas. */
export function sumOtherIncome(rows: readonly FinancialEntryAmountRow[]): number {
  return rows.reduce(
    (sum, row) => (NON_OTHER_INCOME_SOURCES.has(row.source_type ?? "") ? sum : sum + money(row.amount)),
    0
  );
}

/** Quanto ainda se deve: valor menos o que já foi pago, nas contas em aberto e parciais. */
export function sumPayableBalance(rows: ReadonlyArray<{ amount: unknown; paid_amount?: unknown }>): number {
  return rows.reduce((sum, row) => sum + Math.max(0, money(row.amount) - money(row.paid_amount)), 0);
}

/** Resultado = faturamento − custo das vendas + outras receitas − despesas operacionais. */
export function computeNetResult(input: {
  revenue: number;
  costOfGoods: number;
  otherIncome: number;
  operatingExpenses: number;
}): number {
  return input.revenue - input.costOfGoods + input.otherIncome - input.operatingExpenses;
}

const isOperatingExpense = (source: string | null | undefined) => !NON_OPERATING_EXPENSE_SOURCES.has(source ?? "");
const isOtherIncome = (source: string | null | undefined) => !NON_OTHER_INCOME_SOURCES.has(source ?? "");

/** Lançamentos que formam um número do relatório, pela mesma regra usada na soma. */
export function entriesOfComposition<T extends { direction: string; source_type?: string | null }>(
  rows: readonly T[],
  composition: "outras-receitas" | "despesas" | "recebimentos"
): T[] {
  return rows.filter((row) => {
    if (composition === "recebimentos") return row.source_type === "sale_payment" || row.source_type === "sale_payment_refund";
    if (composition === "despesas") return row.direction === "expense" && isOperatingExpense(row.source_type);
    return row.direction === "income" && isOtherIncome(row.source_type);
  });
}

/** Total da composição. Nos recebimentos o estorno desconta; nas demais todos somam. */
export function compositionTotal(
  rows: ReadonlyArray<{ direction: string; amount: unknown }>,
  composition: "outras-receitas" | "despesas" | "recebimentos"
): number {
  const total = rows.reduce(
    (sum, row) => sum + (composition === "recebimentos" && row.direction === "expense" ? -money(row.amount) : money(row.amount)),
    0
  );
  return Math.round(total * 100) / 100;
}
