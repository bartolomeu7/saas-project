import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  can,
  canAccessPath,
  canCloseCashRegister,
  canManageMember,
  permissionForPath,
  MODULE_PERMISSIONS,
  PERMISSION_ROLES,
} from "../../src/lib/permissions/matrix.ts";

const ROOT = process.cwd();
const read = (rel) => readFileSync(path.join(ROOT, rel), "utf8");

// Matriz esperada (decisões do dono, 07/11/2026). Se alguém mudar a tabela no código, este teste obriga a mudar aqui também.
const EXPECTED = {
  "finance.view": { owner: true, admin: true, employee: false },
  "reports.view": { owner: true, admin: true, employee: false },
  "suppliers.view": { owner: true, admin: true, employee: false },
  "purchases.view": { owner: true, admin: true, employee: false },
  "pricing.edit": { owner: true, admin: true, employee: false },
  "cost.view": { owner: true, admin: true, employee: false },
  "stock.adjust": { owner: true, admin: true, employee: false },
  "cash.open": { owner: true, admin: true, employee: true },
  "cash.close_any": { owner: true, admin: true, employee: false },
  "cash.manual_movement": { owner: true, admin: true, employee: false },
  "team.manage_staff": { owner: true, admin: true, employee: false },
  "team.manage_admins": { owner: true, admin: false, employee: false },
};

test("a tabela cobre exatamente as permissões esperadas", () => {
  assert.deepEqual(Object.keys(PERMISSION_ROLES).sort(), Object.keys(EXPECTED).sort());
});

for (const [permission, byRole] of Object.entries(EXPECTED)) {
  for (const [role, allowed] of Object.entries(byRole)) {
    test(`${permission}: ${role} ${allowed ? "pode" : "NÃO pode"}`, () => {
      assert.equal(can(role, permission), allowed);
    });
  }
}

test("sem papel (null/undefined) nada é permitido", () => {
  for (const permission of Object.keys(EXPECTED)) {
    assert.equal(can(null, permission), false);
    assert.equal(can(undefined, permission), false);
  }
  assert.equal(canAccessPath(null, "/app/vendas"), false);
});

test("funcionário fecha só o caixa que abriu; dono e admin fecham qualquer um", () => {
  assert.equal(canCloseCashRegister("employee", "u1", "u1"), true);
  assert.equal(canCloseCashRegister("employee", "u1", "u2"), false);
  assert.equal(canCloseCashRegister("employee", null, "u1"), false);
  assert.equal(canCloseCashRegister("employee", "u1", null), false);
  assert.equal(canCloseCashRegister("admin", "u1", "u2"), true);
  assert.equal(canCloseCashRegister("owner", "u1", "u2"), true);
  assert.equal(canCloseCashRegister(null, "u1", "u1"), false);
});

test("admin só gerencia funcionário; só o dono gerencia admin e owner", () => {
  assert.equal(canManageMember("admin", "employee"), true);
  assert.equal(canManageMember("admin", "admin"), false);
  assert.equal(canManageMember("admin", "owner"), false);
  assert.equal(canManageMember("owner", "employee"), true);
  assert.equal(canManageMember("owner", "admin"), true);
  assert.equal(canManageMember("owner", "owner"), true);
  assert.equal(canManageMember("employee", "employee"), false);
});

test("caminhos: módulos restritos exigem permissão; os demais são de qualquer membro", () => {
  assert.equal(permissionForPath("/app/financeiro"), "finance.view");
  assert.equal(permissionForPath("/app/compras/nova"), "purchases.view");
  assert.equal(permissionForPath("/app/compras/123"), "purchases.view");
  assert.equal(permissionForPath("/app/fornecedores/novo"), "suppliers.view");
  assert.equal(permissionForPath("/app/relatorios/export"), "reports.view");
  assert.equal(permissionForPath("/app/vendas"), null);
  assert.equal(permissionForPath("/app/caixa"), null);
  assert.equal(permissionForPath("/app/comprasx"), null, "prefixo parcial não vale");
  assert.equal(canAccessPath("employee", "/app/vendas"), true);
  assert.equal(canAccessPath("employee", "/app/caixa"), true);
  assert.equal(canAccessPath("employee", "/app/financeiro"), false);
  assert.equal(canAccessPath("employee", "/app/relatorios"), false);
  assert.equal(canAccessPath("admin", "/app/financeiro"), true);
});

test("todo módulo restrito existe no menu", () => {
  const nav = read("src/components/app/nav-items.ts");
  for (const href of Object.keys(MODULE_PERMISSIONS)) {
    assert.ok(nav.includes(`href: "${href}"`), `${href} não está no menu`);
  }
});

// As páginas conferem a permissão (defesa na tela; o banco recusa os dados de qualquer forma).
const GUARDED_PAGES = {
  "src/app/(app)/app/financeiro/page.tsx": "finance.view",
  "src/app/(app)/app/compras/page.tsx": "purchases.view",
  "src/app/(app)/app/compras/nova/page.tsx": "purchases.view",
  "src/app/(app)/app/compras/[id]/page.tsx": "purchases.view",
  "src/app/(app)/app/fornecedores/page.tsx": "suppliers.view",
  "src/app/(app)/app/fornecedores/novo/page.tsx": "suppliers.view",
  "src/app/(app)/app/fornecedores/[id]/page.tsx": "suppliers.view",
  "src/app/(app)/app/relatorios/page.tsx": "reports.view",
  "src/app/(app)/app/relatorios/export/route.ts": "reports.view",
};
for (const [file, permission] of Object.entries(GUARDED_PAGES)) {
  test(`${file} confere a permissão ${permission}`, () => {
    assert.ok(read(file).includes(`can(current.role, "${permission}")`));
  });
}

test("ações de produto e serviço respeitam preço e custo", () => {
  for (const file of ["src/lib/products/actions.ts", "src/lib/services/actions.ts"]) {
    const src = read(file);
    assert.ok(src.includes('can(current.role, "pricing.edit")'), `${file}: edição sem checar pricing.edit`);
    assert.ok(src.includes('can(current.role, "cost.view")'), `${file}: criação sem checar cost.view`);
  }
});

test("o custo não vai mais para o navegador nas buscas da venda", () => {
  const src = read("src/lib/sales/queries.ts");
  assert.ok(!/\.select\("id, name, sku, barcode, sale_price, cost_price/.test(src));
  assert.ok(!/\.select\("id, name, sale_price, cost_price/.test(src));
});

test("a página do caixa usa a matriz (funcionário abre; fecha só o próprio)", () => {
  const src = read("src/app/(app)/app/caixa/page.tsx");
  assert.ok(src.includes('can(current.role, "cash.open")'));
  assert.ok(src.includes('can(current.role, "cash.manual_movement")'));
  assert.ok(src.includes("canCloseCashRegister("));
});

test("migration, rollback e bateria SQL da matriz existem", () => {
  for (const rel of [
    "supabase/migrations/20261108000000_permissions_matrix.sql",
    "supabase/rollback/20261108000000_permissions_matrix.down.sql",
    "tests/sql/permissions_matrix.sql",
  ]) {
    assert.ok(existsSync(path.join(ROOT, rel)), `falta ${rel}`);
  }
});
