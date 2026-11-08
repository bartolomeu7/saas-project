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
    ["addAdjustmentAction", "cancelPaymentAction", "closePeriodAction", "createEmployeeAction", "deleteAdjustmentAction", "payPaymentAction", "setAttendanceAction", "setEmployeeStatusAction", "updateEmployeeAction"].sort()
  );
  // cada ação confere o papel antes de gravar
  assert.equal((src.match(/await manager\(\)/g) ?? []).length, actions.length);
  assert.ok(src.includes('can(current.role, "hr.manage")'));
  for (const rpc of ["hr_set_attendance", "hr_add_adjustment", "hr_delete_adjustment", "hr_close_period", "hr_pay_payment", "hr_cancel_payment"]) {
    assert.ok(src.includes(`rpc("${rpc}"`), rpc);
  }
  // pagamento, presença e ajustes nunca são gravados direto, e o app não escreve no financeiro por conta própria
  assert.ok(!/from\("hr_(payments|time_entries|adjustments)"\)\s*\.(insert|update|delete|upsert)/.test(src));
  assert.ok(!src.includes('from("financial_entries")') && !src.includes('from("cash_movements")'));
  // cadastro sempre informal nesta fase
  assert.ok(src.includes('mode: "informal"'));
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
