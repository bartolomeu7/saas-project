import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describeChange, parseReportPeriod, previousRange, resolveReportRange, salesDetailHref, MAX_CUSTOM_DAYS } from "../../src/lib/reports/period.ts";
import { compositionTotal, entriesOfComposition } from "../../src/lib/finance/dre.ts";
import { groupByMonth } from "../../src/lib/reports/summary.ts";

const read = (path) => readFileSync(new URL("../../" + path, import.meta.url), "utf8");
// 26/11/2026 às 22h em São Paulo (já é dia 27 em UTC)
const now = new Date("2026-11-27T01:00:00.000Z");
const dates = (r) => [r.fromDate, r.toDate];
const range = (period, from, to, at = now) => resolveReportRange(period, from, to, at);

test("períodos usam o dia de São Paulo", () => {
  assert.deepEqual(dates(range("today")), ["2026-11-26", "2026-11-26"]);
  assert.deepEqual(dates(range("7d")), ["2026-11-20", "2026-11-26"]);
  assert.deepEqual(dates(range("30d")), ["2026-10-28", "2026-11-26"]);
  assert.deepEqual(dates(range("month")), ["2026-11-01", "2026-11-26"]);
  assert.deepEqual(dates(range("year")), ["2026-01-01", "2026-11-26"]);
  assert.equal(range("month").from, "2026-11-01T03:00:00.000Z");
  assert.equal(range("month").to, "2026-11-27T02:59:59.999Z");
  assert.equal(parseReportPeriod("toString"), "month");
  assert.equal(parseReportPeriod(undefined), "month");
});

test("datas personalizadas: aceitas, padrão sem datas e recusadas", () => {
  const ok = range("custom", "2026-10-01", "2026-10-15");
  assert.deepEqual(dates(ok), ["2026-10-01", "2026-10-15"]);
  assert.equal(ok.label, "01/10/2026 a 15/10/2026");
  assert.equal(ok.invalid, undefined);
  assert.equal(range("custom").invalid, undefined);
  assert.deepEqual(dates(range("custom")), ["2026-11-01", "2026-11-26"]);
  for (const [from, to] of [["2026-10-15", "2026-10-01"], ["2026-02-30", "2026-03-01"], ["abc", "2026-03-01"], ["2026-03-01", undefined], ["0001-01-01", "2026-01-01"], ["2000-01-01", "2026-01-01"]]) {
    const bad = range("custom", from, to);
    assert.equal(bad.invalid, true, `${from} ${to}`);
    assert.deepEqual(dates(bad), ["2026-11-01", "2026-11-26"]);
  }
  assert.ok(MAX_CUSTOM_DAYS >= 5 * 365);
});

test("período anterior: mesmos dias no mês e no ano; mesmo tamanho nos demais", () => {
  assert.deepEqual(dates(previousRange(range("today"))), ["2026-11-25", "2026-11-25"]);
  assert.deepEqual(dates(previousRange(range("7d"))), ["2026-11-13", "2026-11-19"]);
  assert.deepEqual(dates(previousRange(range("month"))), ["2026-10-01", "2026-10-26"]);
  assert.deepEqual(dates(previousRange(range("year"))), ["2025-01-01", "2025-11-26"]);
  assert.deepEqual(dates(previousRange(range("custom", "2026-10-01", "2026-10-15"))), ["2026-09-16", "2026-09-30"]);
  // mês anterior mais curto, virada de ano e 29 de fevereiro
  assert.deepEqual(dates(previousRange(range("month", undefined, undefined, new Date("2026-03-31T12:00:00Z")))), ["2026-02-01", "2026-02-28"]);
  assert.deepEqual(dates(previousRange(range("month", undefined, undefined, new Date("2026-01-10T12:00:00Z")))), ["2025-12-01", "2025-12-10"]);
  assert.deepEqual(dates(previousRange(range("year", undefined, undefined, new Date("2028-02-29T12:00:00Z")))), ["2027-01-01", "2027-02-28"]);
});

test("variação: sem percentual quando a base não serve", () => {
  assert.deepEqual(describeChange(150, 100), { direction: "up", percent: 50 });
  assert.deepEqual(describeChange(50, 80), { direction: "down", percent: 37.5 });
  assert.deepEqual(describeChange(10, 10), { direction: "same", percent: 0 });
  assert.deepEqual(describeChange(10, 0), { direction: "up", percent: null });
  assert.deepEqual(describeChange(-5, 100), { direction: "down", percent: null });
  assert.deepEqual(describeChange(100, -50), { direction: "up", percent: null });
});

test("detalhe: a composição usa a mesma regra da soma e o total desconta estornos", () => {
  const rows = [
    { direction: "income", source_type: "sale_payment", amount: 100 },
    { direction: "expense", source_type: "sale_payment_refund", amount: "30.10" },
    { direction: "income", source_type: null, amount: 8 },
    { direction: "expense", source_type: "accounts_payable_payment", amount: 300 },
    { direction: "expense", source_type: "hr_payment", amount: 40 },
    { direction: "expense", source_type: null, amount: 25 },
  ];
  const total = (composition) => compositionTotal(entriesOfComposition(rows, composition), composition);
  assert.equal(total("recebimentos"), 69.9);
  assert.equal(total("outras-receitas"), 8);
  assert.equal(total("despesas"), 65);
  assert.equal(salesDetailHref(range("month")), "/app/vendas?status=completed&base=conclusao&period=custom&from=2026-11-01&to=2026-11-26");
});

test("gráfico por mês mostra o ano quando o período atravessa anos", () => {
  const months = groupByMonth([{ date: "2025-12-31", label: "31/12", value: 1 }, { date: "2026-01-01", label: "01/01", value: 2 }]);
  assert.deepEqual(months.map((m) => m.label), ["dez/25", "jan/26"]);
});

test("a lista de vendas aberta pelo relatório filtra pela conclusão", () => {
  const page = read("src/app/(app)/app/vendas/page.tsx");
  assert.ok(page.includes('searchParams?.base === "conclusao" && status === "completed"'));
  assert.ok(page.includes('dateField: byCompletion ? "completed_at" : "sold_at"'));
  assert.ok(read("src/lib/sales/queries.ts").includes("query.gte(dateField, from)"));
});
