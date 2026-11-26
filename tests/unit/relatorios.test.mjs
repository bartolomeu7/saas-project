import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildReportWorkspace, groupByMonth } from "../../src/lib/reports/summary.ts";

const read = (path) => readFileSync(new URL("../../" + path, import.meta.url), "utf8");
const noStockAlerts = { lowStock: 0, outOfStock: 0 };

const range = { period: "7d", from: "2026-10-30T03:00:00.000Z", to: "2026-11-05T02:59:59.999Z", fromDate: "2026-10-30", toDate: "2026-11-04", label: "Últimos 7 dias" };
const raw = {
  revenue: "150.00",
  cost_of_goods: 45,
  completed_sales: 2,
  days: [{ date: "2026-10-31", value: 100 }, { date: "2026-11-02", value: "50.00" }],
  items: Array.from({ length: 10 }, (_, i) => ({ item_type: i ? "product" : "service", description: `Item ${i}`, quantity: "1.500", revenue: 10 - i })),
  payments: [{ method: "pix", received: "115.00", refunded: 0 }, { method: "cash", received: 90.1, refunded: 100.3 }],
  entries: [
    { direction: "income", source_type: "sale_payment", amount: 205 },
    { direction: "income", source_type: null, amount: 8 },
    { direction: "expense", source_type: "sale_payment_refund", amount: 100.3 },
    { direction: "expense", source_type: "accounts_payable_payment", amount: 300 },
    { direction: "expense", source_type: null, amount: 25 },
  ],
  receivable: 50,
  receivable_overdue: 1,
  payable: 0,
  payable_overdue: 0,
  appointments: { completed: 2, no_show: 1 },
};

test("resumo do relatório: dias sem venda entram zerados e o resultado segue a regra do Financeiro", () => {
  const report = buildReportWorkspace(raw, range, noStockAlerts);
  assert.deepEqual(report.salesTrend.map((p) => p.label), ["30/10", "31/10", "01/11", "02/11", "03/11", "04/11"]);
  assert.deepEqual(report.salesTrend.map((p) => p.value), [0, 100, 0, 50, 0, 0]);
  assert.equal(report.summary.otherIncome, 8);
  assert.equal(report.summary.operatingExpenses, 25);
  assert.equal(report.summary.netResult, 150 - 45 + 8 - 25);
  assert.equal(report.summary.averageTicket, 75);
  assert.equal(report.topItems.length, 8);
  assert.equal(report.allItems.length, 10);
  assert.equal(report.topItems[0].itemType, "service");
  assert.deepEqual(report.appointments, { total: 3, scheduled: 0, confirmed: 0, completed: 2, cancelled: 0, noShow: 1 });
});

test("resumo do relatório: recebido é o líquido de estornos, em centavos, e pode ser negativo numa forma", () => {
  const report = buildReportWorkspace(raw, range, noStockAlerts);
  assert.deepEqual(report.paymentMethods.map((p) => [p.label, p.amount]), [["Pix", 115], ["Dinheiro", -10.2]]);
  assert.equal(report.summary.received, 104.8);
  assert.equal(report.summary.refunds, 100.3);
});

test("resumo do relatório: sem vendas não há ticket médio e o ano é agrupado por mês", () => {
  const nothing = { ...raw, revenue: 0, completed_sales: 0, days: [], items: [], payments: [], entries: [], appointments: {} };
  const report = buildReportWorkspace(nothing, range, noStockAlerts);
  assert.equal(report.summary.averageTicket, null);
  assert.equal(report.summary.received, 0);
  const months = groupByMonth([
    { date: "2026-01-15", label: "15/01", value: 0.2 },
    { date: "2026-01-31", label: "31/01", value: 0.1 },
    { date: "2026-02-01", label: "01/02", value: 0 },
  ]);
  assert.deepEqual(months, [{ date: "2026-01", label: "jan", value: 0.3 }, { date: "2026-02", label: "fev", value: 0 }]);
});

test("relatórios: falha de consulta vira erro, nunca zero", () => {
  const queries = read("src/lib/reports/queries.ts");
  assert.ok(queries.includes('rpc("report_summary"'));
  assert.ok(queries.includes("if (error || !data) throw"));
  assert.ok(queries.includes("if (error) throw"));
  assert.ok(read("src/app/(app)/app/relatorios/export/route.ts").includes("status: 503"));
});

// Achado no reteste ao vivo: três colunas cortavam os valores em tela média e o "Ano" escondia o mês com vendas.
test("relatórios: cartões em duas colunas na tela média e gráfico sem rolagem lateral", () => {
  const page = read("src/app/(app)/app/relatorios/page.tsx");
  assert.ok(page.includes("grid gap-3 sm:grid-cols-2 lg:grid-cols-3"));
  assert.ok(page.includes("<BreakdownBars") && page.includes("<BarChart"));
  assert.ok(!page.includes("overflow-x-auto"));
});
