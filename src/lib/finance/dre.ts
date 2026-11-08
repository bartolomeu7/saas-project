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

/** Resultado = faturamento − custo das vendas + outras receitas − despesas operacionais. */
export function computeNetResult(input: {
  revenue: number;
  costOfGoods: number;
  otherIncome: number;
  operatingExpenses: number;
}): number {
  return input.revenue - input.costOfGoods + input.otherIncome - input.operatingExpenses;
}
