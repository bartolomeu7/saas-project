import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { endOfDaySaoPaulo, startOfMonthSaoPaulo } from "@/lib/timezone";
import type {
  AccountReceivable,
  AccountsPayable,
  CostCenter,
  FinanceDashboard,
  FinancialCategory,
  FinancialEntry,
} from "@/types/finance";

const money = (value: unknown) => Number(value ?? 0);

/**
 * `financial_entries.source_type` de despesas que movimentam caixa mas não são
 * despesa operacional do DRE: compra de estoque (conta a pagar e o pagamento
 * dela, `accounts_payable_payment`, gravado por pay_accounts_payable) e
 * estorno de pagamento de venda cancelada (`sale_payment_refund`).
 */
export const NON_OPERATING_EXPENSE_SOURCES: ReadonlySet<string> = new Set([
  "accounts_payable",
  "accounts_payable_payment",
  "sale_payment_refund",
]);

export function resolveFinanceMonthRange(now = new Date()): { from: string; to: string } {
  return {
    from: startOfMonthSaoPaulo(0, now).toISOString(),
    to: endOfDaySaoPaulo(now).toISOString(),
  };
}

export async function listFinancialCategories(companyId: string): Promise<FinancialCategory[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("financial_categories")
    .select("*")
    .eq("company_id", companyId)
    .eq("active", true)
    .order("kind", { ascending: true })
    .order("name", { ascending: true });

  return (data ?? []) as FinancialCategory[];
}

export async function listCostCenters(companyId: string): Promise<CostCenter[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("cost_centers")
    .select("*")
    .eq("company_id", companyId)
    .eq("active", true)
    .order("name", { ascending: true });

  return (data ?? []) as CostCenter[];
}

export async function listAccountsPayable(
  companyId: string,
  includePaid = false
): Promise<AccountsPayable[]> {
  const supabase = createClient();

  let query = supabase
    .from("accounts_payable")
    .select("*, suppliers(name)")
    .eq("company_id", companyId)
    .order("due_date", { ascending: true, nullsFirst: false })
    .limit(100);

  if (!includePaid) {
    query = query.in("status", ["open", "partial"]);
  }

  const { data } = await query;
  return (data ?? []) as AccountsPayable[];
}

export async function listAccountsReceivable(companyId: string): Promise<AccountReceivable[]> {
  const supabase = createClient();

  const { data: sales } = await supabase
    .from("sales")
    .select("id, customer_id, sold_at, total_amount, payment_status, customers(name)")
    .eq("company_id", companyId)
    .eq("status", "completed")
    .eq("payment_status", "pending")
    .order("sold_at", { ascending: true })
    .limit(100);

  const rows = sales ?? [];
  if (!rows.length) return [];

  const { data: payments } = await supabase
    .from("sale_payments")
    .select("sale_id, amount")
    .eq("company_id", companyId)
    .eq("status", "paid")
    .in("sale_id", rows.map((row) => row.id));

  const paidBySale = new Map<string, number>();
  for (const payment of payments ?? []) {
    paidBySale.set(payment.sale_id, (paidBySale.get(payment.sale_id) ?? 0) + money(payment.amount));
  }

  return rows
    .map((row) => {
      const paidAmount = paidBySale.get(row.id) ?? 0;
      const outstandingAmount = Math.max(0, money(row.total_amount) - paidAmount);
      const customer = row.customers as { name: string } | null;
      const dueDate = row.sold_at.slice(0, 10);

      return {
        sale_id: row.id,
        customer_id: row.customer_id,
        customer_name: customer?.name ?? null,
        sold_at: row.sold_at,
        due_date: dueDate,
        total_amount: money(row.total_amount),
        paid_amount: paidAmount,
        outstanding_amount: outstandingAmount,
        payment_status: row.payment_status,
      };
    })
    .filter((row) => row.outstanding_amount > 0);
}

export async function listRecentFinancialEntries(
  companyId: string,
  limit = 20
): Promise<FinancialEntry[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("financial_entries")
    .select("*")
    .eq("company_id", companyId)
    .eq("status", "posted")
    .order("occurred_on", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);

  return (data ?? []) as FinancialEntry[];
}

export const getFinanceDashboard = cache(async function getFinanceDashboard(
  companyId: string
): Promise<FinanceDashboard> {
  const supabase = createClient();
  const { from, to } = resolveFinanceMonthRange();

  const [salesResult, expensesResult, cashResult, payableResult, receivables] = await Promise.all([
    supabase
      .from("sales")
      .select("total_amount, total_cost")
      .eq("company_id", companyId)
      .eq("status", "completed")
      .gte("completed_at", from)
      .lte("completed_at", to),
    supabase
      .from("financial_entries")
      .select("amount, source_type")
      .eq("company_id", companyId)
      .eq("direction", "expense")
      .eq("status", "posted")
      .gte("occurred_on", from.slice(0, 10))
      .lte("occurred_on", to.slice(0, 10)),
    supabase
      .from("financial_entries")
      .select("direction, amount")
      .eq("company_id", companyId)
      .eq("status", "posted")
      .gte("occurred_on", from.slice(0, 10))
      .lte("occurred_on", to.slice(0, 10)),
    supabase
      .from("accounts_payable")
      .select("amount, paid_amount, due_date, status")
      .eq("company_id", companyId)
      .in("status", ["open", "partial"]),
    listAccountsReceivable(companyId),
  ]);

  const sales = salesResult.data ?? [];
  const revenue = sales.reduce((sum, row) => sum + money(row.total_amount), 0);
  const costOfGoods = sales.reduce((sum, row) => sum + money(row.total_cost), 0);
  const grossProfit = revenue - costOfGoods;

  const operatingExpenses = (expensesResult.data ?? []).reduce((sum, row) => {
    // Compra de estoque é caixa/contas a pagar, mas não é despesa de DRE:
    // o custo entra no resultado quando o produto é vendido. Estorno de
    // pagamento de venda cancelada também fica fora: a venda cancelada já
    // não entra na receita, então o estorno não pode virar despesa.
    if (NON_OPERATING_EXPENSE_SOURCES.has(row.source_type ?? "")) return sum;
    return sum + money(row.amount);
  }, 0);

  const cashIn = (cashResult.data ?? [])
    .filter((row) => row.direction === "income")
    .reduce((sum, row) => sum + money(row.amount), 0);
  const cashOut = (cashResult.data ?? [])
    .filter((row) => row.direction === "expense")
    .reduce((sum, row) => sum + money(row.amount), 0);

  const accountsPayable = (payableResult.data ?? []).reduce(
    (sum, row) => sum + Math.max(0, money(row.amount) - money(row.paid_amount)),
    0
  );
  const today = new Date().toISOString().slice(0, 10);
  const overduePayableCount = (payableResult.data ?? []).filter(
    (row) => row.due_date && row.due_date < today
  ).length;
  const overdueReceivableCount = receivables.filter(
    (row) => row.due_date && row.due_date < today
  ).length;
  const accountsReceivable = receivables.reduce(
    (sum, row) => sum + row.outstanding_amount,
    0
  );

  return {
    revenue,
    costOfGoods,
    grossProfit,
    operatingExpenses,
    netResult: grossProfit - operatingExpenses,
    cashIn,
    cashOut,
    cashNet: cashIn - cashOut,
    accountsPayable,
    accountsReceivable,
    overduePayableCount,
    overdueReceivableCount,
  };
});

export async function getFinanceWorkspace(companyId: string) {
  const [dashboard, payables, receivables, entries, categories, costCenters] =
    await Promise.all([
      getFinanceDashboard(companyId),
      listAccountsPayable(companyId),
      listAccountsReceivable(companyId),
      listRecentFinancialEntries(companyId),
      listFinancialCategories(companyId),
      listCostCenters(companyId),
    ]);

  return { dashboard, payables, receivables, entries, categories, costCenters };
}
