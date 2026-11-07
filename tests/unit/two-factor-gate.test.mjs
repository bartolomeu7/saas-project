import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  decideTwoFactorGate,
  isTwoFactorGatedPath,
  parseTwoFactorGateStatus,
  safeAfterTwoFactorPath,
  TWO_FACTOR_PATH,
} from "../../src/lib/security/two-factor/gate.ts";
import { describeFailure } from "../../src/lib/security/two-factor/messages.ts";

/**
 * Barreira da verificação em duas etapas própria: decisão pura + travas estáticas do código (middleware, ações, serviço).
 */
const base = new URL("../../", import.meta.url);
const read = (p) => readFileSync(new URL(p, base), "utf8");

const pending = { required: true, verified: false };
const done = { required: true, verified: true };
const none = { required: false, verified: true };
const input = (over) => ({ pathname: "/app", method: "GET", isServerAction: false, status: pending, ...over });

describe("decisão da barreira", () => {
  it("quem não tem segunda etapa, ou já a cumpriu nesta sessão, passa em tudo", () => {
    for (const status of [none, done]) {
      for (const pathname of ["/app", "/app/vendas", "/admin", "/admin/users", "/api/billing/x", "/conta", "/onboarding"]) {
        assert.deepEqual(decideTwoFactorGate(input({ pathname, status })), { action: "allow" }, `${pathname}`);
      }
    }
  });

  it("páginas (GET) sem verificação redirecionam, guardando o caminho de volta", () => {
    assert.deepEqual(decideTwoFactorGate(input({ pathname: "/app/vendas", search: "?p=2" })), { action: "redirect", from: "/app/vendas?p=2" });
    assert.deepEqual(decideTwoFactorGate(input({ pathname: "/admin/users", method: "HEAD" })), { action: "redirect", from: "/admin/users" });
  });

  it("Server Actions, POST e APIs sem verificação são NEGADOS (não redirecionados)", () => {
    assert.deepEqual(decideTwoFactorGate(input({ method: "POST", isServerAction: true })), { action: "deny" });
    assert.deepEqual(decideTwoFactorGate(input({ pathname: "/app/vendas/nova", method: "POST" })), { action: "deny" });
    assert.deepEqual(decideTwoFactorGate(input({ pathname: "/api/billing/checkout", method: "GET" })), { action: "deny" });
    assert.deepEqual(decideTwoFactorGate(input({ isServerAction: true, method: "GET" })), { action: "deny" });
  });

  it("a página de verificação, o login e as públicas ficam FORA da barreira (senão ninguém entra)", () => {
    for (const pathname of [TWO_FACTOR_PATH, "/login", "/register", "/", "/termos-de-uso", "/aceite-termos", "/acesso-sessoes", "/api/presence", "/api/webhooks/evopay"]) {
      assert.equal(isTwoFactorGatedPath(pathname), false, pathname);
      assert.deepEqual(decideTwoFactorGate(input({ pathname, method: "POST", isServerAction: true })), { action: "allow" }, pathname);
    }
  });

  it("prefixos parecidos não escapam nem entram por engano", () => {
    assert.equal(isTwoFactorGatedPath("/application"), false);
    assert.equal(isTwoFactorGatedPath("/administrador"), false);
    assert.equal(isTwoFactorGatedPath("/app/"), true);
    assert.equal(isTwoFactorGatedPath("/admin/settings"), true);
    assert.equal(isTwoFactorGatedPath("/conta"), true);
  });
});

describe("leitura do estado (fail-closed)", () => {
  it("só 'não exige' ou 'exige e verificada' liberam", () => {
    assert.deepEqual(parseTwoFactorGateStatus({ required: false, verified: true }), none);
    assert.deepEqual(parseTwoFactorGateStatus({ required: false }), none);
    assert.deepEqual(parseTwoFactorGateStatus({ required: true, verified: true }), done);
  });

  it("exige e não verificada, ou QUALQUER formato inesperado, bloqueia", () => {
    assert.deepEqual(parseTwoFactorGateStatus({ required: true, verified: false }), pending);
    for (const bad of [null, undefined, "", "true", 1, [], {}, { required: "false" }, { required: 0 }, { required: true }, { required: true, verified: "true" }]) {
      assert.deepEqual(parseTwoFactorGateStatus(bad), pending, JSON.stringify(bad));
    }
  });
});

describe("destino depois da verificação (sem open redirect)", () => {
  it("aceita só caminhos internos conhecidos", () => {
    for (const ok of ["/app", "/app/vendas?p=2", "/admin", "/admin/users/123", "/onboarding", "/conta"]) assert.equal(safeAfterTwoFactorPath(ok), ok, ok);
  });

  it("recusa externo, protocolo, barra dupla, contrabarra, quebra de linha e a própria página", () => {
    for (const bad of ["https://evil.com", "//evil.com", "/\\evil.com", "/app:evil", "javascript:alert(1)", "/app\nSet-Cookie: a=b", "/app\r\n", "/", "/login", "/verificacao-2fa", "/applicativo", "", null, undefined, "app"]) {
      assert.equal(safeAfterTwoFactorPath(bad), "/app", JSON.stringify(bad));
    }
  });
});

describe("mensagens", () => {
  it("cada falha tem texto próprio e nunca vaza detalhe técnico", () => {
    const codes = [{ code: "invalid" }, { code: "not_configured" }, { code: "already_enabled" }, { code: "not_enabled" }, { code: "unavailable" }];
    const texts = codes.map((c) => describeFailure({ ok: false, ...c }));
    assert.equal(new Set(texts).size, codes.length);
    for (const t of texts) assert.doesNotMatch(t, /supabase|postgres|rpc|secret|segredo|stack/i);
  });

  it("bloqueio informa os minutos que faltam, com singular e plural", () => {
    const now = Date.UTC(2026, 10, 7, 12, 0, 0);
    assert.match(describeFailure({ ok: false, code: "locked", lockedUntil: new Date(now + 15 * 60000).toISOString() }, now), /15 minutos/);
    assert.match(describeFailure({ ok: false, code: "locked", lockedUntil: new Date(now + 30000).toISOString() }, now), /1 minuto\b/);
  });
});

describe("travas do código", () => {
  const middleware = read("src/middleware.ts");
  const service = read("src/lib/security/two-factor/service.ts");
  const actions = read("src/lib/security/two-factor/actions.ts");
  const migration = read("supabase/migrations/20261107000000_two_factor.sql");

  it("o middleware lê o estado, nega Server Actions/APIs com 403 e exige login na página de verificação", () => {
    assert.match(middleware, /two_factor_gate_status/);
    assert.match(middleware, /decideTwoFactorGate\(/);
    assert.match(middleware, /TWO_FACTOR_REQUIRED_CODE/);
    assert.match(middleware, /status: 403/);
    assert.match(middleware, /PROTECTED_PREFIXES = \[[^\]]*TWO_FACTOR_PATH\]/);
    // erro de leitura (que não seja "função ausente") fecha com 503
    assert.match(middleware, /gateError && !isMissingFunctionError\(gateError\)[\s\S]{0,200}authBackendUnavailable/);
  });

  it("o middleware não aplica a regra de conta inativa a /conta (direito de excluir os próprios dados)", () => {
    assert.match(middleware, /profile\.status !== "active" && \(needsStatusGuard \|\| needsConsentGate\)/);
  });

  it("as ações pegam usuário e sessão do Clerk no servidor, nunca do formulário", () => {
    assert.match(actions, /auth\(\)/);
    assert.match(actions, /getCurrentUser\(\)/);
    assert.doesNotMatch(actions, /formData\.get\("(user|userId|session|sessionId|clerk)/);
    assert.doesNotMatch(actions, /request\.json|cookies\(\)/);
    // só chega do formulário o código e o destino (sanitizado)
    assert.match(actions, /safeAfterTwoFactorPath\(text\(formData, "next"\)\)/);
  });

  it("o arquivo de Server Actions exporta só funções (regra do Next) e nada de tipo de valor", () => {
    const exported = [...actions.matchAll(/^export (async function|function|const|class|let|var) (\w+)/gm)].map((m) => `${m[1]} ${m[2]}`);
    for (const e of exported) assert.match(e, /^async function /, e);
  });

  it("o serviço reserva a tentativa ANTES de conferir o código e recusa o reuso do mesmo código", () => {
    const reserve = service.indexOf("two_factor_reserve_attempt");
    const verify = service.indexOf("verifyTotp(secret");
    assert.ok(reserve > 0 && verify > reserve, "reserva vem antes da conferência");
    assert.match(service, /\.lt\("last_used_step", step\)/);
    // backup: uma única operação que só casa código ainda não usado
    assert.match(service, /\.is\("used_at", null\)[\s\S]{0,60}\.select\("id"\)/);
  });

  it("o serviço é só de servidor, usa a chave de ambiente e nunca registra segredo nem código em log", () => {
    assert.match(service, /^import "server-only";/);
    assert.match(service, /TWO_FACTOR_ENCRYPTION_KEY/);
    for (const m of service.matchAll(/console\.(error|log|warn|info)\(([^)]*)\)/g)) {
      assert.doesNotMatch(m[2], /secret|code\b|rawCode|parsed|backupCodes/i, m[0]);
    }
  });

  it("confirmar a ativação não aceita código de backup; gerar novos códigos também não", () => {
    assert.match(service, /confirmSetup[\s\S]*?checkCode\(userId, code, \{ allowBackup: false, requireEnabled: false \}\)/);
    assert.match(service, /regenerateBackupCodes[\s\S]*?checkCode\(userId, code, \{ allowBackup: false, requireEnabled: true \}\)/);
  });

  it("migration: tabelas fechadas (sem policy, sem privilégio de usuário), limitador só service_role, reset só super admin", () => {
    assert.doesNotMatch(migration, /create policy/i);
    assert.equal((migration.match(/enable row level security/g) ?? []).length, 3);
    assert.equal((migration.match(/revoke all on table public\.\w+ from public, anon, authenticated/g) ?? []).length, 3);
    assert.match(migration, /revoke all on function public\.two_factor_reserve_attempt\(uuid\) from public, anon, authenticated/);
    assert.match(migration, /grant execute on function public\.two_factor_reserve_attempt\(uuid\) to service_role;/);
    assert.match(migration, /admin_reset_two_factor[\s\S]*?is_super_admin\(\)/);
    assert.match(migration, /p_user_id = v_actor/);
    assert.match(migration, /write_platform_audit_log/);
    assert.doesNotMatch(migration, /\bauth\.uid\(\)/);
    assert.ok(existsSync(new URL("supabase/rollback/20261107000000_two_factor.down.sql", base)));
    assert.ok(existsSync(new URL("tests/sql/two_factor.sql", base)));
  });

  it("a exclusão da conta apaga a segunda etapa só depois de a exclusão dar certo", () => {
    const deletion = read("src/lib/account/actions.ts");
    const delIndex = deletion.indexOf('rpc("delete_account_data"');
    const purgeIndex = deletion.indexOf("await purgeTwoFactor(");
    assert.ok(delIndex > 0 && purgeIndex > delIndex);
  });

  it("recuperação por super admin: ação exige super admin e a tela só mostra o botão a super admin, nunca em si mesmo", () => {
    assert.match(read("src/lib/admin/actions.ts"), /resetUserTwoFactorAction[\s\S]{0,200}requireSuperAdmin\(\)/);
    assert.match(read("src/components/admin/admin-user-actions.tsx"), /showTwoFactorReset = actorRole === "super_admin" && !isSelf/);
  });

  it("a página de verificação existe e tem layout com o provider do Clerk", () => {
    assert.ok(existsSync(new URL("src/app/verificacao-2fa/page.tsx", base)));
    assert.match(read("src/app/verificacao-2fa/layout.tsx"), /ClerkSegmentLayout/);
  });
});
