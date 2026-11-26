import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildSalesCsv, buildSalesReport, parseSalesFilters, salesQuery } from "../../src/lib/reports/sales.ts";

const read = (path) => readFileSync(new URL("../../" + path, import.meta.url), "utf8");
const ID = "1742f32b-c457-4377-9f8f-16a05f279d94";

const raw = {
  sales: 2,
  revenue: "35.00",
  cost: "12.00",
  discounts: "5.00",
  items: [
    { item_type: "product", description: "Shampoo", quantity: "3.000", revenue: "30.00", cost: "12.00", uncosted_quantity: 0, uncosted_revenue: 0 },
    { item_type: "service", description: "=Brinde", quantity: 2, revenue: 10, cost: 0, uncosted_quantity: 2, uncosted_revenue: 10 },
    { item_type: "product", description: "Misto", quantity: 4, revenue: 0, cost: 1, uncosted_quantity: 1, uncosted_revenue: 0 },
  ],
  sellers: [{ user_id: ID, sales: 2, revenue: 35, cost: 12 }, { user_id: "x", sales: 1, revenue: 1, cost: 0 }],
  customers: [{ id: ID, name: "Cliente A" }],
};

test("filtros: só entra formato válido", () => {
  assert.deepEqual(parseSalesFilters({}), { item: "", customer: "", seller: "" });
  assert.deepEqual(parseSalesFilters({ item: "  gel  ", cliente: "sem", quem: ID }), { item: "gel", customer: "sem", seller: ID });
  assert.deepEqual(parseSalesFilters({ cliente: "abc", quem: "sem" }), { item: "", customer: "", seller: "" });
  assert.equal(parseSalesFilters({ item: "a".repeat(200) }).item.length, 80);
  assert.equal(salesQuery({ item: "a&b", customer: "", seller: "" }), "aba=vendas&item=a%26b");
});

test("margem por item, marcação de item sem custo e nomes", () => {
  const report = buildSalesReport(raw, new Map([[ID, "Dona"]]));
  assert.equal(report.margin, 23);
  assert.equal(report.marginPercent, 65.7);
  assert.deepEqual(report.items.map((i) => [i.margin, i.marginPercent, i.uncosted]), [[18, 60, "none"], [10, 100, "all"], [-1, null, "part"]]);
  assert.equal(report.uncostedItems, 2);
  assert.equal(report.uncostedRevenue, 10);
  assert.deepEqual(report.sellers.map((s) => s.name), ["Dona", "Fora da equipe atual"]);
});

test("CSV da aba Vendas: filtros, itens, quem registrou e texto sem virar fórmula", () => {
  const report = buildSalesReport(raw, new Map([[ID, "Dona"]]));
  const csv = buildSalesCsv(report, { period: "custom", from: "", to: "", fromDate: "2026-11-01", toDate: "2026-11-26", label: "x" }, { item: "", customer: ID, seller: ID });
  assert.ok(csv.startsWith("\uFEFF"));
  assert.ok(csv.includes('"Cliente";"Cliente A"') && csv.includes('"Registrada por";"Dona"'));
  assert.ok(csv.includes('"Shampoo";"produto";3,000;30,00;12,00;18,00;"sim"'));
  assert.ok(csv.includes('"\'=Brinde";"serviço";2,000;10,00;0,00;10,00;"não"'));
  assert.ok(csv.includes('"Dona";2;35,00;23,00'));
});

test("aba Vendas: mesma permissão, erro visível e função que respeita o isolamento", () => {
  const page = read("src/app/(app)/app/relatorios/page.tsx");
  assert.ok(page.indexOf('can(current.role, "reports.view")') < page.indexOf("<ReportSales"));
  const route = read("src/app/(app)/app/relatorios/export/route.ts");
  assert.ok(route.indexOf('can(current.role, "reports.view")') < route.indexOf("getSalesReport("));
  assert.ok(read("src/lib/reports/sales-queries.ts").includes('required(result, "calcular o relatório de vendas")'));
  const sql = read("supabase/migrations/20261126180000_relatorios_vendas.sql");
  assert.ok(sql.includes("security invoker") && sql.includes("from public, anon"));
});

// Achado no reteste: ao escolher uma pessoa pela tabela, o campo continuava em "Todos" e o próximo filtro a perdia.
test("o formulário de filtros é refeito quando o filtro muda por link", () => {
  assert.ok(read("src/components/app/report-sales.tsx").includes('<form key={href({})} method="get"'));
});
