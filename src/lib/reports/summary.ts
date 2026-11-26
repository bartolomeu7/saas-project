/**
 * Transforma a resposta de `report_summary` (somada no banco) nos dados da tela e do CSV. Função pura, sem acesso a
 * banco, para ter teste unitário.
 */
import { buildDailySeries } from "../sales/daily-series.ts";
import { computeNetResult, sumOperatingExpenses, sumOtherIncome } from "../finance/dre.ts";
import type { ReportRange, ReportTrendPoint, ReportsWorkspace } from "../../types/report.ts";

const PAYMENT_LABELS: Record<string, string> = {
  cash: "Dinheiro",
  pix: "Pix",
  debit: "Débito",
  credit: "Crédito",
  other: "Outro",
};

type Numeric = number | string;

export interface ReportSummaryRow {
  revenue: Numeric;
  cost_of_goods: Numeric;
  completed_sales: Numeric;
  days: Array<{ date: string; value: Numeric }>;
  items: Array<{ item_type: string; description: string; quantity: Numeric; revenue: Numeric }>;
  payments: Array<{ method: string | null; received: Numeric; refunded: Numeric }>;
  entries: Array<{ direction: string; source_type: string | null; amount: Numeric }>;
  receivable: Numeric;
  receivable_overdue: Numeric;
  payable: Numeric;
  payable_overdue: Numeric;
  appointments: Record<string, Numeric>;
}

const number = (value: unknown) => Number(value ?? 0);
/** Soma em centavos: 0,1 + 0,2 não pode virar 0,30000000000000004 num total. */
const cents = (value: number) => Math.round(value * 100) / 100;

export function buildReportWorkspace(
  raw: ReportSummaryRow,
  range: ReportRange,
  inventory: ReportsWorkspace["inventory"]
): ReportsWorkspace {
  const revenue = number(raw.revenue);
  const costOfGoods = number(raw.cost_of_goods);
  const completedSales = number(raw.completed_sales);
  const otherIncome = cents(sumOtherIncome(raw.entries.filter((entry) => entry.direction === "income")));
  const operatingExpenses = cents(sumOperatingExpenses(raw.entries.filter((entry) => entry.direction === "expense")));

  // um ponto por dia do período, inclusive os sem venda (o meio-dia de São Paulo cai sempre no próprio dia)
  const salesTrend: ReportTrendPoint[] = buildDailySeries(
    raw.days.map((day) => ({ completed_at: `${day.date}T12:00:00-03:00`, total_amount: day.value })),
    range.from,
    range.to
  ).map(({ date, label, value }) => ({ date, label, value }));

  const allItems = raw.items.map((item) => ({
    description: item.description,
    quantity: number(item.quantity),
    revenue: number(item.revenue),
    itemType: item.item_type === "service" ? ("service" as const) : ("product" as const),
  }));

  const paymentMethods = raw.payments.map((payment) => {
    const method = payment.method ?? "other";
    return { method, label: PAYMENT_LABELS[method] ?? method, amount: cents(number(payment.received) - number(payment.refunded)) };
  });
  const refunds = cents(raw.payments.reduce((sum, payment) => sum + number(payment.refunded), 0));

  const status = (name: string) => number(raw.appointments[name]);

  return {
    range,
    summary: {
      revenue,
      costOfGoods,
      completedSales,
      averageTicket: completedSales ? revenue / completedSales : null,
      otherIncome,
      operatingExpenses,
      netResult: computeNetResult({ revenue, costOfGoods, otherIncome, operatingExpenses }),
      received: cents(paymentMethods.reduce((sum, payment) => sum + payment.amount, 0)),
      refunds,
      accountsReceivable: number(raw.receivable),
      accountsPayable: number(raw.payable),
      overdueReceivables: number(raw.receivable_overdue),
      overduePayables: number(raw.payable_overdue),
    },
    salesTrend,
    topItems: allItems.slice(0, 8),
    allItems,
    paymentMethods,
    appointments: {
      total: Object.values(raw.appointments).reduce<number>((sum, value) => sum + number(value), 0),
      scheduled: status("scheduled"),
      confirmed: status("confirmed"),
      completed: status("completed"),
      cancelled: status("cancelled"),
      noShow: status("no_show"),
    },
    inventory,
  };
}

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** Em períodos longos o gráfico mostra um ponto por mês, inclusive os meses sem venda. */
export function groupByMonth(days: ReportTrendPoint[]): ReportTrendPoint[] {
  const months = new Map<string, ReportTrendPoint>();
  // atravessando anos, "jan" sozinho não diz qual
  const severalYears = new Set(days.map((day) => day.date.slice(0, 4))).size > 1;
  for (const day of days) {
    const date = day.date.slice(0, 7);
    const name = MONTHS[Number(date.slice(5)) - 1] ?? date;
    const month = months.get(date) ?? { date, label: severalYears ? `${name}/${date.slice(2, 4)}` : name, value: 0 };
    month.value = cents(month.value + day.value);
    months.set(date, month);
  }
  return Array.from(months.values());
}
