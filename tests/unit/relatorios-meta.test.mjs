import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { goalProgress, monthName, parseGoalInput } from "../../src/lib/reports/goal.ts";
import { overviewDocument } from "../../src/lib/reports/document.ts";
import { buildReportCsv } from "../../src/lib/reports/csv.ts";
import { buildReportWorkspace } from "../../src/lib/reports/summary.ts";
import { resolveReportRange } from "../../src/lib/reports/period.ts";

const read = (path) => readFileSync(new URL("../../" + path, import.meta.url), "utf8");

test("valor digitado: formatos brasileiros, vazio remove, lixo é recusado", () => {
  for (const [typed, target] of [["5.000,00", 5000], ["5.000", 5000], ["1.234.567", 1234567], ["5000", 5000], ["R$ 5.000,50", 5000.5], ["5000.50", 5000.5], ["", 0], ["  ", 0], ["0", 0]]) {
    assert.deepEqual(parseGoalInput(typed), { ok: true, target }, typed);
  }
  for (const typed of ["abc", "-10", "1,001", "1000000000", "Infinity", "5,000,00"]) {
    assert.equal(parseGoalInput(typed).ok, false, typed);
  }
});

test("andamento: quanto falta, por dia e se está no ritmo", () => {
  const p = goalProgress(6000, 3000, "2026-11-26");
  assert.deepEqual([p.percent, p.reached, p.remaining, p.daysLeft, p.perDay, p.expected, p.onPace], [50, false, 3000, 5, 600, 5200, false]);
  assert.equal(goalProgress(3000, 3000, "2026-11-10").reached, true);
  assert.equal(goalProgress(3000, 3500, "2026-11-10").surplus, 500);
  assert.equal(goalProgress(3000, 1000, "2026-11-10").onPace, true);
  // último dia e mês de fevereiro
  assert.deepEqual([goalProgress(100, 0, "2026-02-28").daysLeft, goalProgress(100, 0, "2028-02-28").daysLeft], [1, 2]);
  // nunca arredonda para cima até parecer batida
  assert.equal(goalProgress(1000, 999.99, "2026-11-30").percent, 99.9);
  assert.equal(monthName("2026-03-01"), "março");
});

test("PDF e CSV da visão geral trazem a meta quando existe", () => {
  const range = resolveReportRange("month", undefined, undefined, new Date("2026-11-26T15:00:00Z"));
  const report = buildReportWorkspace(
    { revenue: 3000, cost_of_goods: 0, completed_sales: 1, days: [], items: [], payments: [], entries: [], receivable: 0, receivable_overdue: 0, payable: 0, payable_overdue: 0, appointments: {} },
    range, { lowStock: 0, outOfStock: 0 }
  );
  const titles = (document) => document.sections.map((s) => s.title);
  assert.ok(titles(overviewDocument(report, 6000)).includes("Meta de novembro"));
  assert.ok(!titles(overviewDocument(report)).includes("Meta de novembro"));
  assert.ok(buildReportCsv(report, 6000).includes('"Meta do mês";6000,00'));
  assert.ok(!buildReportCsv(report).includes("Meta do mês"));
});

test("meta: só dono e administrador, gravação pela função do banco e falha nunca vira 'sem meta'", () => {
  const action = read("src/lib/reports/goal-actions.ts");
  assert.ok(action.indexOf('can(current.role, "reports.view")') < action.indexOf('rpc("set_revenue_goal"'));
  assert.ok(read("src/lib/reports/goal-queries.ts").includes("if (error || !data) throw"));
  const dashboard = read("src/app/(app)/app/page.tsx");
  assert.ok(dashboard.includes("canSeeGoal ? getCurrentRevenueGoal(company.id)"));
  const sql = read("supabase/migrations/20261126220000_meta_faturamento.sql");
  assert.ok(sql.includes("enable row level security"));
  assert.ok(sql.includes("revoke all on public.company_revenue_goals from public, anon, authenticated;"));
});
