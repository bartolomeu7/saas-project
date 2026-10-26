import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

/**
 * Desempenho — Etapa 6: o ClerkProvider (clerk-js + pacote de interface do Clerk, centenas de KB) NÃO fica no layout
 * raiz. A home e as páginas legais, estáticas, não o carregam; toda rota que usa o Clerk no navegador (ou depende da
 * renovação do token da sessão pelo clerk-js) o recebe no seu próprio layout. Estes testes travam as duas pontas:
 * nenhuma rota que precisa do Clerk fica sem ele e nenhuma página pública estática volta a carregá-lo.
 */
const root = fileURLToPath(new URL("../../", import.meta.url));
const SRC = join(root, "src");
const APP = join(SRC, "app");
const toPosix = (p) => p.split(sep).join("/");
const rel = (p) => toPosix(relative(root, p));
const read = (p) => readFileSync(p, "utf8");

const walk = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });

const appFiles = walk(APP);
const pages = appFiles.filter((f) => /[/\\]page\.tsx$/.test(f));
const PROVIDER = /ClerkAppProvider|ClerkSegmentLayout|ClerkProvider/;

/** Layouts (exceto o raiz) que cobrem a página: do diretório dela até src/app. */
function coveringLayouts(page) {
  const out = [];
  for (let dir = dirname(page); dir !== APP && dir.startsWith(APP); dir = dirname(dir)) {
    const layout = join(dir, "layout.tsx");
    if (existsSync(layout)) out.push(layout);
  }
  return out;
}

/** Páginas públicas estáticas que, de propósito, NÃO carregam o Clerk. */
const WITHOUT_CLERK = [
  "src/app/(public)/direitos-do-titular/page.tsx",
  "src/app/(public)/page.tsx",
  "src/app/(public)/politica-de-privacidade/page.tsx",
  "src/app/(public)/politica-de-reembolso/page.tsx",
  "src/app/(public)/termos-de-uso/page.tsx",
  "src/app/conta-excluida/page.tsx",
];

describe("Escopo do ClerkProvider (Etapa 6)", () => {
  it("o layout raiz não renderiza nenhum provider do Clerk", () => {
    const layout = read(join(APP, "layout.tsx"));
    assert.ok(!PROVIDER.test(layout), "o provider no layout raiz volta a injetar o Clerk na home e nas páginas legais");
    assert.ok(!/@clerk\//.test(layout));
  });

  it("toda página fora da lista de públicas estáticas está coberta por um layout com o provider", () => {
    const uncovered = pages
      .filter((page) => !coveringLayouts(page).some((layout) => PROVIDER.test(read(layout))))
      .map(rel)
      .sort();
    assert.deepEqual(uncovered, WITHOUT_CLERK);
  });

  it("as páginas sem Clerk são estáticas/públicas e não importam nada de @clerk nem componentes que o usem", () => {
    for (const path of WITHOUT_CLERK) {
      const src = read(join(root, path));
      assert.ok(!/@clerk\//.test(src), path);
      assert.ok(!/\b(useClerk|useAuth|useUser|SignedIn|SignedOut|UserButton)\b/.test(src), path);
    }
    for (const dir of ["src/components/marketing", "src/components/shared"]) {
      for (const file of walk(join(root, dir))) {
        if (!/\.tsx?$/.test(file)) continue;
        // components/shared/auth/* pertence aos fluxos autenticados (login/cadastro), não às páginas estáticas
        if (toPosix(file).includes("/shared/auth/")) continue;
        assert.ok(!/@clerk\/nextjs(?!\/server)/.test(read(file)), rel(file));
      }
    }
  });

  it("os usos de @clerk/nextjs no navegador estão todos dentro de rotas que recebem o provider", () => {
    const files = walk(SRC)
      .filter((f) => /\.tsx?$/.test(f))
      .filter((f) => /from "@clerk\/nextjs"/.test(read(f)))
      .map(rel)
      .sort();
    assert.deepEqual(files, [
      "src/app/(public)/login/page.tsx",
      "src/app/(public)/register/page.tsx",
      "src/app/acesso-indisponivel/sign-out-button.tsx",
      "src/components/account/delete-account-panel.tsx",
      "src/components/app/user-menu.tsx",
      "src/components/clerk/clerk-app-provider.tsx",
    ]);
    // quem consome: login/cadastro e acesso-indisponivel têm layout próprio; delete-account-panel vive em /conta; user-menu nas sidebars
    for (const route of ["(public)/login", "(public)/register", "acesso-indisponivel", "conta", "onboarding", "aceite-termos", "acesso-sessoes"]) {
      assert.match(read(join(APP, route, "layout.tsx")), /ClerkSegmentLayout/, route);
    }
    assert.match(read(join(APP, "(app)", "layout.tsx")), /<ClerkAppProvider>/);
    assert.match(read(join(APP, "admin", "layout.tsx")), /<ClerkAppProvider>/);
    // o único consumidor do UserMenu (useClerk) são as sidebars de /app e /admin, ambas dentro desses layouts
    for (const sidebar of ["components/app/app-sidebar.tsx", "components/admin/admin-sidebar.tsx"]) {
      assert.match(read(join(SRC, sidebar)), /components\/app\/user-menu/, sidebar);
    }
  });

  it("a proteção de rotas continua no servidor: o middleware segue sendo o clerkMiddleware, para todas as rotas", () => {
    const mw = read(join(SRC, "middleware.ts"));
    assert.match(mw, /export const middleware = clerkMiddleware\(/);
    assert.match(mw, /PROTECTED_PREFIXES = \["\/app", "\/admin", "\/onboarding", "\/acesso-sessoes", "\/conta"\]/);
  });
});
