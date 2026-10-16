/**
 * Runner de CONCORRÊNCIA real dos limites de uso (vagas de usuário, sessões simultâneas, teste grátis por conexão).
 * Mesma abordagem e mesmas proteções de billing-concurrency-runner.ts: Edge Function temporária DENTRO do projeto TEST,
 * chave de serviço injetada pelo runtime (nunca lida/impressa), recusa fora do TEST, token descartável, fixtures
 * "[UL-CONC]" removidas no fim; depois do uso a função deve ser substituída por um stub 410.
 */
const TEST_REF = "zlmxbqlpjstmllrvafmy";
const RUN_TOKEN = "__RUN_TOKEN__";

const url = Deno.env.get("SUPABASE_URL") ?? "";
const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const t0 = performance.now();
const now = () => performance.now() - t0;
const headers = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=representation" };
type Log = { s: number; e: number; status: number };
let cur: Log[] | null = null;

async function api(method: string, path: string, body?: unknown, log = false) {
  const s = now();
  const res = await fetch(`${url}/rest/v1/${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  if (log && cur) cur.push({ s, e: now(), status: res.status });
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* não JSON */ }
  return { ok: res.ok, status: res.status, json, text };
}
const rpc = (fn: string, args: unknown, log = false) => api("POST", `rpc/${fn}`, args, log);
const maxInFlight = (l: Log[]) => {
  const ev = l.flatMap((c) => [[c.s, 1], [c.e, -1]] as [number, number][]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let c = 0, m = 0; for (const [, d] of ev) { c += d; if (c > m) m = c; } return m;
};
async function burst<T>(name: string, n: number, make: (i: number) => Promise<T>, evidence: any[]) {
  cur = []; const s = now();
  const out = await Promise.all(Array.from({ length: n }, (_, i) => make(i)));
  const wall = Math.round(now() - s); const l = cur; cur = null;
  const d = l.map((c) => c.e - c.s).sort((a, b) => a - b);
  evidence.push({ scenario: name, parallel_calls: n, max_in_flight: maxInFlight(l), wall_ms: wall, call_ms_p50: Math.round(d[Math.floor(d.length / 2)] ?? 0), call_ms_max: Math.round(d[d.length - 1] ?? 0), http_5xx: l.filter((c) => c.status >= 500).length });
  return out;
}
const results: { name: string; ok: boolean; detail: string }[] = [];
const check = (name: string, cond: unknown, detail = "") => results.push({ name, ok: Boolean(cond), detail });

Deno.serve(async (req) => {
  const reject = (status: number, msg: string) => new Response(JSON.stringify({ error: msg }), { status, headers: { "Content-Type": "application/json" } });
  if (req.method !== "POST") return reject(405, "POST apenas");
  if (!url.includes(TEST_REF)) return reject(412, "ABORTADO: nao e o projeto TEST");
  if (!key) return reject(412, "ABORTADO: service role do runtime ausente");
  if (RUN_TOKEN.startsWith("__") || req.headers.get("x-run-token") !== RUN_TOKEN) return reject(401, "token invalido");

  const evidence: any[] = [];
  const profiles: string[] = [];
  const companies: string[] = [];
  const errors: string[] = [];
  let cleanup: any = null;
  const tag = `ulc${Date.now()}`;
  try {
    const setting = async (k: string, d: number) => {
      const r = (await api("GET", `platform_settings?key=eq.${k}&select=value`)).json?.[0];
      return r ? Number(r.value) : d;
    };
    const sessLimit = await setting("max_concurrent_sessions", 3);
    const ipLimit = await setting("trial_signup_ip_limit", 3);
    const newProfile = async (label: string) => {
      const id = crypto.randomUUID();
      const r = await api("POST", "profiles", { user_id: id, clerk_user_id: `${tag}_${label}_${profiles.length}`, full_name: `[UL-CONC] ${label}`, email: `${tag}-${profiles.length}@example.invalid`, role: "user", status: "active" });
      if (!r.ok) throw new Error(`perfil: ${r.status} ${r.text.slice(0, 120)}`);
      profiles.push(id);
      return id;
    };
    const newCompany = async (label: string, max: number | null, members = 0) => {
      const r = await api("POST", "companies", { name: `[UL-CONC] ${label} ${tag}`, business_type: "other", status: "active" });
      if (!r.ok) throw new Error(`empresa: ${r.status}`);
      const id = r.json[0].id as string; companies.push(id);
      const owner = await newProfile(`${label}-owner`);
      await api("POST", "company_members", { company_id: id, user_id: owner, role: "owner" });
      if (max !== null) await api("POST", "company_entitlements", { company_id: id, status: "active", max_additional_users: max });
      for (let i = 0; i < members; i++) await api("POST", "company_members", { company_id: id, user_id: await newProfile(`${label}-pre${i}`), role: "employee" });
      return id;
    };
    const nonOwner = async (company: string) => ((await api("GET", `company_members?company_id=eq.${company}&role=neq.owner&select=id`)).json ?? []).length;
    const addMember = (company: string, user: string, role = "employee") => api("POST", "company_members", { company_id: company, user_id: user, role }, true);

    // U1: 12 inclusões simultâneas, 2 vagas
    {
      const c = await newCompany("U1", 2);
      const users = await Promise.all(Array.from({ length: 12 }, (_, i) => newProfile(`u1-${i}`)));
      const calls = await burst("U1 INSERT company_members x12 (2 vagas)", 12, (i) => addMember(c, users[i]!), evidence) as any[];
      const okN = calls.filter((x) => x.status === 201).length;
      const lim = calls.filter((x) => x.status !== 201 && String(x.text).includes("Limite de usuários do plano atingido")).length;
      check("U1 exatamente 2 inclusões passam (2 vagas)", okN === 2, `ok=${okN}`);
      check("U1 as outras 10 recebem 'Limite de usuários do plano atingido' (sem 5xx)", lim === 10 && calls.every((x) => x.status < 500), `limite=${lim}`);
      check("U1 estado final: 2 colaboradores", (await nonOwner(c)) === 2, "");
    }
    // U2: última vaga disputada por 2
    {
      const c = await newCompany("U2", 3, 2);
      const users = await Promise.all([newProfile("u2-a"), newProfile("u2-b")]);
      const calls = await burst("U2 última vaga x2", 2, (i) => addMember(c, users[i]!), evidence) as any[];
      check("U2 exatamente 1 das 2 ocupa a última vaga", calls.filter((x) => x.status === 201).length === 1, calls.map((x) => x.status).join(","));
      check("U2 estado final: 3 colaboradores (nunca 4)", (await nonOwner(c)) === 3, "");
    }
    // U3: papéis misturados, 1 vaga
    {
      const c = await newCompany("U3", 1);
      const users = await Promise.all(Array.from({ length: 8 }, (_, i) => newProfile(`u3-${i}`)));
      const calls = await burst("U3 admin x4 + employee x4 (1 vaga)", 8, (i) => addMember(c, users[i]!, i % 2 ? "admin" : "employee"), evidence) as any[];
      check("U3 só 1 passa, independentemente do papel", calls.filter((x) => x.status === 201).length === 1 && (await nonOwner(c)) === 1, "");
    }
    // U4: 5 empresas em paralelo, 3 tentativas cada, 1 vaga cada
    {
      const cs = await Promise.all(Array.from({ length: 5 }, (_, i) => newCompany(`U4-${i}`, 1)));
      const users = await Promise.all(Array.from({ length: 15 }, (_, i) => newProfile(`u4-${i}`)));
      const calls = await burst("U4 5 empresas x3 tentativas (1 vaga cada)", 15, (i) => addMember(cs[i % 5]!, users[i]!), evidence) as any[];
      const per = await Promise.all(cs.map(nonOwner));
      check("U4 cada empresa ficou com exatamente 1 colaborador", per.every((n) => n === 1), per.join(","));
      check("U4 sem 5xx e sem vazamento entre empresas", calls.every((x) => x.status < 500), "");
    }
    // U5: sessões — 12 sessões novas do MESMO usuário
    {
      const u = await newProfile("sess");
      const sids = Array.from({ length: 12 }, (_, i) => `${tag}_s${i}`);
      const calls = await burst("U5 register_session_slot x12 (mesmo usuário)", 12, (i) => rpc("register_session_slot", { p_user_id: u, p_session_id: sids[i], p_active_session_ids: sids }, true), evidence) as any[];
      const st = calls.map((x) => x.json?.state);
      const allowed = st.filter((s) => s === "allowed").length, blocked = st.filter((s) => s === "blocked").length;
      const rows = (await api("GET", `user_session_slots?user_id=eq.${u}&select=session_id,state`)).json ?? [];
      check(`U5 exatamente ${sessLimit} sessões aceitas e ${12 - sessLimit} recusadas`, allowed === sessLimit && blocked === 12 - sessLimit, `allowed=${allowed} blocked=${blocked}`);
      check("U5 banco: nunca mais que o limite de 'allowed'", rows.filter((r: any) => r.state === "allowed").length === sessLimit, `rows allowed=${rows.filter((r: any) => r.state === "allowed").length}`);
      // reverificação concorrente das aceitas é idempotente e não derruba ninguém
      const keep = rows.filter((r: any) => r.state === "allowed").map((r: any) => r.session_id);
      const again = await burst("U5b re-verificar as aceitas x6", 6, (i) => rpc("register_session_slot", { p_user_id: u, p_session_id: keep[i % keep.length], p_active_session_ids: sids }, true), evidence) as any[];
      check("U5b reverificar sessões aceitas (concorrente) continua 'allowed' para todas", again.every((x) => x.json?.state === "allowed"), "");
      // liberar a MESMA sessão 6x ao mesmo tempo: só uma libera de verdade
      const rel = await burst("U5c release_session_slot x6 (mesma sessão)", 6, () => rpc("release_session_slot", { p_user_id: u, p_session_id: keep[0] }, true), evidence) as any[];
      check("U5c liberar a mesma sessão em paralelo: exatamente 1 true", rel.filter((x) => x.json === true).length === 1, rel.map((x) => String(x.json)).join(","));
    }
    // U6: dois usuários em paralelo não interferem
    {
      const u1 = await newProfile("sessA"), u2 = await newProfile("sessB");
      const s1 = Array.from({ length: 6 }, (_, i) => `${tag}_a${i}`), s2 = Array.from({ length: 6 }, (_, i) => `${tag}_b${i}`);
      const calls = await burst("U6 2 usuários x6 sessões", 12, (i) => i < 6 ? rpc("register_session_slot", { p_user_id: u1, p_session_id: s1[i], p_active_session_ids: s1 }, true) : rpc("register_session_slot", { p_user_id: u2, p_session_id: s2[i - 6], p_active_session_ids: s2 }, true), evidence) as any[];
      const a = calls.slice(0, 6).filter((x) => x.json?.state === "allowed").length, b = calls.slice(6).filter((x) => x.json?.state === "allowed").length;
      check(`U6 cada usuário tem exatamente ${Math.min(sessLimit, 6)} aceitas`, a === Math.min(sessLimit, 6) && b === Math.min(sessLimit, 6), `a=${a} b=${b}`);
    }
    // U7: teste grátis — 12 usuários diferentes, mesma conexão
    {
      const hash = (await (async () => { const d = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${tag}-ip7`))); return Array.from(d).map((x) => x.toString(16).padStart(2, "0")).join(""); })());
      const users = await Promise.all(Array.from({ length: 12 }, (_, i) => newProfile(`t7-${i}`)));
      const calls = await burst("U7 authorize_trial_signup x12 (mesma conexão)", 12, (i) => rpc("authorize_trial_signup", { p_user_id: users[i], p_ip_hash: hash }, true), evidence) as any[];
      const allowed = calls.filter((x) => x.json?.allowed === true).length, denied = calls.filter((x) => x.json?.allowed === false && x.json?.reason === "ip_limit").length;
      const ev = (await api("GET", `trial_signup_events?ip_hash=eq.${hash}&select=outcome`)).json ?? [];
      check(`U7 exatamente ${ipLimit} cadastros autorizados e ${12 - ipLimit} negados na janela`, allowed === ipLimit && denied === 12 - ipLimit, `allowed=${allowed} denied=${denied}`);
      check("U7 banco: eventos 'allowed' nunca passam do limite", ev.filter((e: any) => e.outcome === "allowed").length === ipLimit && ev.length === 12, `ev=${ev.length}`);
      const aud = (await api("GET", `audit_logs?action=eq.platform.signup.trial_denied&target_user_id=in.(${users.join(",")})&select=id`)).json ?? [];
      check("U7 uma auditoria por negativa (sem duplicar) e nenhum 5xx", aud.length === 12 - ipLimit && calls.every((x) => x.status < 500), `aud=${aud.length}`);
    }
    // U8: o MESMO usuário 10x ao mesmo tempo: uma só decisão
    {
      const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${tag}-ip8`)))).map((x) => x.toString(16).padStart(2, "0")).join("");
      const u = await newProfile("t8");
      const calls = await burst("U8 authorize_trial_signup x10 (mesmo usuário)", 10, () => rpc("authorize_trial_signup", { p_user_id: u, p_ip_hash: hash }, true), evidence) as any[];
      const ev = (await api("GET", `trial_signup_events?user_id=eq.${u}&select=outcome`)).json ?? [];
      check("U8 todas as 10 respostas concordam (allowed) e existe UM evento", calls.every((x) => x.json?.allowed === true) && ev.length === 1, `ev=${ev.length}`);
    }
    // U9: duas conexões em paralelo não se misturam
    {
      const h = async (s: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${tag}-${s}`)))).map((x) => x.toString(16).padStart(2, "0")).join("");
      const hA = await h("ipA"), hB = await h("ipB");
      const users = await Promise.all(Array.from({ length: 12 }, (_, i) => newProfile(`t9-${i}`)));
      const calls = await burst("U9 2 conexões x6 usuários", 12, (i) => rpc("authorize_trial_signup", { p_user_id: users[i], p_ip_hash: i < 6 ? hA : hB }, true), evidence) as any[];
      const a = calls.slice(0, 6).filter((x) => x.json?.allowed).length, b = calls.slice(6).filter((x) => x.json?.allowed).length;
      check(`U9 cada conexão autoriza exatamente ${Math.min(ipLimit, 6)}`, a === Math.min(ipLimit, 6) && b === Math.min(ipLimit, 6), `a=${a} b=${b}`);
    }
  } catch (e) {
    errors.push(String((e as Error).message ?? e));
  } finally {
    const failed: string[] = [];
    const del = async (path: string) => { const r = await api("DELETE", path); if (!r.ok) failed.push(`${path.split("?")[0]}:${r.status}`); };
    if (profiles.length) {
      const ids = profiles.join(",");
      await del(`audit_logs?target_user_id=in.(${ids})`);
      await del(`audit_logs?actor_user_id=in.(${ids})`);
      await del(`trial_signup_events?user_id=in.(${ids})`);
      await del(`user_session_slots?user_id=in.(${ids})`);
    }
    if (companies.length) {
      const cs = companies.join(",");
      await del(`company_members?company_id=in.(${cs})`);
      await del(`company_entitlements?company_id=in.(${cs})`);
      await del(`companies?id=in.(${cs})`);
    }
    if (profiles.length) await del(`profiles?user_id=in.(${profiles.join(",")})`);
    const left = {
      profiles: ((await api("GET", "profiles?full_name=like.%5BUL-CONC%5D*&select=user_id")).json ?? []).length,
      companies: ((await api("GET", "companies?name=like.%5BUL-CONC%5D*&select=id")).json ?? []).length,
    };
    cleanup = { profiles_created: profiles.length, companies_created: companies.length, residual: left, failed_deletes: failed };
  }
  const failedChecks = results.filter((r) => !r.ok);
  return new Response(JSON.stringify({ total: results.length, pass: results.length - failedChecks.length, fail: failedChecks.length, failed: failedChecks, errors, concurrency_evidence: evidence, cleanup, results }), { headers: { "Content-Type": "application/json" } });
});
