import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

/**
 * Roadmap de fusão de templates — entregas A (Home), B (login/Clerk) e C (dashboard). Checagens estáticas do que
 * foi alterado e do que NÃO pode mudar (âncoras, conteúdo comercial, consultas do dashboard, fluxo do Clerk). O
 * resultado visual é verificado em navegador (capturas antes × depois no relatório).
 */
const base = new URL("../../", import.meta.url);
const read = (p) => readFileSync(new URL(p, base), "utf8");

describe("Home — composição (entrega A)", () => {
  const page = read("src/app/(public)/page.tsx");

  it("mantém todas as âncoras e os destinos dos CTAs", () => {
    for (const id of ["topo", "problema", "recursos", "produto", "segmentos", "como-funciona", "diferenciais", "precos", "faq"]) {
      assert.match(page, new RegExp(`id="${id}"`), `âncora #${id}`);
    }
    assert.match(page, /href="#produto"/);
    assert.match(page, /href="#precos"/);
    assert.match(page, /siteConfig\.links\.register/);
    assert.match(page, /siteConfig\.links\.login/);
  });

  it("não carrega o Clerk e mantém JSON-LD, ISR e planos reais do banco", () => {
    assert.doesNotMatch(page, /@clerk\//);
    assert.match(page, /<JsonLd data=\{STRUCTURED_DATA\}/);
    assert.match(page, /export const revalidate = 60/);
    assert.match(page, /getPublicPlans\(\)/);
  });

  it("Problema e FAQ usam duas colunas (título à esquerda) e o hero é centralizado em CSS", () => {
    assert.match(page, /lg:grid-cols-\[minmax\(0,\.9fr\)_minmax\(0,1\.1fr\)\]/);
    assert.match(page, /lg:grid-cols-\[minmax\(0,\.8fr\)_minmax\(0,1\.2fr\)\]/);
    const css = read("src/app/home-v2.css");
    assert.match(css, /\.home-v2-hero__layout\s*\{\s*grid-template-columns:\s*minmax\(0,\s*1fr\)/);
    assert.match(css, /\.home-v3-band\s*\{/);
  });
});

describe("Login — correções do Clerk (entrega B)", () => {
  const appearance = read("src/components/shared/auth/clerk-auth-appearance.ts");

  it("corta o 'overflow: hidden' do cardBox e zera a margem do card (rótulo 'Seu e-mail' cortado)", () => {
    assert.match(appearance, /cardBox:\s*\{[^}]*overflow:\s*"visible"/);
    assert.match(appearance, /card:\s*\{[^}]*margin:\s*0/);
  });

  it("anel de foco discreto no campo", () => {
    assert.match(appearance, /formFieldInput:\s*\{\s*"&:focus":\s*\{\s*boxShadow:/);
  });

  it("login e cadastro continuam usando <SignIn/> / <SignUp/> do Clerk e o mesmo fluxo", () => {
    const login = read("src/app/(public)/login/page.tsx");
    assert.match(login, /<SignIn[\s\S]*routing="hash"[\s\S]*signUpUrl="\/register"[\s\S]*forceRedirectUrl=\{safeNextPath/);
    assert.match(read("src/app/(public)/register/page.tsx"), /<SignUp/);
  });
});

describe("Dashboard — hierarquia (entrega C)", () => {
  const dash = read("src/app/(app)/app/page.tsx");

  it("remove as promessas estáticas ('Operação online' e a timeline placeholder)", () => {
    assert.doesNotMatch(dash, /Operação online/);
    assert.doesNotMatch(dash, /prime-live-dot/);
    assert.doesNotMatch(dash, /Histórico recente/);
    assert.doesNotMatch(dash, /Ainda sem linha do tempo/);
  });

  it("não mudou as consultas nem os intervalos dos números", () => {
    assert.match(dash, /resolveSalePeriodRange\("month"\)/);
    assert.match(dash, /getCustomerStats\(company\.id\)/);
    assert.match(dash, /getProductStats\(company\.id\)/);
    assert.match(dash, /getServiceStats\(company\.id\)/);
    assert.match(dash, /getSaleStats\(company\.id, monthRange\.from, monthRange\.to\)/);
    assert.match(dash, /getRecentCustomers\(company\.id, 5\)/);
  });

  it("atalhos (QuickActions) passam a ficar no topo, com o mesmo business_type", () => {
    assert.match(dash, /prime-dashboard-actions[\s\S]*<QuickActions businessType=\{company\.business_type\}/);
    assert.equal((dash.match(/<QuickActions/g) ?? []).length, 1);
  });

  it("'Primeiros passos' só aparece enquanto há etapa pendente", () => {
    assert.match(dash, /const setupDone = completedSetup === 3/);
    assert.match(dash, /\{!setupDone && \(/);
  });

  it("a data de hoje é calculada (dado real), sem selo de status", () => {
    assert.match(dash, /toLocaleDateString\("pt-BR"/);
  });
});
