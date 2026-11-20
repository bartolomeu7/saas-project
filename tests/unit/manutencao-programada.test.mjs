import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  EMPTY_MAINTENANCE_STATE,
  decideMaintenance,
  formatDurationPt,
  isMaintenanceGatedPath,
  minutesUntil,
  needsRoleToDecide,
  parseMaintenanceState,
  retryAfterSeconds,
  toSaoPauloInputValue,
} from "../../src/lib/maintenance-gate.ts";
import { createMaintenanceReader } from "../../src/lib/maintenance-state.ts";

const read = (rel) => readFileSync(rel, "utf8");
const win = (level) => ({ level });
const req = (pathname, method = "GET", extra = {}) => ({ pathname, method, isServerAction: false, isRsc: false, ...extra });

test("estado público: formato do banco vira estado; qualquer coisa fora do formato vira 'sem manutenção'", () => {
  const raw = {
    server_now: "2026-11-21T22:00:00Z",
    active: { id: "a", title: "Atualização", message: "Voltamos já", level: "blocked", starts_at: "2026-11-21T22:00:00Z", expected_end_at: "2026-11-21T23:00:00Z", started_at: "2026-11-21T22:00:01Z", contact_text: " 11 99999-0000 " },
    upcoming: null,
  };
  const state = parseMaintenanceState(raw);
  assert.equal(state.active.level, "blocked");
  assert.equal(state.active.contactText, " 11 99999-0000 ");
  assert.equal(state.upcoming, null);
  assert.equal(state.serverNow, "2026-11-21T22:00:00Z");
  for (const bad of [null, undefined, "x", 5, [], { active: { id: 1 } }, { active: { id: "a", title: "t", message: "m", level: "tudo", starts_at: "2026-11-21T22:00:00Z", expected_end_at: "2026-11-21T23:00:00Z" } }, { active: { id: "a", title: "t", message: "m", level: "blocked", starts_at: "nao-data", expected_end_at: "2026-11-21T23:00:00Z" } }]) {
    const parsed = parseMaintenanceState(bad);
    assert.equal(parsed.active, null, JSON.stringify(bad));
    assert.equal(parsed.upcoming, null);
  }
  assert.deepEqual(EMPTY_MAINTENANCE_STATE, { active: null, upcoming: null, serverNow: null });
});

test("decisão: sem manutenção ou só aviso nada é bloqueado", () => {
  assert.equal(decideMaintenance(null, req("/app/vendas"), false).action, "allow");
  assert.equal(decideMaintenance(win("notice"), req("/app/vendas", "POST"), false).action, "allow");
});

test("decisão: bloqueio total — páginas mostram a tela, o resto recebe 503, super admin passa", () => {
  const blocked = win("blocked");
  assert.equal(decideMaintenance(blocked, req("/app/vendas"), null).action, "needs_role");
  assert.equal(decideMaintenance(blocked, req("/app/vendas"), false).action, "page");
  assert.equal(decideMaintenance(blocked, req("/app/vendas"), true).action, "allow");
  assert.equal(decideMaintenance(blocked, req("/app/vendas", "POST", { isServerAction: true }), false).action, "deny");
  assert.equal(decideMaintenance(blocked, req("/app/vendas", "GET", { isRsc: true }), false).action, "deny");
  assert.equal(decideMaintenance(blocked, req("/admin/maintenance"), false).action, "page");
  assert.equal(decideMaintenance(blocked, req("/admin/maintenance"), true).action, "allow");
  assert.equal(decideMaintenance(blocked, req("/api/billing/create-payment", "POST"), false).action, "deny");
  assert.equal(decideMaintenance(blocked, req("/api/presence"), false).action, "deny");
  assert.equal(decideMaintenance(blocked, req("/conta"), false).action, "page");
});

test("decisão: somente leitura — leitura passa, gravação e ação do servidor recebem 503", () => {
  const ro = win("read_only");
  assert.equal(decideMaintenance(ro, req("/app/vendas"), false).action, "allow");
  assert.equal(decideMaintenance(ro, req("/app/vendas", "GET", { isRsc: true }), false).action, "allow");
  assert.equal(decideMaintenance(ro, req("/app/vendas", "POST"), false).action, "deny");
  assert.equal(decideMaintenance(ro, req("/app/vendas", "POST", { isServerAction: true }), false).action, "deny");
  assert.equal(decideMaintenance(ro, req("/app/vendas", "POST", { isServerAction: true }), true).action, "allow");
  assert.equal(decideMaintenance(ro, req("/api/billing/create-payment", "POST"), false).action, "deny");
  assert.equal(decideMaintenance(ro, req("/api/webhooks/evopay", "POST"), false).action, "deny");
});

test("sempre liberados: saúde, estado da manutenção, tela de manutenção e páginas públicas", () => {
  const blocked = win("blocked");
  for (const path of ["/api/health", "/api/maintenance/status", "/manutencao", "/", "/login", "/termos-de-uso", "/politica-de-privacidade", "/register"]) {
    assert.equal(isMaintenanceGatedPath(path), false, path);
    assert.equal(decideMaintenance(blocked, req(path), false).action, "allow", path);
  }
  for (const path of ["/app", "/app/vendas", "/admin", "/onboarding", "/conta", "/acesso-sessoes", "/aceite-termos", "/api/qualquer"]) {
    assert.equal(isMaintenanceGatedPath(path), true, path);
  }
  assert.equal(isMaintenanceGatedPath("/application"), false);
  assert.equal(isMaintenanceGatedPath("/administrator"), false);
  assert.equal(needsRoleToDecide("/app"), true);
  assert.equal(needsRoleToDecide("/admin/maintenance"), true);
  assert.equal(needsRoleToDecide("/api/x"), false);
  assert.equal(needsRoleToDecide("/conta"), false);
});

test("tempos: Retry-After, minutos e duração legível", () => {
  const now = Date.parse("2026-11-21T22:00:00Z");
  assert.equal(retryAfterSeconds("2026-11-21T22:30:00Z", now), 1800);
  assert.equal(retryAfterSeconds("2026-11-21T22:00:10Z", now), 60);
  assert.equal(retryAfterSeconds("2026-11-22T22:00:00Z", now), 3600);
  assert.equal(retryAfterSeconds("lixo", now), 600);
  assert.equal(minutesUntil("2026-11-21T22:30:00Z", now), 30);
  assert.equal(minutesUntil("2026-11-21T21:50:00Z", now), -10);
  assert.equal(formatDurationPt(0), "menos de 1 min");
  assert.equal(formatDurationPt(45), "45 min");
  assert.equal(formatDurationPt(60), "1 h");
  assert.equal(formatDurationPt(95), "1 h 35 min");
  assert.equal(toSaoPauloInputValue("2026-11-22T01:00:00Z"), "2026-11-21T22:00");
  assert.equal(toSaoPauloInputValue("lixo"), "");
});

function fakeFetch(sequence) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init });
    const step = sequence[Math.min(calls.length - 1, sequence.length - 1)];
    if (step instanceof Error) throw step;
    return { ok: step.ok ?? true, status: step.status ?? 200, json: async () => step.body };
  };
  fn.calls = calls;
  return fn;
}
const BLOCKED_BODY = { server_now: "2026-11-21T22:00:00Z", active: { id: "a", title: "T", message: "M", level: "blocked", starts_at: "2026-11-21T22:00:00Z", expected_end_at: "2026-11-21T23:00:00Z" }, upcoming: null };

test("leitor: cache de 12 s, uma consulta compartilhada e chamada à função pública do banco", async () => {
  let clock = 1_000_000;
  const f = fakeFetch([{ body: BLOCKED_BODY }]);
  const reader = createMaintenanceReader({ fetchImpl: f, now: () => clock, config: () => ({ baseUrl: "http://gateway:8080/", anonKey: "anon" }) });
  const [a, b] = await Promise.all([reader.read(), reader.read()]);
  assert.equal(a.active.level, "blocked");
  assert.equal(b.active.level, "blocked");
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].url, "http://gateway:8080/rest/v1/rpc/get_maintenance_public");
  assert.equal(f.calls[0].init.method, "POST");
  assert.equal(f.calls[0].init.headers.apikey, "anon");
  clock += 5_000;
  await reader.read();
  assert.equal(f.calls.length, 1);
  clock += 8_000;
  await reader.read();
  assert.equal(f.calls.length, 2);
});

test("leitor: falha aberta, mas não 'reabre' o sistema no meio de uma manutenção ativa (até 5 min)", async () => {
  let clock = 5_000_000;
  const f = fakeFetch([{ body: BLOCKED_BODY }, new Error("rede"), new Error("rede"), new Error("rede")]);
  const reader = createMaintenanceReader({ fetchImpl: f, now: () => clock, config: () => ({ baseUrl: "http://x", anonKey: "k" }) });
  assert.equal((await reader.read()).active.level, "blocked");
  clock += 13_000;
  assert.equal((await reader.read()).active.level, "blocked", "banco falhou: mantém a manutenção conhecida");
  clock += 4 * 60_000;
  assert.equal((await reader.read()).active.level, "blocked", "ainda dentro de 5 minutos");
  clock += 2 * 60_000;
  assert.equal((await reader.read()).active, null, "passou de 5 minutos sem resposta: volta a abrir");
});

test("leitor: sem configuração, HTTP de erro ou resposta fora do formato = sem manutenção (nunca derruba o site)", async () => {
  const none = createMaintenanceReader({ config: () => null });
  assert.deepEqual(await none.read(), EMPTY_MAINTENANCE_STATE);
  const http500 = createMaintenanceReader({ fetchImpl: fakeFetch([{ ok: false, status: 500, body: null }]), config: () => ({ baseUrl: "http://x", anonKey: "k" }) });
  assert.equal((await http500.read()).active, null);
  const garbage = createMaintenanceReader({ fetchImpl: fakeFetch([{ body: "lixo" }]), config: () => ({ baseUrl: "http://x", anonKey: "k" }) });
  assert.equal((await garbage.read()).active, null);
});

test("fiação: middleware, layout, painel, rotas e migration", () => {
  const mw = read("src/middleware.ts");
  assert.ok(mw.includes("getMaintenanceState()"));
  assert.ok(mw.includes("decideMaintenance("));
  assert.ok(mw.includes('NextResponse.rewrite(new URL("/manutencao", request.url), { status: 503'));
  assert.ok(mw.includes('"/admin/maintenance"'));
  assert.ok(mw.includes("isMaintenanceOn(process.env.MAINTENANCE_MODE)"), "o interruptor de emergência independente do banco continua");
  assert.ok(read("src/app/(app)/layout.tsx").includes("<MaintenanceBanner"));
  assert.ok(read("src/components/app/app-shell.tsx").includes("{banner}"));
  assert.ok(read("src/components/admin/admin-nav-items.ts").includes('"/admin/maintenance"'));
  const actions = read("src/lib/admin/maintenance-actions.ts");
  assert.equal((actions.match(/await requireSuperAdmin\(\)/g) ?? []).length, 7);
  assert.ok(actions.includes("MANUTENCAO"));
  const sql = read("supabase/migrations/20261121000000_maintenance_windows.sql");
  assert.ok(sql.includes("maintenance_windows_one_active"));
  assert.ok(sql.includes("revoke all on table public.maintenance_windows from public, anon, authenticated"));
  assert.ok(sql.includes("grant execute on function public.get_maintenance_public() to anon, authenticated, service_role"));
  assert.ok(read("supabase/rollback/20261121000000_maintenance_windows.down.sql").includes("drop table if exists public.maintenance_windows"));
});
