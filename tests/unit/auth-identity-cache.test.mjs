import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const read = (rel) => readFileSync(path.join(process.cwd(), rel), "utf8");

// Medido no site real (08/11/2026): páginas logadas levavam 1,4 a 2,3 s. Cada requisição repetia a chamada à API do
// Clerk e a consulta de "quem é o usuário" várias vezes (layout x3, página x1, cada uma duas vezes).
test("identidade é resolvida uma vez por requisição (React cache)", () => {
  const clerk = read("src/lib/auth/clerk-session.ts");
  assert.match(clerk, /export const getClerkInternalUserId = cache\(/);
  assert.match(clerk, /export const getClerkCurrentUser = cache\(/);
  assert.match(clerk, /const loadClerkUser = cache\(/);
  assert.match(read("src/lib/auth/session.ts"), /export const getCurrentProfile = cache\(/);
  assert.match(read("src/lib/companies/queries.ts"), /export const getCurrentCompany = cache\(/);
});

test("o id interno não depende da API do Clerk: só o primeiro acesso e o e-mail usam currentUser()", () => {
  const clerk = read("src/lib/auth/clerk-session.ts");
  const idFn = clerk.slice(clerk.indexOf("export const getClerkInternalUserId"), clerk.indexOf("export const getClerkCurrentUser"));
  assert.ok(idFn.includes("await auth()"), "usa auth() (validação local do token)");
  // currentUser() só pode aparecer depois da consulta current_profile_user_id (primeiro acesso)
  assert.ok(idFn.indexOf("current_profile_user_id") < idFn.indexOf("loadClerkUser()"));
  // perfil e empresa não esperam o e-mail do Clerk
  assert.ok(!read("src/lib/auth/session.ts").slice(read("src/lib/auth/session.ts").indexOf("getCurrentProfile")).includes("getClerkCurrentUser()"));
  assert.ok(!read("src/lib/companies/queries.ts").includes("getClerkCurrentUser"));
});

test("layout lê identidade, perfil, empresa, vaga de sessão e consentimento em paralelo, mantendo a ordem das decisões", () => {
  const layout = read("src/app/(app)/layout.tsx");
  assert.match(layout, /await Promise\.all\(\[[\s\S]*getCurrentUser\(\)[\s\S]*getCurrentProfile\(\)[\s\S]*getCurrentCompany\(\)[\s\S]*evaluateSessionGate[\s\S]*getMyConsentStatus\(\)/);
  const iBlocked = layout.indexOf('gate === "blocked"');
  const iUnverified = layout.indexOf('gate === "unverified"');
  const iConsent = layout.indexOf("!consent.complete");
  const iOnboarding = layout.indexOf('redirect("/onboarding")');
  assert.ok(iBlocked > 0 && iBlocked < iUnverified && iUnverified < iConsent && iConsent < iOnboarding, "ordem: sessão, consentimento, onboarding");
  assert.ok(layout.includes('redirect("/aceite-termos")'));
  assert.ok(layout.includes("AccountInactiveError"), "conta inativa continua indo para a tela de bloqueio");
});
