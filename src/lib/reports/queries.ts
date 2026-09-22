import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { startOfDaySaoPaulo, endOfDaySaoPaulo, startOfMonthSaoPaulo, startOfYearSaoPaulo } from "@/lib/timezone";
import { getStockLevel } from "@/types/product";
import type { ReportPeriod, ReportRange, ReportTrendPoint, ReportTopItem, ReportPaymentMethod, ReportsWorkspace } from "@/types/report";

const PERIOD_LABELS: Record<ReportPeriod, string> = {
  today: "Hoje",
  "7d": "Últimos 7 dias",
  "30d": "Últimos 30 dias",
  month: "Este mês",
  year: "Este ano",
};

const PAYMENT_LABELS: Record<string, string> = {
  cash: "Dinheiro",
  pix: "Pix",
  debit: "Débito",
  credit: "Crédito",
  other: "Outro",
};

const money = (value: unknown) => Number(value ?? 0);

function safePeriod(value: string | undefined): ReportPeriod {
  return value && value in PERIOD_LABELS ? (value as ReportPeriod) : "month";
}

export function resolveReportRange(periodInput?: string): ReportRange {
  const period = safePeriod(periodInput);
  const now = new Date();
  const to = endOfDaySaoPaulo(now);
  let from: Date;
  switch (period) {
    case "today": from = startOfDaySaoPaulo(now); break;
    case "7d": from = startOfDaySaoPaulo(new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000)); break;
    case "30d": from = startOfDaySaoPaulo(new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000)); break;
    case "month": from = startOfMonthSaoPaulo(0, now); break;
    case "year": from = startOfYearSaoPaulo(now); break;
  }
  return { period, from: from.toISOString(), to: to.toISOString(), label: PERIOD_LABELS[period] };
}

function dayKey(value: string) {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" }).format(new Date(value));
}

function dayLabel(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" }).format(new Date(value));
}

async function getSalesLayer(companyId: string, range: ReportRange) {
  const supabase = createClient();
  const { data: sales } = await supabase.from("sales").select("id, total_amount, completed_at").eq("company_id", companyId).eq("status", "completed").gte("completed_at", range.from).lte("completed_at", range.to).order("completed_at", { ascending: true });
  const rows = sales ?? [];
  const saleIds = rows.map((row) => row.id);
  let items: Array<{ description: string; quantity: number; total_amount: number; item_type: string }> = [];
  let payments: Array<{ sale_id: string; amount: number; method: string }> = [];

  if (saleIds.length) {
    const [itemResult, paymentResult] = await Promise.all([
      supabase.from("sale_items").select("description, quantity, total_amount, item_type").eq("company_id", companyId).in("sale_id", saleIds),
      supabase.from("sale_payments").select("sale_id, amount, method").eq("company_id", companyId).eq("status", "paid").in("sale_id", saleIds),
    ]);
    items = (itemResult.data ?? []) as typeof items;
    payments = (paymentResult.data ?? []) as typeof payments;
  }

  const revenue = rows.reduce((sum, row) => sum + money(row.total_amount), 0);
  const trendMap = new Map<string, number>();
  for (const row of rows) {
    if (!row.completed_at) continue;
    const key = dayKey(row.completed_at);
    trendMap.set(key, (trendMap.get(key) ?? 0) + money(row.total_amount));
  }

  const salesTrend: ReportTrendPoint[] = Array.from(trendMap.entries()).map(([date, value]) => ({ date, label: dayLabel(date + "T12:00:00"), value }));

  const itemMap = new Map<string, ReportTopItem>();
  for (const row of items) {
    const key = row.item_type + ":" + row.description;
    const item = itemMap.get(key) ?? { description: row.description, quantity: 0, revenue: 0, itemType: row.item_type === "service" ? "service" : "product" };
    item.quantity += money(row.quantity);
    item.revenue += money(row.total_amount);
    itemMap.set(key, item);
  }
  const topItems = Array.from(itemMap.values()).sort((a, b) => b.revenue - a.revenue).slice(0, 8);

  const paymentMap = new Map<string, number>();
  for (const row of payments) paymentMap.set(row.method, (paymentMap.get(row.method) ?? 0) + money(row.amount));
  const paymentMethods: ReportPaymentMethod[] = Array.from(paymentMap.entries()).map(([method, amount]) => ({ method, label: PAYMENT_LABELS[method] ?? method, amount })).sort((a, b) => b.amount - a.amount);

  return { revenue, completedSales: rows.length, averageTicket: rows.length ? revenue / rows.length : null, salesTrend, topItems, paymentMethods };
}

async function getFinanceLayer(companyId: string, range: ReportRange) {
  const supabase = createClient();
  const [expenseResult, receivableSalesResult, payableResult] = await Promise.all([
    supabase.from("financial_entries").select("amount, source_type").eq("company_id", companyId).eq("direction", "expense").eq("status", "posted").gte("occurred_on", range.from.slice(0, 10)).lte("occurred_on", range.to.slice(0, 10)),
    supabase.from("sales").select("id, total_amount, sold_at").eq("company_id", companyId).eq("status", "completed").eq("payment_status", "pending"),
    supabase.from("accounts_payable").select("amount, paid_amount, due_date, status").eq("company_id", companyId).in("status", ["open", "partial"]),
  ]);

  const operatingExpenses = (expenseResult.data ?? []).reduce((sum, row) => row.source_type === "accounts_payable" ? sum : sum + money(row.amount), 0);
  const receivableSales = receivableSalesResult.data ?? [];
  let accountsReceivable = 0;
  let overdueReceivables = 0;
  if (receivableSales.length) {
    const { data: payments } = await supabase.from("sale_payments").select("sale_id, amount").eq("company_id", companyId).eq("status", "paid").in("sale_id", receivableSales.map((row) => row.id));
    const paidBySale = new Map<string, number>();
    for (const payment of payments ?? []) paidBySale.set(payment.sale_id, (paidBySale.get(payment.sale_id) ?? 0) + money(payment.amount));
    const today = new Date().toISOString().slice(0, 10);
    for (const sale of receivableSales) {
      const outstanding = Math.max(0, money(sale.total_amount) - (paidBySale.get(sale.id) ?? 0));
      accountsReceivable += outstanding;
      if (sale.sold_at.slice(0, 10) < today && outstanding > 0) overdueReceivables += 1;
    }
  }

  let accountsPayable = 0;
  let overduePayables = 0;
  const today = new Date().toISOString().slice(0, 10);
  for (const row of payableResult.data ?? []) {
    const outstanding = Math.max(0, money(row.amount) - money(row.paid_amount));
    accountsPayable += outstanding;
    if (row.due_date && row.due_date < today && outstanding > 0) overduePayables += 1;
  }
  return { operatingExpenses, accountsReceivable, accountsPayable, overdueReceivables, overduePayables };
}

async function getAppointmentsLayer(companyId: string, range: ReportRange) {
  const supabase = createClient();
  const { data } = await supabase.from("appointments").select("status").eq("company_id", companyId).gte("starts_at", range.from).lte("starts_at", range.to);
  const rows = data ?? [];
  return {
    total: rows.length,
    scheduled: rows.filter((row) => row.status === "scheduled").length,
    confirmed: rows.filter((row) => row.status === "confirmed").length,
    completed: rows.filter((row) => row.status === "completed").length,
    cancelled: rows.filter((row) => row.status === "cancelled").length,
    noShow: rows.filter((row) => row.status === "no_show").length,
  };
}

async function getInventoryLayer(companyId: string) {
  const supabase = createClient();
  const { data } = await supabase.from("products").select("stock_quantity, minimum_stock").eq("company_id", companyId).eq("status", "active");
  const rows = data ?? [];
  return { lowStock: rows.filter((row) => getStockLevel(row) === "low").length, outOfStock: rows.filter((row) => getStockLevel(row) === "out").length };
}

export const getReportsWorkspace = cache(async function getReportsWorkspace(companyId: string, periodInput?: string): Promise<ReportsWorkspace> {
  const range = resolveReportRange(periodInput);
  const [sales, finance, appointments, inventory] = await Promise.all([getSalesLayer(companyId, range), getFinanceLayer(companyId, range), getAppointmentsLayer(companyId, range), getInventoryLayer(companyId)]);
  return {
    range,
    summary: { revenue: sales.revenue, completedSales: sales.completedSales, averageTicket: sales.averageTicket, operatingExpenses: finance.operatingExpenses, netResult: sales.revenue - finance.operatingExpenses, accountsReceivable: finance.accountsReceivable, accountsPayable: finance.accountsPayable, overdueReceivables: finance.overdueReceivables, overduePayables: finance.overduePayables },
    salesTrend: sales.salesTrend,
    topItems: sales.topItems,
    paymentMethods: sales.paymentMethods,
    appointments,
    inventory,
  };
});