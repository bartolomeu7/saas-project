import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  decideSessionAccess,
  GateNotProvisionedError,
  GateTimeoutError,
  isMissingFunctionError,
  middlewareSessionAction,
  parseSlotStatus,
  withTimeout,
  DEFAULT_GATE_OPTIONS,
  SESSION_LIMIT_MESSAGE,
  SESSION_UNVERIFIED_MESSAGE,
} from "../../src/lib/auth/session-gate-core.ts";

const FAST = { recheckBlockedAfterSeconds: 20, timeoutMs: 40, clerkRetries: 1 };

/** Dependências falsas com contadores de chamadas. */
function deps(over = {}) {
  const calls = { status: 0, list: 0, register: 0, registerArgs: [], logs: [] };
  const d = {
    async readStatus() { calls.status++; return { state: "unknown" }; },
    async listActiveSessions() { calls.list++; return { ids: ["sess_a", "sess_b"], complete: true }; },
    async register(ids, complete) { calls.register++; calls.registerArgs.push({ ids, complete }); return "allowed"; },
    log(event) { calls.logs.push(event); },
    ...over,
  };
  return { d, calls };
}

describe("gate de sessões: caminho comum", () => {
  it("sessão já aceita: libera sem consultar o Clerk nem o registro", async () => {
    const { d, calls } = deps({ async readStatus() { return { state: "allowed", verifiedAgeSeconds: 9999 }; } });
    assert.deepEqual(await decideSessionAccess(d, FAST), { result: "allowed", reason: "slot_allowed" });
    assert.equal(calls.list + calls.register, 0);
  });

  it("sessão recusada há pouco (< 20 s): continua recusada sem novas chamadas externas", async () => {
    const { d, calls } = deps({ async readStatus() { return { state: "blocked", verifiedAgeSeconds: 5 }; } });
    assert.equal((await decideSessionAccess(d, FAST)).result, "blocked");
    assert.equal(calls.list + calls.register, 0);
  });

  it("sessão recusada há tempo: reavalia (uma vaga pode ter sido liberada)", async () => {
    const { d, calls } = deps({ async readStatus() { return { state: "blocked", verifiedAgeSeconds: 60 }; } });
    assert.equal((await decideSessionAccess(d, FAST)).result, "allowed");
    assert.equal(calls.list, 1);
    assert.equal(calls.register, 1);
  });

  it("sessão nova: lista no Clerk e registra no banco com a lista completa", async () => {
    const { d, calls } = deps();
    assert.equal((await decideSessionAccess(d, FAST)).result, "allowed");
    assert.deepEqual(calls.registerArgs, [{ ids: ["sess_a", "sess_b"], complete: true }]);
  });

  it("quem decide o limite é o banco: 'blocked' do registro vira bloqueio, sem contagem no app", async () => {
    const { d } = deps({ async register() { return "blocked"; } });
    assert.deepEqual(await decideSessionAccess(d, FAST), { result: "blocked", reason: "limit_reached" });
  });

  it("lista do Clerk incompleta é repassada ao banco (que então não poda nada)", async () => {
    const { d, calls } = deps({ async listActiveSessions() { return { ids: ["sess_a"], complete: false }; } });
    await decideSessionAccess(d, FAST);
    assert.equal(calls.registerArgs[0].complete, false);
  });
});

describe("gate de sessões: falhas (explícitas, limitadas, nunca liberar em silêncio)", () => {
  it("API do Clerk falha em sessão NÃO validada: 'unverified' (negado só a ela), sem consumir vaga", async () => {
    const { d, calls } = deps({ async listActiveSessions() { calls.list++; throw new Error("clerk 500"); } });
    const out = await decideSessionAccess(d, FAST);
    assert.deepEqual(out, { result: "unverified", reason: "clerk_unavailable" });
    assert.equal(calls.register, 0, "nada é registrado sem a lista do Clerk");
    assert.equal(calls.list, 2, "1 tentativa + 1 repetição");
  });

  it("falha transitória do Clerk é absorvida pela repetição", async () => {
    let n = 0;
    const { d } = deps({ async listActiveSessions() { if (n++ === 0) throw new Error("blip"); return { ids: ["sess_a"], complete: true }; } });
    assert.equal((await decideSessionAccess(d, FAST)).result, "allowed");
  });

  it("timeout do Clerk: não trava a requisição e resulta em 'unverified' (clerk_timeout)", async () => {
    const { d } = deps({ listActiveSessions: () => new Promise(() => {}) });
    const started = Date.now();
    const out = await decideSessionAccess(d, FAST);
    assert.deepEqual(out, { result: "unverified", reason: "clerk_timeout" });
    assert.ok(Date.now() - started < 1000, "respeitou o teto de tempo");
  });

  it("sessão JÁ validada continua acessando durante a queda do Clerk (ninguém é derrubado por falha nossa)", async () => {
    const { d, calls } = deps({
      async readStatus() { return { state: "allowed", verifiedAgeSeconds: 99999 }; },
      async listActiveSessions() { throw new Error("clerk fora do ar"); },
    });
    assert.equal((await decideSessionAccess(d, FAST)).result, "allowed");
    assert.equal(calls.list, 0);
  });

  it("registro (banco) falha: 'unverified'; timeout do registro também", async () => {
    let out = await decideSessionAccess(deps({ async register() { throw new Error("db"); } }).d, FAST);
    assert.deepEqual(out, { result: "unverified", reason: "register_unavailable" });
    out = await decideSessionAccess(deps({ register: () => new Promise(() => {}) }).d, FAST);
    assert.deepEqual(out, { result: "unverified", reason: "register_timeout" });
  });

  it("sessão que o Clerk não lista (inválida/revogada/propagando): 'unverified', nunca ocupa vaga nem vira 'bloqueio por limite'", async () => {
    const { d } = deps({ async register() { return "invalid"; } });
    assert.deepEqual(await decideSessionAccess(d, FAST), { result: "unverified", reason: "session_not_listed" });
  });

  it("leitura do estado indisponível: segue para a verificação completa (que decide ou falha de forma explícita)", async () => {
    const ok = deps({ async readStatus() { throw new Error("rpc"); } });
    assert.equal((await decideSessionAccess(ok.d, FAST)).result, "allowed");
    const bad = deps({ async readStatus() { throw new Error("rpc"); }, async listActiveSessions() { throw new Error("clerk"); } });
    assert.equal((await decideSessionAccess(bad.d, FAST)).result, "unverified");
  });

  it("gate ainda NÃO instalado no banco (fase de expansão do deploy): libera, com log explícito", async () => {
    const a = deps({ async readStatus() { throw new GateNotProvisionedError(); } });
    assert.deepEqual(await decideSessionAccess(a.d, FAST), { result: "allowed", reason: "gate_not_provisioned" });
    assert.ok(a.calls.logs.includes("gate_not_provisioned"));
    const b = deps({ async register() { throw new GateNotProvisionedError(); } });
    assert.deepEqual(await decideSessionAccess(b.d, FAST), { result: "allowed", reason: "gate_not_provisioned" });
  });

  it("motivos de log não contêm ids de sessão, tokens ou cookies", async () => {
    const { d, calls } = deps({ async listActiveSessions() { throw new Error("token=abc cookie=xyz sess_secret"); } });
    const out = await decideSessionAccess(d, FAST);
    assert.ok(!JSON.stringify({ out, logs: calls.logs }).match(/token|cookie|sess_/i));
  });
});

describe("gate de sessões: concorrência (a decisão é do banco, serializada por usuário)", () => {
  it("12 verificações simultâneas: o app não conta nada e relaya a decisão atômica do registro (exatamente 3 aceitas)", async () => {
    // simula o banco: registro serializado por usuário, limite 3
    let allowed = 0;
    let lock = Promise.resolve();
    const register = () => {
      const run = lock.then(async () => {
        await new Promise((r) => setTimeout(r, 1));
        if (allowed < 3) { allowed++; return "allowed"; }
        return "blocked";
      });
      lock = run.catch(() => {});
      return run;
    };
    const results = await Promise.all(Array.from({ length: 12 }, () => decideSessionAccess(deps({ register }).d, { ...FAST, timeoutMs: 2000 })));
    assert.equal(results.filter((r) => r.result === "allowed").length, 3);
    assert.equal(results.filter((r) => r.result === "blocked").length, 9);
    assert.equal(results.filter((r) => r.result === "unverified").length, 0);
  });
});

describe("middleware: o que cada estado da vaga faz", () => {
  const S = (state, age) => ({ state, verifiedAgeSeconds: age });
  it("aceita passa; recusada recente redireciona a página e nega ações/APIs com 403", () => {
    assert.equal(middlewareSessionAction(S("allowed"), true), "pass");
    assert.equal(middlewareSessionAction(S("allowed"), false), "pass");
    assert.equal(middlewareSessionAction(S("blocked", 3), true), "redirect_limit");
    assert.equal(middlewareSessionAction(S("blocked", 3), false), "deny_limit");
  });
  it("recusada há tempo: a PÁGINA reavalia (pode ter vaga livre); ações continuam negadas até lá", () => {
    assert.equal(middlewareSessionAction(S("blocked", 60), true), "pass");
    assert.equal(middlewareSessionAction(S("blocked", 60), false), "deny_limit");
  });
  it("sessão nunca validada: página passa (o layout verifica); Server Action/API é negada (SESSION_UNVERIFIED)", () => {
    assert.equal(middlewareSessionAction(S("unknown"), true), "pass");
    assert.equal(middlewareSessionAction(S("unknown"), false), "deny_unverified");
  });
  it("parseSlotStatus não confia em tipos: lixo vira 'unknown'", () => {
    for (const raw of [null, undefined, 5, "x", [], {}, { state: "hacked" }, { state: 1 }]) assert.equal(parseSlotStatus(raw).state, "unknown");
    assert.deepEqual(parseSlotStatus({ state: "blocked", verified_age_seconds: 7 }), { state: "blocked", verifiedAgeSeconds: 7 });
    assert.equal(parseSlotStatus({ state: "allowed", verified_age_seconds: "7" }).verifiedAgeSeconds, undefined);
  });
  it("função ausente no banco é reconhecida (PGRST202 / 42883 / mensagem); outros erros não", () => {
    assert.equal(isMissingFunctionError({ code: "PGRST202", message: "x" }), true);
    assert.equal(isMissingFunctionError({ code: "42883", message: "x" }), true);
    assert.equal(isMissingFunctionError({ message: "Could not find the function public.session_slot_status" }), true);
    assert.equal(isMissingFunctionError({ code: "42501", message: "permission denied" }), false);
    assert.equal(isMissingFunctionError(null), false);
  });
  it("mensagens exigidas", () => {
    assert.equal(SESSION_LIMIT_MESSAGE, "Você atingiu o limite de sessões simultâneas permitido pela sua conta. Encerre uma sessão ativa ou entre em contato com o suporte para obter ajuda.");
    assert.ok(SESSION_UNVERIFIED_MESSAGE.includes("nada foi bloqueado"));
    assert.equal(DEFAULT_GATE_OPTIONS.recheckBlockedAfterSeconds, 20);
  });
});

describe("withTimeout", () => {
  it("resolve antes do prazo, rejeita depois, e limpa o temporizador", async () => {
    assert.equal(await withTimeout(Promise.resolve(7), 50, "x"), 7);
    await assert.rejects(() => withTimeout(new Promise(() => {}), 10, "x"), GateTimeoutError);
    await assert.rejects(() => withTimeout(Promise.reject(new Error("boom")), 50, "x"), /boom/);
  });
});
