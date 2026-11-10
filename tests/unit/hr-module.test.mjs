import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { can, canAccessPath, MODULE_PERMISSIONS, PERMISSION_ROLES } from "../../src/lib/permissions/matrix.ts";
import { NAV_GROUPS } from "../../src/components/app/nav-items.ts";
import { formatPeriod } from "../../src/lib/hr/labels.ts";

const read = (rel) => readFileSync(path.join(process.cwd(), rel), "utf8");

test("RH é só do dono e do administrador (matriz, rota e menu)", () => {
  for (const permission of ["hr.view", "hr.manage"]) {
    assert.deepEqual([...PERMISSION_ROLES[permission]].sort(), ["admin", "owner"], permission);
    assert.equal(can("employee", permission), false);
    assert.equal(can(null, permission), false);
  }
  assert.equal(MODULE_PERMISSIONS["/app/rh"], "hr.view");
  assert.equal(canAccessPath("employee", "/app/rh"), false);
  assert.equal(canAccessPath("employee", "/app/rh/pagamentos/abc"), false);
  assert.equal(canAccessPath("admin", "/app/rh/novo"), true);
  assert.equal(canAccessPath("owner", "/app/rh"), true);
});

test("RH aparece no grupo Gestão do menu", () => {
  const gestao = NAV_GROUPS.find((group) => group.label === "Gestão");
  assert.ok(gestao?.items.some((item) => item.href === "/app/rh" && item.label === "RH" && item.enabled));
});

test("migração: tabelas de RH só leem pelo app; escrita de dinheiro só por função", () => {
  const sql = read("supabase/migrations/20261108160000_hr_informal.sql");
  for (const table of ["hr_employees", "hr_payments", "hr_time_entries", "hr_adjustments"]) {
    assert.ok(sql.includes(`alter table public.${table} enable row level security`), `${table} sem RLS`);
    assert.ok(sql.includes(`revoke all on table`) && sql.includes(table));
  }
  // pagamentos, presença e ajustes: sem INSERT/UPDATE/DELETE para o app
  assert.match(sql, /revoke insert, update, delete, truncate on table public\.hr_payments, public\.hr_time_entries, public\.hr_adjustments from authenticated/);
  // só owner/admin leem
  assert.ok(sql.includes("hr_manager_company_id()"));
  assert.match(sql, /cm\.role in \('owner'::public\.company_role, 'admin'::public\.company_role\)/);
  // fase 1 = só informal
  assert.ok(sql.includes("hr_employees_phase1_informal_only check (mode = 'informal')"));
  // dinheiro reaproveita o caminho do Financeiro (não duplica regra de caixa)
  assert.ok(sql.includes("public.create_financial_entry("));
  assert.ok(sql.includes("'Pessoal'"));
  // todas as funções com search_path fixo e sem execução anônima
  const functions = [...sql.matchAll(/create or replace function public\.(hr_\w+)/g)].map((m) => m[1]);
  for (const name of ["hr_manager_company_id", "hr_compute_period", "hr_period_preview", "hr_set_attendance", "hr_add_adjustment", "hr_delete_adjustment", "hr_close_period", "hr_pay_payment", "hr_cancel_payment"]) {
    assert.ok(functions.includes(name), `${name} não encontrada`);
  }
  assert.ok((sql.match(/set search_path = public/g) ?? []).length >= 9);
  for (const name of ["hr_close_period", "hr_pay_payment", "hr_cancel_payment", "hr_set_attendance", "hr_add_adjustment", "hr_delete_adjustment", "hr_period_preview"]) {
    assert.match(sql, new RegExp(`revoke all on function public\\.${name}\\([^)]*\\) from public, anon;`), `${name} sem revoke de anon`);
  }
  // o cálculo interno não é executável pelo app
  assert.match(sql, /revoke all on function public\.hr_compute_period\(uuid, date, date\) from public, anon, authenticated/);
  // idempotência do pagamento e proteção contra sobreposição
  assert.ok(sql.includes("if v_pay.status = 'paid' then return v_pay;"));
  assert.ok(sql.includes("se sobrepõe a este período"));
  // existe rollback e bateria
  assert.ok(existsSync("supabase/rollback/20261108160000_hr_informal.down.sql"));
  assert.ok(existsSync("tests/sql/hr_informal.sql"));
});

test("a coluna da prévia não usa palavra reservada do SQL", () => {
  assert.ok(!/\boverlaps boolean/.test(read("supabase/migrations/20261108160000_hr_informal.sql")));
  assert.ok(read("supabase/migrations/20261108160000_hr_informal.sql").includes("has_overlap boolean"));
});

test("ações: toda mutação confere o papel e usa as funções do banco para dinheiro", () => {
  const src = read("src/lib/hr/actions.ts");
  const actions = [...src.matchAll(/export async function (\w+Action)/g)].map((m) => m[1]);
  assert.deepEqual(
    actions.sort(),
    ["addAdjustmentAction", "cancelPaymentAction", "cancelVacationAction", "closePayrollAction", "closePeriodAction", "closeThirteenthAction", "closeVacationPayAction", "createEmployeeAction", "deleteAdjustmentAction", "payPaymentAction", "saveHrSettingsAction", "scheduleVacationAction", "setAttendanceAction", "setEmployeeStatusAction", "updateEmployeeAction"].sort()
  );
  // cada ação confere o papel antes de gravar
  assert.equal((src.match(/await manager\(\)/g) ?? []).length, actions.length);
  assert.ok(src.includes('can(current.role, "hr.manage")'));
  for (const rpc of ["hr_set_attendance", "hr_add_adjustment", "hr_delete_adjustment", "hr_close_period", "hr_pay_payment", "hr_cancel_payment", "hr_save_clt_employee", "hr_save_settings", "hr_close_payroll"]) {
    assert.ok(src.includes(`rpc("${rpc}"`), rpc);
  }
  // pagamento, presença e ajustes nunca são gravados direto, e o app não escreve no financeiro por conta própria
  assert.ok(!/from\("hr_(payments|time_entries|adjustments)"\)\s*\.(insert|update|delete|upsert)/.test(src));
  assert.ok(!src.includes('from("financial_entries")') && !src.includes('from("cash_movements")'));
  // cadastro informal grava direto; CLT só pela função atômica (funcionário + contrato)
  assert.ok(src.includes('mode: "informal"'));
  assert.ok(src.includes('rpc("hr_save_clt_employee"'));
  // os caminhos de dinheiro atualizam Caixa e Financeiro
  assert.ok(src.includes('revalidatePath("/app/caixa")') && src.includes('revalidatePath("/app/financeiro")'));
});

test("todas as páginas do RH conferem a permissão antes de mostrar dados", () => {
  const root = path.join(process.cwd(), "src/app/(app)/app/rh");
  const pages = [];
  (function walk(dir) {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (entry === "page.tsx") pages.push(full);
    }
  })(root);
  assert.ok(pages.length >= 6, `esperava 6 páginas, achei ${pages.length}`);
  for (const page of pages) {
    const src = readFileSync(page, "utf8");
    assert.match(src, /can\(current\.role, "hr\.(view|manage)"\)/, page);
    assert.ok(src.includes("<NoAccess"), page);
  }
});

test("consultas filtram pela empresa e o recibo avisa que não substitui documentos oficiais", () => {
  const queries = read("src/lib/hr/queries.ts");
  assert.ok((queries.match(/\.eq\("company_id", companyId\)/g) ?? []).length >= 5);
  assert.ok(read("src/app/(app)/app/rh/pagamentos/[id]/page.tsx").includes("não substitui holerite"));
});

test("período por extenso", () => {
  assert.equal(formatPeriod("2026-11-02", "2026-11-08"), "02/11 a 08/11/2026");
  assert.equal(formatPeriod("2026-12-28", "2027-01-03"), "28/12/2026 a 03/01/2027");
  assert.equal(formatPeriod("2026-11-08", "2026-11-08"), "08/11/2026");
});

test("fase 2 (CLT): migração, tabelas de imposto versionadas e folha com limites de sanidade", () => {
  const sql = read("supabase/migrations/20261108170000_hr_clt.sql");
  // modo CLT liberado, mas sempre mensal e de valor fixo
  assert.ok(sql.includes("drop constraint if exists hr_employees_phase1_informal_only"));
  assert.ok(sql.includes("check (mode <> 'clt' or (rate_kind = 'fixed' and pay_frequency = 'monthly'))"));
  // tabelas novas: RLS, só leitura para o app, sem anon
  for (const table of ["hr_employee_clt", "hr_settings", "hr_tax_tables"]) {
    assert.ok(sql.includes(`alter table public.${table} enable row level security`), table);
    assert.match(sql, new RegExp(`revoke insert, update, delete, truncate on table public\\.${table} from authenticated`), table);
    assert.match(sql, new RegExp(`revoke all on table public\\.${table} from anon`), table);
  }
  // seed 2026 com fonte e versionado por vigência
  assert.ok(sql.includes("valid_from") && sql.includes("unique (kind, valid_from)"));
  assert.ok(sql.includes("Portaria MPS/MF nº 13") && sql.includes("Lei 15.270/2025"));
  assert.ok(sql.includes('"upto":8475.55') && sql.includes('"zero_until":5000.00') && sql.includes('"minimum_wage":1621.00'));
  // a folha: base e lançamentos do banco; INSS/IRRF/VT do app só com limites de sanidade
  assert.ok(sql.includes("create or replace function public.hr_close_payroll("));
  assert.ok(sql.includes("INSS acima do limite esperado") && sql.includes("IRRF acima do limite esperado"));
  assert.ok(sql.includes("Já existe um pagamento para este funcionário neste mês"));
  assert.ok(sql.includes("if v_net < 0 then raise exception"));
  assert.ok(sql.includes("Funcionário CLT: feche a folha do mês"), "período por dias recusa CLT");
  // funções novas sem execução anônima
  for (const name of ["hr_close_payroll", "hr_save_settings", "hr_save_clt_employee"]) {
    assert.match(sql, new RegExp(`revoke all on function public\\.${name}\\([^)]*\\) from public, anon;`), name);
  }
  assert.ok(sql.includes("revoke all on function public.hr_employees_guard() from public, anon, authenticated"));
  assert.ok(existsSync("supabase/rollback/20261108170000_hr_clt.down.sql"));
  assert.ok(existsSync("tests/sql/hr_clt.sql"));
  // o rollback não apaga CLT em silêncio
  assert.ok(read("supabase/rollback/20261108170000_hr_clt.down.sql").includes("Rollback interrompido"));
});

test("fase 2 (CLT): a folha usa as tabelas do banco e o app calcula a mesma conta na tela e ao fechar", () => {
  const service = read("src/lib/hr/payroll-service.ts");
  assert.ok(service.includes("getPayrollTables(") && service.includes("estimatePayroll("));
  const actions = read("src/lib/hr/actions.ts");
  assert.ok(actions.includes("buildPayroll("), "ao fechar, recalcula no servidor (não aceita número do navegador)");
  const close = actions.slice(actions.indexOf("export async function closePayrollAction"));
  assert.ok(close.includes("p_inss: result.inss") && close.includes("p_irrf: result.irrf") && close.includes("p_vt: result.vt"));
  assert.ok(!/formData\.get\("(inss|irrf|vt)"\)/.test(close), "INSS/IRRF/VT nunca vêm do formulário");
  // a tela avisa que é estimativa
  assert.ok(read("src/app/(app)/app/rh/[id]/page.tsx").includes("Estimativa para controle interno"));
  const queries = read("src/lib/hr/queries.ts");
  assert.ok(queries.includes('.from("hr_tax_tables")') && queries.includes(".lte(\"valid_from\", monthStart)"));
});

test("fase 3 (férias e 13º): migração com regras da CLT, rollback que não apaga em silêncio", () => {
  const sql = read("supabase/migrations/20261108180000_hr_vacation_13th.sql");
  // tipos novos de pagamento, sem quebrar os antigos
  assert.ok(sql.includes("kind = 'vacation'") && sql.includes("kind = 'thirteenth'"));
  // férias e 13º não entram na checagem de sobreposição da folha/período
  assert.equal((sql.match(/p\.kind in \('period', 'payroll'\)/g) ?? []).length, 3);
  // tabela de férias: RLS, sem escrita direta, sem anon
  assert.ok(sql.includes("alter table public.hr_vacations enable row level security"));
  assert.match(sql, /revoke insert, update, delete, truncate on table public\.hr_vacations from authenticated/);
  assert.match(sql, /revoke all on table public\.hr_vacations from anon/);
  // regras da CLT no banco
  assert.ok(sql.includes("no máximo 3 períodos"));
  assert.ok(sql.includes("pelo menos 14 dias"));
  assert.ok(sql.includes("pelo menos 5 dias"));
  assert.ok(sql.includes("Sem direito a férias"));
  assert.ok(sql.includes("se sobrepõem a outro período"));
  // 13º: uma parcela por ano, 1ª sem descontos, prazos oficiais
  assert.ok(sql.includes("hr_payments_thirteenth_unique"));
  assert.ok(sql.includes("A 1ª parcela não tem descontos"));
  assert.ok(sql.includes("make_date(p_year, 11, 30)") && sql.includes("make_date(p_year, 12, 20)"));
  // limites de sanidade também aqui
  assert.ok((sql.match(/INSS acima do limite esperado/g) ?? []).length >= 3);
  // funções novas sem execução anônima
  for (const name of ["hr_schedule_vacation", "hr_cancel_vacation", "hr_close_vacation_pay", "hr_close_thirteenth"]) {
    const at = sql.indexOf(`revoke all on function public.${name}(`);
    assert.ok(at > 0, `${name} sem revoke`);
    assert.ok(sql.slice(at, at + 300).includes(") from public, anon;"), `${name} sem revoke de anon`);
  }
  assert.ok(existsSync("supabase/rollback/20261108180000_hr_vacation_13th.down.sql"));
  assert.ok(existsSync("tests/sql/hr_vacation_13th.sql"));
  const down = read("supabase/rollback/20261108180000_hr_vacation_13th.down.sql");
  assert.ok(down.includes("Rollback interrompido"));
});

test("fase 3: o app recalcula férias e 13º no servidor e nunca aceita imposto do formulário", () => {
  const src = read("src/lib/hr/actions.ts");
  for (const rpc of ["hr_schedule_vacation", "hr_cancel_vacation", "hr_close_vacation_pay", "hr_close_thirteenth"]) {
    assert.ok(src.includes(`rpc("${rpc}"`), rpc);
  }
  const vacation = src.slice(src.indexOf("export async function closeVacationPayAction"), src.indexOf("export async function closeThirteenthAction"));
  assert.ok(vacation.includes("calcVacationPay(") && vacation.includes("p_inss: result.inss") && vacation.includes("p_irrf: result.irrf"));
  const thirteenth = src.slice(src.indexOf("export async function closeThirteenthAction"));
  assert.ok(thirteenth.includes("thirteenthAvos(") && thirteenth.includes("calcThirteenth("));
  assert.ok(!/formData\.get\("(inss|irrf|avos|total)"\)/.test(vacation + thirteenth), "impostos e avos nunca vêm do formulário");
  // a tela avisa que é estimativa
  assert.ok(read("src/app/(app)/app/rh/[id]/page.tsx").includes("Estimativas para controle interno"));
});
