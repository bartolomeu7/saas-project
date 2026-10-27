import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { NAV_GROUPS } from "../../src/components/app/nav-items.ts";
import { APP_ROUTE_PATTERNS, buildAppBreadcrumbs, isKnownAppRoute } from "../../src/components/app/route-labels.ts";

/**
 * Onda 2 — breadcrumb do header da área da empresa. Função pura + conferência da lista de rotas com o sistema de
 * arquivos (para o breadcrumb nunca apontar para uma página que não existe).
 */
const modules = NAV_GROUPS.flatMap((g) => g.items.filter((i) => i.enabled).map(({ label, href }) => ({ label, href })));
const labels = (path) => buildAppBreadcrumbs(path, modules).map((c) => c.label);
const crumbs = (path) => buildAppBreadcrumbs(path, modules);

/** Lê `src/app/(app)/app` e devolve os caminhos de página (`[id]` mantido como está no diretório). */
function pageRoutes() {
  const root = fileURLToPath(new URL("../../src/app/(app)/app/", import.meta.url));
  const out = [];
  (function walk(dir, route) {
    for (const entry of readdirSync(dir)) {
      const full = `${dir}/${entry}`;
      if (statSync(full).isDirectory()) walk(full, `${route}/${entry.replace(/^\[.+\]$/, "[id]")}`);
      else if (entry === "page.tsx") out.push(route);
    }
  })(root.replace(/\/$/, ""), "/app");
  return out.sort();
}

describe("lista de rotas do breadcrumb", () => {
  it("é exatamente o conjunto de páginas existentes em (app)/app", () => {
    assert.deepEqual([...APP_ROUTE_PATTERNS].sort(), pageRoutes());
  });

  it("reconhece rotas com identificador", () => {
    assert.equal(isKnownAppRoute("/app/clientes/9f1c"), true);
    assert.equal(isKnownAppRoute("/app/clientes/9f1c/editar"), true);
    assert.equal(isKnownAppRoute("/app/assinatura/pagamento"), false);
    assert.equal(isKnownAppRoute("/app/inexistente"), false);
  });
});

describe("breadcrumb da área da empresa", () => {
  it("Dashboard e módulos usam o rótulo do menu lateral", () => {
    assert.deepEqual(labels("/app"), ["Dashboard"]);
    assert.deepEqual(labels("/app/clientes"), ["Clientes"]);
    assert.deepEqual(labels("/app/fornecedores"), ["Fornecedores"]);
  });

  it("subpáginas conhecidas ganham rótulo próprio; identificadores viram Detalhes (sem expor o id)", () => {
    assert.deepEqual(labels("/app/clientes/novo"), ["Clientes", "Novo"]);
    assert.deepEqual(labels("/app/vendas/nova"), ["Vendas", "Nova"]);
    assert.deepEqual(labels("/app/produtos/categorias"), ["Produtos", "Categorias"]);
    assert.deepEqual(labels("/app/clientes/2b6f0c1e-aaaa-bbbb-cccc-1234567890ab"), ["Clientes", "Detalhes"]);
    assert.deepEqual(labels("/app/clientes/2b6f0c1e-aaaa-bbbb-cccc-1234567890ab/editar"), ["Clientes", "Detalhes", "Editar"]);
    assert.deepEqual(labels("/app/assinatura/planos"), ["Assinatura", "Planos"]);
    for (const c of crumbs("/app/clientes/2b6f0c1e-aaaa-bbbb-cccc-1234567890ab")) assert.doesNotMatch(c.label, /2b6f0c1e/);
  });

  it("só há link para páginas que existem; o último item (página atual) nunca é link", () => {
    const c = crumbs("/app/produtos/categorias/abc/editar");
    assert.deepEqual(c.map((x) => x.label), ["Produtos", "Categorias", "Detalhes", "Editar"]);
    assert.equal(c[0].href, "/app/produtos");
    assert.equal(c[1].href, "/app/produtos/categorias");
    assert.equal(c[2].href, undefined); // /app/produtos/categorias/abc não é página
    assert.equal(c[3].href, undefined);
    assert.equal(crumbs("/app/assinatura/pagamento/xyz")[1].href, undefined); // /app/assinatura/pagamento não é página
    assert.equal(crumbs("/app/clientes")[0].href, undefined);
  });

  it("rota fora do menu não gera breadcrumb; barra final é ignorada", () => {
    assert.deepEqual(crumbs("/app/inexistente/x"), []);
    assert.deepEqual(labels("/app/clientes/"), ["Clientes"]);
  });

  it("todo módulo habilitado do menu resolve para si mesmo", () => {
    for (const m of modules.filter((x) => x.href !== "/app")) assert.deepEqual(labels(m.href), [m.label]);
  });

  it("o header usa a função e o <nav> do breadcrumb tem rótulo acessível", () => {
    const src = readFileSync(new URL("../../src/components/app/header.tsx", import.meta.url), "utf8");
    assert.match(src, /buildAppBreadcrumbs\(/);
    assert.match(src, /aria-label="Localização na área da empresa"/);
  });
});
