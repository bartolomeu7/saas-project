import "server-only";

import { cache } from "react";
import { createSessionClient } from "@/lib/supabase/server";
import { endOfDaySaoPaulo, startOfMonthSaoPaulo, todayDateSaoPaulo } from "@/lib/timezone";
import {
  computeNetResult,
  NON_OPERATING_EXPENSE_SOURCES,
  sumOperatingExpenses,
  sumOtherIncome,
  sumPayableBalance,
  entriesOfComposition,
} from "@/lib/finance/dre";
import type {
  AccountReceivable,
  AccountsPayable,
  CostCenter,
  FinanceDashboard,
  FinancialCategory,
  FinancialEntry,
} from "@/types/finance";

const money = (value: unknown) => Number(value ?? 0);

// As regras do resultado (DRE) ficam em `./dre` (puras, compartilhadas com os Relatórios).
export { NON_OPERATING_EXPENSE_SOURCES };

export function resolveFinanceMonthRange(now = new Date()): { from: string; to: string } {
  return {
    from: startOfMonthSaoPaulo(0, now).toISOString(),
    to: endOfDaySaoPaulo(now).toISOString(),
  };
}

export async function listFinancialCategories(companyId: string): Promise<FinancialCategory[]> {
  const supabase = await createSessionClient();
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
  const supabase = await createSessionClient();
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
  const supabase = await createSessionClient();

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
  const supabase = await createSessionClient();

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
      const dueDate = todayDateSaoPaulo(new Date(row.sold_at));

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
  const supabase = await createSessionClient();
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

/** Teto da lista de detalhe; acima disso a tela avisa que o total mostrado é parcial. */
export const COMPOSITION_LIMIT = 2000;

export async function listEntriesForComposition(companyId: string, composition: "outras-receitas" | "despesas" | "recebimentos", fromDate: string, toDate: string) {
  const supabase = await createSessionClient();
  let query = supabase
    .from("financial_entries")
    .select("id, direction, description, amount, occurred_on, method, source_type")
    .eq("company_id", companyId)
    .eq("status", "posted")
    .gte("occurred_on", fromDate)
    .lte("occurred_on", toDate);
  if (composition === "despesas") query = query.eq("direction", "expense");
  else if (composition === "outras-receitas") query = query.eq("direction", "income");
  else query = query.in("source_type", ["sale_payment", "sale_payment_refund"]);
  const { data, error } = await query.order("occurred_on", { ascending: false }).order("created_at", { ascending: false }).limit(COMPOSITION_LIMIT);
  if (error) throw new Error("Não foi possível listar os lançamentos: " + error.message);
  const rows = data ?? [];
  return { entries: entriesOfComposition(rows, composition), truncated: rows.length >= COMPOSITION_LIMIT };
}

export const getFinanceDashboard = cache(async function getFinanceDashboard(
  companyId: string
): Promise<FinanceDashboard> {
  const supabase = await createSessionClient();
  const { from, to } = resolveFinanceMonthRange();
  // `occurred_on` é data-calendário de São Paulo: os limites também (não o dia UTC do instante).
  const fromDate = todayDateSaoPaulo(new Date(from));
  const toDate = todayDateSaoPaulo(new Date(to));

  const [salesResult, expensesResult, cashResult, payableResult, summaryResult] = await Promise.all([
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
      .gte("occurred_on", fromDate)
      .lte("occurred_on", toDate),
    supabase
      .from("financial_entries")
      .select("direction, amount, source_type")
      .eq("company_id", companyId)
      .eq("status", "posted")
      .gte("occurred_on", fromDate)
      .lte("occurred_on", toDate),
    supabase
      .from("accounts_payable")
      .select("amount, paid_amount, due_date, status")
      .eq("company_id", companyId)
      .in("status", ["open", "partial"]),
    // a lista de recebíveis para em 100 vendas: o total precisa somar todas, no banco (a mesma conta dos Relatórios)
    supabase.rpc("report_summary", { p_company_id: companyId, p_from: from, p_to: to, p_appointments_to: to }),
  ]);

  if (summaryResult.error || !summaryResult.data) {
    throw new Error("Não foi possível somar as contas a receber: " + (summaryResult.error?.message ?? "sem resposta"));
  }
  const summary = summaryResult.data as unknown as { receivable: number | string; receivable_overdue: number | string };

  const sales = salesResult.data ?? [];
  const revenue = sales.reduce((sum, row) => sum + money(row.total_amount), 0);
  const costOfGoods = sales.reduce((sum, row) => sum + money(row.total_cost), 0);
  const grossProfit = revenue - costOfGoods;

  // Compra de estoque é caixa/contas a pagar, mas não é despesa de DRE: o custo entra no resultado
  // quando o produto é vendido. Estorno de venda cancelada também fica fora: a venda cancelada já
  // não entra na receita, então o estorno não pode virar despesa (ver ./dre).
  const operatingExpenses = sumOperatingExpenses(expensesResult.data ?? []);

  // Receita lançada à mão no Financeiro (sem venda): entra no resultado como "Outras receitas".
  // O recebimento de vendas fica de fora porque o faturamento já vem das próprias vendas.
  const incomeRows = (cashResult.data ?? []).filter((row) => row.direction === "income");
  const otherIncome = sumOtherIncome(incomeRows);

  const cashIn = incomeRows.reduce((sum, row) => sum + money(row.amount), 0);
  const cashOut = (cashResult.data ?? [])
    .filter((row) => row.direction === "expense")
    .reduce((sum, row) => sum + money(row.amount), 0);

  const accountsPayable = sumPayableBalance(payableResult.data ?? []);
  const today = todayDateSaoPaulo();
  const overduePayableCount = (payableResult.data ?? []).filter(
    (row) => row.due_date && row.due_date < today
  ).length;

  return {
    revenue,
    costOfGoods,
    grossProfit,
    otherIncome,
    operatingExpenses,
    netResult: computeNetResult({ revenue, costOfGoods, otherIncome, operatingExpenses }),
    cashIn,
    cashOut,
    cashNet: cashIn - cashOut,
    accountsPayable,
    accountsReceivable: money(summary.receivable),
    overduePayableCount,
    overdueReceivableCount: Number(summary.receivable_overdue),
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
