import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildAgendaReport, buildCustomersReport, buildQuotesReport, parseInactiveDays, parseReportTab, share } from "../../src/lib/reports/people.ts";

const read = (path) => readFileSync(new URL("../../" + path, import.meta.url), "utf8");

test("aba e corte de dias vindos do endereço: só valores conhecidos", () => {
  assert.equal(parseReportTab("agenda"), "agenda");
  assert.equal(parseReportTab("toString"), "geral");
  assert.equal(parseReportTab(undefined), "geral");
  assert.equal(parseInactiveDays("90"), 90);
  assert.equal(parseInactiveDays("45"), 30);
  assert.equal(parseInactiveDays(undefined), 30);
  assert.equal(share(1, 0), null);
  assert.equal(share(31, 46), 67.4);
});

test("clientes: compradores, parte das vendas sem cliente e lista de sumidos", () => {
  const report = buildCustomersReport({
    new: { customers: 8, sales: 15, revenue: "1884.10" },
    returning: { customers: 0, sales: 0, revenue: 0 },
    without_customer: { sales: 31, revenue: "1578.70" },
    registered: 23,
    top: [{ id: "a", name: "A", sales: 2, revenue: "630.00", new: true }],
    inactive_30: 3, inactive_60: 2, inactive_90: 1, inactive_total: 3,
    inactive: [{ id: "b", name: "B", last: "2026-01-02", days: 300, sales: 1, spent: "10" }],
    never_bought: 13,
  });
  assert.equal(report.buyers, 8);
  assert.equal(report.sales, 46);
  assert.equal(report.anonymousShare, 67.4);
  assert.deepEqual(report.inactiveCounts, { 30: 3, 60: 2, 90: 1 });
  assert.equal(report.top[0].isNew, true);
});

test("agenda: faltas sobre concluídos e faltas, e linha sem profissional", () => {
  const row = { total: 4, completed: 3, no_show: 1, cancelled: 0, upcoming: 0, unsettled: 0, sales: 1, revenue: "0.10" };
  const report = buildAgendaReport({ professionals: [{ ...row, id: "p", name: "Ana" }, { ...row, id: null, name: null, completed: 0, no_show: 0, revenue: 0.2 }] });
  assert.deepEqual(report.professionals.map((p) => [p.name, p.noShowRate]), [["Ana", 25], ["Sem profissional", null]]);
  assert.equal(report.total, 8);
  assert.equal(report.noShowRate, 25);
  assert.equal(report.revenue, 0.3);
});

test("orçamentos: aprovação ignora rascunho e enviado no prazo; conversão é sobre os aprovados", () => {
  const one = (count, amount) => ({ count, amount });
  const report = buildQuotesReport({
    by_status: { draft: one(4, 40), sent: one(1, 10), expired: one(1, 20), approved: one(1, 30), converted: one(1, 70), rejected: one(1, 40) },
    sold: "70.00",
  });
  assert.equal(report.issued, 9);
  assert.equal(report.issuedAmount, 210);
  assert.deepEqual([report.approved, report.decided, report.approvalRate], [2, 4, 50]);
  assert.deepEqual([report.converted, report.conversionRate], [1, 50]);
  assert.equal(report.rows.find((r) => r.status === "expired").label, "Vencido");
  const empty = buildQuotesReport({ by_status: {}, sold: 0 });
  assert.deepEqual([empty.issued, empty.approvalRate, empty.conversionRate], [0, null, null]);
});

test("abas novas: erro visível, isolamento no banco e sem botão que exporte outra coisa", () => {
  const queries = read("src/lib/reports/people-queries.ts");
  assert.equal((queries.match(/required\(result, /g) ?? []).length, 3);
  const sql = read("supabase/migrations/20261126200000_relatorios_clientes_agenda_orcamentos.sql");
  assert.equal((sql.match(/security invoker/g) ?? []).length, 3);
  assert.equal((sql.match(/from public, anon;/g) ?? []).length, 3);
  const page = read("src/app/(app)/app/relatorios/page.tsx");
  assert.ok(page.includes('{tab === "geral" || tab === "vendas" ? ('));
  for (const component of ["<ReportCustomers ", "<ReportAgenda ", "<ReportQuotes "]) {
    assert.ok(page.indexOf('can(current.role, "reports.view")') < page.indexOf(component), component);
  }
});
