import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { agendaDocument, cellText, customersDocument, documentCsv, overviewDocument, quotesDocument, salesDocument } from "../../src/lib/reports/document.ts";
import { renderReportPdf } from "../../src/lib/reports/pdf-document.ts";
import { buildAgendaReport, buildCustomersReport, buildQuotesReport } from "../../src/lib/reports/people.ts";
import { buildSalesReport } from "../../src/lib/reports/sales.ts";
import { buildReportWorkspace } from "../../src/lib/reports/summary.ts";
import { resolveReportRange } from "../../src/lib/reports/period.ts";

const read = (path) => readFileSync(new URL("../../" + path, import.meta.url), "utf8");
const range = resolveReportRange("custom", "2026-11-01", "2026-11-26");
const money = (value) => cellText({ money: value });

const overview = buildReportWorkspace(
  { revenue: "3462.80", cost_of_goods: 855.23, completed_sales: 46, days: [{ date: "2026-11-20", value: 1603.7 }], items: [{ item_type: "service", description: "Corte", quantity: 2, revenue: 100 }],
    payments: [{ method: "pix", received: 100, refunded: 10 }], entries: [], receivable: 669.4, receivable_overdue: 9, payable: 10, payable_overdue: 1, appointments: { completed: 2 } },
  range, { lowStock: 1, outOfStock: 7 }
);
const sales = buildSalesReport(
  { sales: 46, revenue: 3462.8, cost: 855.23, discounts: 99.1, customers: [], sellers: [{ user_id: "u", sales: 46, revenue: 3462.8, cost: 855.23 }],
    items: [{ item_type: "service", description: "=Sem custo \u{1F600}", quantity: 13, revenue: 650, cost: 0, uncosted_quantity: 13, uncosted_revenue: 650 }] },
  new Map([["u", "Dona"]])
);
const group = (customers, saleCount, revenue) => ({ customers, sales: saleCount, revenue });
const customers = buildCustomersReport({ new: group(8, 15, 1884.1), returning: group(0, 0, 0), without_customer: { sales: 31, revenue: 1578.7 }, registered: 23, top: [], inactive_30: 1, inactive_60: 0, inactive_90: 0,
  inactive_total: 1, inactive: [{ id: "b", name: "Bia", last: "2026-10-01", days: 56, sales: 1, spent: 40 }], never_bought: 13 });
const agenda = buildAgendaReport({ professionals: [{ id: "p", name: "Ana", total: 17, completed: 2, no_show: 1, cancelled: 1, upcoming: 0, unsettled: 13, sales: 2, revenue: 100 }] });
const quotes = buildQuotesReport({ by_status: { approved: { count: 2, amount: 1760 } }, sold: 0 });

const documents = [
  overviewDocument(overview),
  salesDocument(sales, range, { item: "", customer: "", seller: "" }),
  customersDocument(customers, range, 30),
  agendaDocument(agenda, range, "2026-11-30"),
  quotesDocument(quotes, range),
];

test("documentos: os totais são os mesmos da tela e cada linha tem o número certo de colunas", () => {
  for (const document of documents) {
    for (const section of document.sections) {
      for (const row of section.rows) assert.equal(row.length, section.columns.length, `${document.title} / ${section.title}`);
    }
  }
  const find = (document, section, label) => document.sections.find((s) => s.title === section).rows.find((r) => r[0] === label);
  assert.deepEqual(find(documents[0], "Como se chega no resultado", "(=) Resultado operacional")[1], { money: overview.summary.netResult });
  assert.deepEqual(find(documents[1], "Resumo", "Margem")[1], { money: sales.margin });
  assert.equal(find(documents[2], "Quem comprou no período", "Vendas sem cliente")[2], 31);
  assert.deepEqual(find(documents[4], "Resumo", "Aprovação")[1], { percent: 100 });
  assert.equal(documents[3].subtitle, "Atendimentos marcados de 01/11/2026 a 30/11/2026");
});

test("CSV das abas: número cru com vírgula, texto protegido e BOM", () => {
  const csv = documentCsv(documents[2]);
  assert.ok(csv.startsWith("\uFEFF"));
  assert.ok(csv.includes('"Novos (primeira compra)";8;15;1884,10'));
  assert.ok(csv.includes('"Bia";"01/10/2026";56;40,00'));
  assert.ok(documentCsv(documents[1]).includes('"\'=Sem custo'));
  assert.ok(documentCsv(documents[3]).includes('"Ana";17;2;1;33,3;1;0;13;100,00'));
});

test("texto do PDF em português", () => {
  assert.equal(money(3462.8).replace(/\s/g, " "), "R$ 3.462,80");
  assert.equal(cellText({ percent: 33.3 }), "33,3%");
  assert.equal(cellText({ percent: null }), "—");
  assert.equal(cellText({ quantity: 5.5 }), "5,5");
});

test("o PDF de cada aba é gerado de verdade, inclusive vazio e com muitas páginas", async () => {
  for (const document of documents) {
    const pdf = await renderReportPdf(document, "Empresa \u{1F600}", "26/11/2026, 15:00");
    assert.equal(pdf.subarray(0, 5).toString(), "%PDF-", document.title);
    assert.ok(pdf.length > 1500);
  }
  const empty = { slug: "x", title: "Vazio", subtitle: "", sections: [{ title: "Nada", columns: ["a", "b"], rows: [] }] };
  assert.equal((await renderReportPdf(empty, "E", "agora")).subarray(0, 5).toString(), "%PDF-");
  const long = { slug: "x", title: "Longo", subtitle: "s", sections: [{ title: "Itens", columns: ["Item", "Valor"], rows: Array.from({ length: 900 }, (_, i) => [`Item ${i} ` + "x".repeat(60), { money: i }]) }] };
  assert.equal((await renderReportPdf(long, "E", "agora")).subarray(0, 5).toString(), "%PDF-");
});

test("exportação: permissão antes de qualquer consulta, e botões nas cinco abas", () => {
  const route = read("src/app/(app)/app/relatorios/export/route.ts");
  for (const call of ["getSalesReport(", "getCustomersReport(", "getAgendaReport(", "getQuotesReport(", "getReportsWorkspace(companyId"]) {
    assert.ok(route.indexOf('can(current.role, "reports.view")') < route.indexOf(call), call);
  }
  const page = read("src/app/(app)/app/relatorios/page.tsx");
  assert.ok(page.includes('exportHref + "&format=pdf"') && page.includes("<ReportPrintButton />"));
  assert.ok(read("src/app/globals.css").includes("body:has(.prime-report)"));
});
