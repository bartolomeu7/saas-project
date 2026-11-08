import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { expectRead, settle, valueOrThrow } from "../../src/lib/auth/settled.ts";

const read = (rel) => readFileSync(path.join(process.cwd(), rel), "utf8");

test("settle nunca rejeita: guarda o valor ou o erro", async () => {
  const ok = await settle(Promise.resolve({ data: 1 }));
  assert.deepEqual(ok, { ok: true, value: { data: 1 } });
  const bad = await settle(Promise.reject(new Error("rede caiu")));
  assert.equal(bad.ok, false);
  assert.equal(bad.error.message, "rede caiu");
});

test("o erro de uma leitura só aparece quando a decisão chega nela (mesmo efeito de quando eram em fila)", async () => {
  const reads = await Promise.all([
    settle(Promise.resolve("perfil")),
    settle(Promise.reject(new Error("vaga falhou"))),
    settle(Promise.resolve("consentimento")),
  ]);
  // se uma decisão ANTERIOR já negou/redirecionou, a leitura que falhou nunca é desembrulhada: nada é lançado
  assert.equal(valueOrThrow(reads[0]), "perfil");
  // quando a decisão chega na leitura que falhou, o erro é relançado
  assert.throws(() => valueOrThrow(reads[1]), /vaga falhou/);
  assert.equal(valueOrThrow(reads[2]), "consentimento");
});

test("leitura que deveria ter sido feita e não foi falha FECHADO (nunca pula a verificação)", () => {
  assert.throws(() => expectRead(null, "get_my_legal_consent_status"), /não foi executada/);
  const result = { ok: true, value: 1 };
  assert.equal(expectRead(result, "x"), result);
});

test("middleware: as quatro leituras de proteção saem juntas, num único Promise.all", () => {
  const mw = read("src/middleware.ts");
  const all = mw.indexOf("await Promise.all([");
  assert.ok(all > 0, "Promise.all das leituras");
  const block = mw.slice(all, mw.indexOf("]);", all));
  for (const name of ['from("profiles")', "session_slot_status", "two_factor_gate_status", "get_my_legal_consent_status"]) {
    assert.ok(block.includes(name), `${name} faz parte da leitura em paralelo`);
  }
  // nenhuma consulta ao banco em fila (await) fora do Promise.all, exceto a assinatura (depende do perfil)
  const after = mw.slice(mw.indexOf("valueOrThrow(profileResult)"));
  assert.ok(!/await [^\n]*\.rpc\(/.test(after), "nenhum await de rpc depois do Promise.all");
  assert.ok(!/await supabase/.test(after), "nenhum await de supabase depois do Promise.all");
});

test("middleware: a ordem das DECISÕES é a mesma de antes (conta inativa, sessão, 2FA, admin, consentimento, assinatura)", () => {
  const mw = read("src/middleware.ts");
  const order = [
    "valueOrThrow(profileResult)",
    "profile.status !== \"active\"",
    "expectRead(slotResult",
    "expectRead(gateResult",
    "if (needsAdminGuard)",
    "expectRead(consentResult",
    "getSubscriptionGuardStatus(supabase",
  ].map((marker) => {
    const i = mw.indexOf(marker);
    assert.ok(i > -1, `trecho ausente: ${marker}`);
    return i;
  });
  const sorted = [...order].sort((a, b) => a - b);
  assert.deepEqual(order, sorted, "as decisões mudaram de ordem");
});

test("middleware: só lê vaga/2FA/consentimento quando há token, e usa o resultado só com perfil (como antes)", () => {
  const mw = read("src/middleware.ts");
  assert.match(mw, /const readsSlot = Boolean\(token && sessionId && isConsentGatedPath\(pathname\)\)/);
  assert.match(mw, /const readsTwoFactor = Boolean\(token && sessionId && needsTwoFactorGate\)/);
  assert.match(mw, /const readsConsent = Boolean\(token && needsConsentGate\)/);
  assert.match(mw, /if \(profile && sessionId && isConsentGatedPath\(pathname\)\)/);
  assert.match(mw, /if \(profile && sessionId && needsTwoFactorGate\)/);
  assert.match(mw, /if \(needsConsentGate && profile\)/);
  // sem pular em silêncio: cada resultado esperado passa por expectRead (falha fechado se faltar)
  assert.equal((mw.match(/expectRead\(/g) ?? []).length, 3);
});

test("middleware: os guardas de falha fechada continuam (503 do banco, 403 de consentimento/2FA/sessão)", () => {
  const mw = read("src/middleware.ts");
  assert.ok(mw.includes('authBackendUnavailable("AUTH_RPC_FAILED")'));
  assert.ok(mw.includes("CONSENT_REQUIRED_CODE"));
  assert.ok(mw.includes("TWO_FACTOR_REQUIRED_CODE"));
  assert.ok(mw.includes("SESSION_LIMIT_CODE"));
  assert.ok(mw.includes("isActivePlatformAdmin"));
});
