import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildCommissionReport, isRateDate, parsePercentInput } from "../../src/lib/reports/commission.ts";
import { commissionDocument, documentCsv } from "../../src/lib/reports/document.ts";
import { renderReportPdf } from "../../src/lib/reports/pdf-document.ts";
import { parseReportTab } from "../../src/lib/reports/people.ts";
import { resolveReportRange } from "../../src/lib/reports/period.ts";

const read = (path) => readFileSync(new URL("../../" + path, import.meta.url), "utf8");

test("percentual e data digitados", () => {
  for (const [typed, percent] of [["10", 10], ["10,5", 10.5], ["10.25", 10.25], ["12 %", 12], ["0", 0], ["100", 100]]) {
    assert.deepEqual(parsePercentInput(typed), { ok: true, percent }, typed);
  }
  for (const typed of ["", "101", "-1", "10,555", "abc", "1e2", "1.000"]) assert.equal(parsePercentInput(typed).ok, false, typed);
  assert.equal(isRateDate("2026-11-01"), true);
  for (const date of ["2026-02-30", "1999-12-31", "", "01/11/2026"]) assert.equal(isRateDate(date), false, date);
});

const raw = {
  professionals: [
    { id: "a", name: "Ana", services: 2, base: "112.00", commission: "15.20", pending_base: 100, pending_commission: 20 },
    { id: null, name: null, services: 1, base: 50, commission: 0, pending_base: 0, pending_commission: 0 },
  ],
  items: [{ item_id: "i", sale_id: "s", date: "2026-11-05", description: "=Corte", base: "72.00", professional_id: null, professional: null, chosen: false, percent: 0, commission: 0 }],
  items_total: 3,
  team: [{ id: "a", name: "Ana", active: true, percent: "20.00", valid_from: "2026-11-01" }],
};

test("totais, itens sem profissional e aviso de percentual", () => {
  const report = buildCommissionReport(raw);
  assert.deepEqual([report.commission, report.base, report.pendingBase, report.pendingCommission], [15.2, 162, 100, 20]);
  assert.deepEqual(report.unassigned, { services: 1, base: 50 });
  assert.equal(report.professionals[1].name, "Sem profissional");
  assert.equal(report.noRates, false);
  assert.equal(buildCommissionReport({ ...raw, team: [{ ...raw.team[0], percent: null, valid_from: null }] }).noRates, true);
});

test("CSV e PDF da comissão com os mesmos totais", async () => {
  const document = commissionDocument(buildCommissionReport(raw), resolveReportRange("custom", "2026-11-01", "2026-11-26"));
  const csv = documentCsv(document);
  assert.ok(csv.includes('"Comissão do período";15,20'));
  assert.ok(csv.includes('"\'=Corte";"05/11/2026";72,00;"Sem profissional";0,0;0,00'));
  assert.ok(csv.includes("Mostrando 1 de 3"));
  assert.equal((await renderReportPdf(document, "E", "agora")).subarray(0, 5).toString(), "%PDF-");
});

test("comissão: só dono e administrador, gravação pelas funções do banco e vendas intactas", () => {
  assert.equal(parseReportTab("comissao"), "comissao");
  const actions = read("src/lib/reports/commission-actions.ts");
  for (const rpc of ['rpc("set_commission_rate"', 'rpc("set_sale_item_professional"']) {
    assert.ok(actions.lastIndexOf("if (!(await allowed()))", actions.indexOf(rpc)) > 0, rpc);
  }
  const page = read("src/app/(app)/app/relatorios/page.tsx");
  assert.ok(page.indexOf('can(current.role, "reports.view")') < page.indexOf("<ReportCommission "));
  const route = read("src/app/(app)/app/relatorios/export/route.ts");
  assert.ok(route.indexOf('can(current.role, "reports.view")') < route.indexOf("getCommissionReport("));
  const sql = read("supabase/migrations/20261126240000_comissao.sql");
  assert.equal((sql.match(/enable row level security/g) ?? []).length, 2);
  // a migração não pode alterar vendas, itens ou agendamentos
  assert.ok(!/(update|delete from|alter table|insert into) public\.(sales|sale_items|appointments)\b/i.test(sql));
});
