import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";

/**
 * Travas do plano de novo visual (docs/ui/PLANO_IMPLANTACAO_NOVO_VISUAL_20261102.md). As ondas mudam só a
 * apresentação: estas checagens impedem, sem querer, trocar a base técnica ou enfraquecer guardas.
 * Se uma decisão do dono mudar o plano (ex.: aprovar uma biblioteca de gráficos), atualize o plano e esta lista.
 */
const base = new URL("../../", import.meta.url);
const read = (p) => readFileSync(new URL(p, base), "utf8");
const pkg = JSON.parse(read("package.json"));
const deps = { ...pkg.dependencies, ...pkg.devDependencies };

describe("base técnica preservada (regra fixa 1 e decisão D2)", () => {
  it("mantém React 18, Tailwind 3 e Zod 3", () => {
    assert.match(deps.react, /^\^?18\./);
    assert.match(deps.tailwindcss, /^\^?3\./);
    assert.match(deps.zod, /^\^?3\./);
  });

  it("não adiciona as bibliotecas dos templates sem decisão do dono", () => {
    for (const name of ["recharts", "motion", "framer-motion", "next-themes", "react-hook-form", "@tanstack/react-table", "nuqs"]) {
      assert.equal(deps[name], undefined, `${name} exige aprovação (decisões D1–D3 do plano)`);
    }
    assert.ok(!Object.keys(deps).some((name) => name.startsWith("@base-ui")), "Base UI: o projeto usa Radix");
  });
});

describe("guardas e rotas fora do escopo visual (regra fixa 2)", () => {
  it("o admin continua protegido por requirePlatformAdmin e o middleware pelas camadas conhecidas", () => {
    assert.match(read("src/app/admin/layout.tsx"), /requirePlatformAdmin\(/);
    const middleware = read("src/middleware.ts");
    assert.match(middleware, /isActivePlatformAdmin/);
    assert.match(middleware, /session_slot_status/);
    assert.match(middleware, /get_my_legal_consent_status/);
  });

  it("o layout do app mantém a ordem de proteção (sessão, consentimento, empresa)", () => {
    const layout = read("src/app/(app)/layout.tsx");
    // posição das chamadas (não dos imports, que vêm em outra ordem)
    const gateCall = layout.indexOf("await evaluateSessionGate(");
    const consentCall = layout.indexOf("await requireLegalConsent(");
    assert.ok(gateCall > -1 && consentCall > gateCall, "evaluateSessionGate deve rodar antes de requireLegalConsent");
    assert.match(layout, /\/onboarding/);
  });

  it("páginas públicas não importam o Clerk", () => {
    for (const file of ["src/components/marketing/site-header.tsx", "src/components/marketing/site-footer.tsx"]) {
      assert.doesNotMatch(read(file), /@clerk\//, file);
    }
  });
});

describe("licença e verificação pós-deploy (regras fixas 5 e 7)", () => {
  it("THIRD_PARTY_NOTICES.md cita as quatro referências MIT", () => {
    const notices = read("THIRD_PARTY_NOTICES.md");
    for (const owner of ["shadcn-ui/ui", "shadcnstore/shadcn-dashboard-landing-template", "Kiranism/next-shadcn-dashboard-starter", "satnaing/shadcn-admin"]) {
      assert.ok(notices.includes(owner), owner);
    }
    assert.match(notices, /Permission is hereby granted, free of charge/);
  });

  it("o script de verificação existe, só lê e não depende de pacotes", () => {
    assert.ok(existsSync(new URL("scripts/verify-production.mjs", base)));
    const script = read("scripts/verify-production.mjs");
    assert.doesNotMatch(script, /method:\s*["'](POST|PUT|PATCH|DELETE)/i);
    assert.doesNotMatch(script, /from\s+["'](?!node:)[^"']+["']/);
  });

  it("o rodapé continua expondo o commit publicado para essa verificação", () => {
    assert.match(read("src/components/marketing/site-footer.tsx"), /data-build-sha=\{BUILD_SHA\}/);
  });
});

describe("Onda B1 — Home: Funcionalidades e Segmentos sem conteúdo inventado", () => {
  const home = read("src/app/(public)/page.tsx");

  it("os cartões só mostram módulos disponíveis (nunca 'em breve' como pronto)", () => {
    assert.match(home, /FEATURES\.filter\(\(feature\) => feature\.available\)\.map\(\(feature\) => \[feature\.name, feature\]\)/);
    assert.match(home, /FEATURE_BY_NAME\.get\(name\)/);
  });

  it("não há depoimentos, logos de clientes nem números de uso na home (D6)", () => {
    assert.doesNotMatch(home, /depoimento|testimonial|nossos clientes|clientes atendidos|\+\s?\d+\s?(mil\s)?(empresas|usuários)/i);
  });

  it("o rótulo dos segmentos não afirma estatística de uso", () => {
    assert.match(home, /Módulos indicados/);
    assert.doesNotMatch(home, /mais usados/i);
  });
});

describe("Onda B2 — Home: Diferenciais, chamada final e rodapé", () => {
  const home = read("src/app/(public)/page.tsx");
  const footer = read("src/components/marketing/site-footer.tsx");

  it("os diferenciais continuam vindo de DIFFERENTIALS (afirmações reais do produto)", () => {
    assert.match(home, /DIFFERENTIALS\.map\(\(item, index\)/);
  });

  it("a chamada final mantém os links de cadastro e login e só cita fatos já existentes na home", () => {
    assert.match(home, /siteConfig\.links\.register/);
    assert.match(home, /siteConfig\.links\.login/);
    assert.match(home, /home-v4-cta__trust/);
    assert.match(home, /Sem renovação automática/);
  });

  it("o rodapé preserva todas as colunas de links legais, o commit publicado e não importa o Clerk", () => {
    for (const href of ["/termos-de-uso", "/politica-de-privacidade", "/politica-de-reembolso", "/direitos-do-titular", "/#precos", "/#faq"]) {
      assert.ok(footer.includes(href), href);
    }
    assert.match(footer, /data-build-sha=\{BUILD_SHA\}/);
    assert.doesNotMatch(footer, /@clerk\//);
  });
});

describe("Onda C — login e cadastro: moldura nova, fluxo do Clerk e do aceite intactos", () => {
  const card = read("src/components/shared/auth/auth-card.tsx");
  const login = read("src/app/(public)/login/page.tsx");
  const register = read("src/app/(public)/register/page.tsx");

  it("a moldura não importa o Clerk (o escopo do Clerk fica nas páginas de login/cadastro)", () => {
    assert.doesNotMatch(card, /@clerk\//);
  });

  it("o login mantém SignIn, redirecionamento seguro e aparência do Clerk", () => {
    assert.match(login, /<SignIn/);
    assert.match(login, /safeNextPath\(/);
    assert.match(login, /appearance=\{clerkAppearance\}/);
  });

  it("o cadastro continua em duas etapas: aceite assinado no servidor antes do SignUp", () => {
    assert.match(register, /verifySignupIntent\(/);
    assert.match(register, /startSignupAction/);
    assert.ok(register.indexOf("<ConsentForm") < register.indexOf("<SignUp"), "aceite vem antes do formulário do Clerk");
    assert.match(register, /step=\{\{ current: 1, total: 2 \}\}/);
    assert.match(register, /step=\{\{ current: 2, total: 2 \}\}/);
  });

  it("os selos do painel só repetem fatos já publicados na home", () => {
    for (const fact of ["Pagamento por Pix", "Sem renovação automática", "Sem instalar nada"]) {
      assert.ok(card.includes(fact), fact);
      assert.ok(read("src/app/(public)/page.tsx").includes(fact) || read("src/config/marketing.ts").includes(fact), fact + " deve existir na home");
    }
  });
});
