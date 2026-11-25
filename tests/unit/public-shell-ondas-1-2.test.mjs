import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

/**
 * Ondas 1 e 2 — checagens estáticas do que foi alterado no cabeçalho público e na moldura autenticada. O
 * comportamento real (âncora no menu mobile, sticky) é verificado em navegador; aqui travamos os pontos que
 * regressões costumam desfazer sem querer.
 */
const base = new URL("../../", import.meta.url);
const read = (p) => readFileSync(new URL(p, base), "utf8");

describe("cabeçalho público (Onda 1)", () => {
  const header = read("src/components/marketing/site-header.tsx");
  const css = read("src/app/globals.css");

  it("cada item do menu tem a sua própria página e a atual fica marcada", () => {
    const marketing = read("src/config/marketing.ts");
    const hrefs = [...marketing.matchAll(/\{ label: "[^"]+", href: "\/([a-z-]+)" \}/g)].map((m) => m[1]);
    assert.equal(hrefs.length, 5);
    for (const slug of hrefs) assert.ok(read(`src/app/(public)/${slug}/page.tsx`).includes("<MarketingShell>"), slug);
    assert.match(header, /aria-current=\{pathname === item\.href \? "page" : undefined\}/);
  });

  it("o cabeçalho é sticky e a classe --scrolled tem regra de CSS", () => {
    assert.match(css, /\.prime-site-header\s*\{[^}]*position:\s*sticky/);
    assert.match(css, /\.prime-site-header--scrolled\s*\{/);
  });

  it("CTA 'Criar conta' fica visível no celular e usa os links de siteConfig", () => {
    assert.match(header, /className="flex items-center gap-2 lg:hidden"/);
    assert.match(header, /siteConfig\.links\.register/);
    assert.match(header, /siteConfig\.links\.login/);
  });

  it("cartão de preço usa o token primary-text (sem HSL fixo)", () => {
    // só HSL fixo é proibido; hsl(var(--token)) é permitido
    assert.doesNotMatch(read("src/components/marketing/pricing-card.tsx"), /hsl\(\d/);
  });

  it("cartão de preço reserva a faixa do selo (preços alinhados entre planos com e sem selo)", () => {
    const card = read("src/components/marketing/pricing-card.tsx");
    // o contêiner do selo é renderizado sempre; só o <span> depende de plan.tagline
    assert.match(card, /<div className="mb-3 flex min-h-\[1\.375rem\] items-center">\s*\{plan\.tagline && \(/);
  });
});

describe("moldura autenticada (Onda 2)", () => {
  it("a sidebar marca o item ativo com token e aria-current", () => {
    const sidebar = read("src/components/app/app-sidebar.tsx");
    assert.match(sidebar, /data-\[active=true\]:text-primary-text/);
    assert.match(sidebar, /aria-current=\{isActive \? "page" : undefined\}/);
    assert.doesNotMatch(sidebar, /hsl\(/);
  });

  it("/conta mantém guarda, RPC e painel de exclusão, e ganha skip link e header com landmark", () => {
    const conta = read("src/app/conta/page.tsx");
    assert.match(conta, /redirect\("\/login\?next=\/conta"\)/);
    assert.match(conta, /account_deletion_preview/);
    assert.match(conta, /<DeleteAccountPanel/);
    assert.match(conta, /href="#conteudo"/);
    assert.match(conta, /<main id="conteudo"/);
  });

  it("nenhum arquivo da moldura importa o Clerk fora do menu do usuário (escopo da Etapa 6)", () => {
    for (const f of ["header.tsx", "app-shell.tsx", "app-sidebar.tsx", "route-labels.ts"]) {
      assert.doesNotMatch(read(`src/components/app/${f}`), /@clerk\//, f);
    }
  });
});
