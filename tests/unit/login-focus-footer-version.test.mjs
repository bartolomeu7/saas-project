import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

/**
 * Pós-PR #46: o anel de foco do Clerk precisa de `!important` (a regra do Clerk vence por especificidade) e o
 * rodapé identifica o commit publicado, só a partir da variável de sistema da Vercel (sem inventar valor).
 */
const base = new URL("../../", import.meta.url);
const read = (p) => readFileSync(new URL(p, base), "utf8");

describe("login: anel de foco", () => {
  it("a sombra de foco discreta usa !important", () => {
    const appearance = read("src/components/shared/auth/clerk-auth-appearance.ts");
    assert.match(appearance, /"&:focus":\s*\{\s*boxShadow:\s*"[^"]*!important"/);
  });
});

describe("rodapé: versão publicada", () => {
  const footer = read("src/components/marketing/site-footer.tsx");

  it("lê só o commit da Vercel, truncado, e não exibe nada sem a variável", () => {
    assert.match(footer, /process\.env\.VERCEL_GIT_COMMIT_SHA\?\.slice\(0,\s*7\)/);
    assert.match(footer, /\{BUILD_SHA && \(/);
  });

  it("expõe o commit também como data-build-sha (verificação por script)", () => {
    assert.match(footer, /data-build-sha=\{BUILD_SHA\}/);
  });

  it("não usa variável pública nova nem segredo", () => {
    assert.doesNotMatch(footer, /NEXT_PUBLIC_|SECRET|KEY/);
  });
});
