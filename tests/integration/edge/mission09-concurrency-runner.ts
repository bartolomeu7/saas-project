/**
 * Runner de CONCORRÊNCIA real da Missão 09: fluxos AUTENTICADOS (create_company_with_owner, claim_free_trial) e registro
 * de sessões, com conexões Postgres paralelas (SUPABASE_DB_URL injetada pelo runtime) que assumem `authenticated` com um
 * `sub` de teste — o que o PostgREST com service_role não permite. Fixtures por REST (service_role injetada).
 *
 * Mesmas proteções dos outros runners: Edge Function temporária DENTRO do projeto TEST, nenhuma chave lida/impressa,
 * recusa fora do TEST, token descartável, fixtures "[M9-CONC]" removidas no fim; depois do uso a função é substituída
 * por um stub 410. Este arquivo mantém o token como placeholder; a cópia implantada recebe um valor aleatório.
 */
import postgres from "npm:postgres@3.4.4";

const TEST_REF = "zlmxbqlpjstmllrvafmy";
const RUN_TOKEN = "__RUN_TOKEN__";

const url = Deno.env.get("SUPABASE_URL") ?? "";
const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const dbUrl = Deno.env.get("SUPABASE_DB_URL") ?? "";
const headers = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=representation" };

async function api(method: string, path: string, body?: unknown) {
  const res = await fetch(`${url}/rest/v1/${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* não JSON */ }
  return { ok: res.ok, status: res.status, json, text };
}
const rpc = (fn: string, args: unknown) => api("POST", `rpc/${fn}`, args);

const results: { name: string; ok: boolean; detail: string }[] = [];
const check = (name: string, cond: unknown, detail = "") => results.push({ name, ok: Boolean(cond), detail });

Deno.serve(async (req) => {
  const reject = (status: number, msg: string) => new Response(JSON.stringify({ error: msg }), { status, headers: { "Content-Type": "application/json" } });
  if (req.method !== "POST") return reject(405, "POST apenas");
  if (!url.includes(TEST_REF)) return reject(412, "ABORTADO: nao e o projeto TEST");
  if (!key || !dbUrl) return reject(412, "ABORTADO: credenciais do runtime ausentes");
  if (RUN_TOKEN.startsWith("__") || req.headers.get("x-run-token") !== RUN_TOKEN) return reject(401, "token invalido");

  const profiles: { id: string; sub: string }[] = [];
  const companies: string[] = [];
  const errors: string[] = [];
  const evidence: any[] = [];
  let cleanup: any = null;
  const tag = `m9c${Date.now()}`;
  const sql = postgres(dbUrl, { max: 24, prepare: false, idle_timeout: 5, connect_timeout: 15 });

  /** Executa `fn` numa transação própria (conexão própria) como `authenticated` com o sub dado. */
  const asUser = <T>(sub: string, fn: (tx: any) => Promise<T>) =>
    sql.begin(async (tx: any) => {
      await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub, role: "authenticated" })}, true)`;
      await tx.unsafe("set local role authenticated");
      return await fn(tx);
    }) as Promise<T>;
  const settle = async <T>(ps: Promise<T>[]) => (await Promise.allSettled(ps)).map((r) => (r.status === "fulfilled" ? { ok: true as const, v: r.value } : { ok: false as const, err: String((r.reason as Error)?.message ?? r.reason) }));

  const newProfile = async (label: string) => {
    const id = crypto.randomUUID();
    const sub = `${tag}_${label}_${profiles.length}`;
    const r = await api("POST", "profiles", { user_id: id, clerk_user_id: sub, full_name: `[M9-CONC] ${label}`, email: `${tag}-${profiles.length}@example.invalid`, role: "user", status: "active" });
    if (!r.ok) throw new Error(`perfil: ${r.status} ${r.text.slice(0, 120)}`);
    profiles.push({ id, sub });
    return { id, sub };
  };
  const newCompany = async (label: string, ownerId: string) => {
    const r = await api("POST", "companies", { name: `[M9-CONC] ${label} ${tag}`, business_type: "other", status: "active" });
    if (!r.ok) throw new Error(`empresa: ${r.status} ${r.text.slice(0, 120)}`);
    const id = r.json[0].id as string;
    companies.push(id);
    const m = await api("POST", "company_members", { company_id: id, user_id: ownerId, role: "owner" });
    if (!m.ok) throw new Error(`membro: ${m.status} ${m.text.slice(0, 120)}`);
    return id;
  };
  const hashOf = async (s: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${tag}-${s}`)))).map((x) => x.toString(16).padStart(2, "0")).join("");
  const count = async (path: string) => ((await api("GET", path)).json ?? []).length;

  try {
    const ipLimit = Number(((await api("GET", "platform_settings?key=eq.trial_signup_ip_limit&select=value")).json?.[0]?.value) ?? 3);
    const sessLimit = Number(((await api("GET", "platform_settings?key=eq.max_concurrent_sessions&select=value")).json?.[0]?.value) ?? 3);

    // M1: o MESMO dono pede o teste 8x ao mesmo tempo (empresa sem assinatura, autorizado): exatamente 1 concessão
    {
      const u = await newProfile("m1");
      const co = await newCompany("m1", u.id);
      const a = await rpc("authorize_trial_signup", { p_user_id: u.id, p_ip_hash: await hashOf("m1") });
      check("M1 autorização prévia concedida", a.json?.allowed === true, JSON.stringify(a.json));
      const t = performance.now();
      const out = await settle(Array.from({ length: 8 }, () => asUser(u.sub, async (tx) => (await tx`select public.claim_free_trial() as r`)[0].r)));
      const granted = out.filter((x) => x.ok && (x as any).v?.granted === true).length;
      const reasons = out.map((x) => (x.ok ? (x as any).v?.reason : `ERR`)).sort().join(",");
      evidence.push({ scenario: "M1 claim_free_trial x8 (mesmo usuário)", parallel_connections: 8, wall_ms: Math.round(performance.now() - t) });
      check("M1 exatamente 1 concessão (as outras 7 recebem already_used)", granted === 1 && out.filter((x) => !x.ok).length === 0, `granted=${granted} reasons=${reasons}`);
      check("M1 banco: 1 assinatura de teste e 1 entitlement", (await count(`subscriptions?company_id=eq.${co}&select=id`)) === 1 && (await count(`company_entitlements?company_id=eq.${co}&select=id`)) === 1);
      check("M1 a autorização foi consumida", (await count(`trial_signup_events?user_id=eq.${u.id}&consumed_at=not.is.null&select=id`)) === 1);
    }

    // M2: o MESMO usuário cria a empresa 6x ao mesmo tempo, autorizado: 1 empresa e 1 teste
    {
      const u = await newProfile("m2");
      const a = await rpc("authorize_trial_signup", { p_user_id: u.id, p_ip_hash: await hashOf("m2") });
      check("M2 autorização prévia concedida", a.json?.allowed === true);
      const out = await settle(Array.from({ length: 6 }, (_, i) => asUser(u.sub, async (tx) => (await tx`select (public.create_company_with_owner(${`[M9-CONC] m2-${i} ${tag}`}, 'other')).id as id`)[0].id)));
      const okIds = out.filter((x) => x.ok).map((x) => (x as any).v as string);
      okIds.forEach((id) => companies.push(id));
      const refused = out.filter((x) => !x.ok && /já pertence a uma empresa/.test((x as any).err)).length;
      check("M2 exatamente 1 empresa criada; as outras 5 recusadas com a mensagem de empresa existente", okIds.length === 1 && refused === 5, `ok=${okIds.length} refused=${refused}`);
      const subs = await api("GET", `subscriptions?trial_claimed_by=eq.${u.id}&select=id,status`);
      check("M2 exatamente 1 teste concedido ao usuário", (subs.json ?? []).length === 1 && subs.json[0].status === "trialing", JSON.stringify(subs.json));
    }

    // M3: SEM autorização, 6 criações simultâneas: 1 empresa, nenhum teste
    {
      const u = await newProfile("m3");
      const out = await settle(Array.from({ length: 6 }, (_, i) => asUser(u.sub, async (tx) => (await tx`select (public.create_company_with_owner(${`[M9-CONC] m3-${i} ${tag}`}, 'other')).id as id`)[0].id)));
      const okIds = out.filter((x) => x.ok).map((x) => (x as any).v as string);
      okIds.forEach((id) => companies.push(id));
      check("M3 1 empresa criada", okIds.length === 1, `ok=${okIds.length}`);
      check("M3 nenhum teste concedido sem autorização do servidor", (await count(`subscriptions?trial_claimed_by=eq.${u.id}&select=id`)) === 0 && (okIds.length === 1 ? (await count(`subscriptions?company_id=eq.${okIds[0]}&select=id`)) === 0 : false));
    }

    // M4: ponta a ponta com a MESMA conexão: 12 donos autorizam (service_role) e pedem o teste ao mesmo tempo
    {
      const hash = await hashOf("m4");
      const owners = await Promise.all(Array.from({ length: 12 }, async (_, i) => { const u = await newProfile(`m4-${i}`); const co = await newCompany(`m4-${i}`, u.id); return { ...u, co }; }));
      const t = performance.now();
      const out = await settle(owners.map(async (o) => {
        const a = await rpc("authorize_trial_signup", { p_user_id: o.id, p_ip_hash: hash });
        if (a.json?.allowed !== true) return { authorized: false, granted: false };
        const r = await asUser(o.sub, async (tx) => (await tx`select public.claim_free_trial() as r`)[0].r);
        return { authorized: true, granted: (r as any).granted === true };
      }));
      evidence.push({ scenario: "M4 12 donos, mesma conexão: autorizar + pedir teste", parallel_flows: 12, wall_ms: Math.round(performance.now() - t) });
      const authorized = out.filter((x) => x.ok && (x as any).v.authorized).length;
      const granted = out.filter((x) => x.ok && (x as any).v.granted).length;
      check(`M4 exatamente ${ipLimit} autorizados e ${ipLimit} testes concedidos para a mesma conexão (limite ${ipLimit})`, authorized === ipLimit && granted === ipLimit && out.every((x) => x.ok), `authorized=${authorized} granted=${granted}`);
      const subs = await count(`subscriptions?company_id=in.(${owners.map((o) => o.co).join(",")})&select=id`);
      check("M4 banco: nenhuma assinatura a mais que o limite", subs === ipLimit, `subs=${subs}`);
    }

    // M5: sessões — listas "velhas" concorrentes NÃO derrubam vagas recentes (corrida entre a lista do Clerk e o registro)
    {
      const u = await newProfile("m5");
      const sid = (n: number) => `${tag}_s${n}`;
      const full = [sid(1), sid(2), sid(3)];
      for (const s of full) await rpc("register_session_slot", { p_user_id: u.id, p_session_id: s, p_active_session_ids: full });
      const t = performance.now();
      const out = await settle([
        // 6 sessões NOVAS, cada uma com uma lista que só contém ela mesma (lista "velha"), e as 3 antigas re-verificando
        ...Array.from({ length: 6 }, (_, i) => rpc("register_session_slot", { p_user_id: u.id, p_session_id: sid(10 + i), p_active_session_ids: [sid(10 + i)] })),
        ...full.map((s) => rpc("register_session_slot", { p_user_id: u.id, p_session_id: s, p_active_session_ids: full })),
      ]);
      evidence.push({ scenario: "M5 registro de sessões com listas divergentes", parallel_calls: 9, wall_ms: Math.round(performance.now() - t) });
      const slots = (await api("GET", `user_session_slots?user_id=eq.${u.id}&select=session_id,state`)).json ?? [];
      const allowed = slots.filter((s: any) => s.state === "allowed").map((s: any) => s.session_id).sort();
      check(`M5 as ${sessLimit} sessões antigas continuam aceitas e nenhuma das 6 novas as derruba`, allowed.length === sessLimit && full.every((s) => allowed.includes(s)), `allowed=${allowed.length}`);
      check("M5 as 6 novas ficaram recusadas (limite) e nenhuma resposta falhou", slots.filter((s: any) => s.state === "blocked").length === 6 && out.every((x) => x.ok && (x as any).v.ok), `blocked=${slots.filter((s: any) => s.state === "blocked").length}`);
    }
  } catch (e) {
    errors.push(String((e as Error).message ?? e));
  } finally {
    const failed: string[] = [];
    const del = async (path: string) => { const r = await api("DELETE", path); if (!r.ok) failed.push(`${path.split("?")[0]}:${r.status}`); };
    const ids = profiles.map((p) => p.id);
    if (ids.length) {
      const list = ids.join(",");
      await del(`audit_logs?target_user_id=in.(${list})`);
      await del(`audit_logs?actor_user_id=in.(${list})`);
      await del(`trial_signup_events?user_id=in.(${list})`);
      await del(`user_session_slots?user_id=in.(${list})`);
    }
    // empresas criadas por create_company_with_owner dos perfis de teste (podem não estar em `companies[]`)
    if (ids.length) {
      const mem = (await api("GET", `company_members?user_id=in.(${ids.join(",")})&select=company_id`)).json ?? [];
      for (const m of mem) if (!companies.includes(m.company_id)) companies.push(m.company_id);
    }
    if (companies.length) {
      const cs = companies.join(",");
      await del(`subscription_payments?company_id=in.(${cs})`);
      await del(`subscriptions?company_id=in.(${cs})`);
      await del(`company_members?company_id=in.(${cs})`);
      await del(`company_entitlements?company_id=in.(${cs})`);
      await del(`financial_categories?company_id=in.(${cs})`);
      await del(`companies?id=in.(${cs})`);
    }
    if (ids.length) await del(`profiles?user_id=in.(${ids.join(",")})`);
    const left = {
      profiles: ((await api("GET", "profiles?full_name=like.%5BM9-CONC%5D*&select=user_id")).json ?? []).length,
      companies: ((await api("GET", "companies?name=like.%5BM9-CONC%5D*&select=id")).json ?? []).length,
    };
    cleanup = { profiles_created: profiles.length, companies_created: companies.length, residual: left, failed_deletes: failed };
    try { await sql.end({ timeout: 5 }); } catch { /* ignore */ }
  }
  const failedChecks = results.filter((r) => !r.ok);
  return new Response(JSON.stringify({ total: results.length, pass: results.length - failedChecks.length, fail: failedChecks.length, failed: failedChecks, errors, concurrency_evidence: evidence, cleanup, results }), { headers: { "Content-Type": "application/json" } });
});
