/**
 * Runner de CONCORRÊNCIA real do billing, para rodar como Edge Function DENTRO do projeto Supabase TEST.
 *
 * Por quê: o MCP do Supabase serializa as chamadas (não prova concorrência) e a service-role do TEST não está em
 * `.env.local`. A Edge Function recebe do próprio runtime do projeto a service-role correspondente (variável injetada
 * `SUPABASE_SERVICE_ROLE_KEY`) — o valor nunca é lido, impresso nem devolvido por este código nem por quem o implanta.
 * Mesmos cenários S1–S10 de tests/integration/billing-concurrency.mjs + S11–S14 (chaves de operação, burst, multiempresa).
 *
 * Segurança:
 *  - recusa rodar se SUPABASE_URL não for o projeto TEST (ref abaixo);
 *  - exige o cabeçalho `x-run-token` igual a RUN_TOKEN (substituído no deploy; descartável) e JWT (verify_jwt=true);
 *  - só cria/remove fixtures "[CONCTEST]" e chaves de operação próprias; nunca toca em dados preexistentes;
 *  - depois dos testes a função deve ser SUBSTITUÍDA por um stub 410 (o MCP não tem "delete function").
 *
 * Uso (manual): POST {TEST_URL}/functions/v1/billing-concurrency-runner  (Authorization: Bearer <anon do TEST>, x-run-token: <token>)
 */
const TEST_REF = "zlmxbqlpjstmllrvafmy";
const RUN_TOKEN = "__RUN_TOKEN__";

type Json = Record<string, any> | any[] | null;
type CallLog = { s: number; e: number; status: number };

const url = Deno.env.get("SUPABASE_URL") ?? "";
const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const t0 = performance.now();
const now = () => performance.now() - t0;

const headers = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=representation" };

let currentLog: CallLog[] | null = null;
async function api(method: string, path: string, body?: unknown, log = false, extra: Record<string, string> = {}) {
  const s = now();
  const res = await fetch(`${url}/rest/v1/${path}`, { method, headers: { ...headers, ...extra }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  const e = now();
  if (log && currentLog) currentLog.push({ s, e, status: res.status });
  let json: Json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* não JSON */ }
  return { ok: res.ok, status: res.status, json: json as any, text, ms: Math.round(e - s) };
}
const rpc = (fn: string, args: unknown, log = false) => api("POST", `rpc/${fn}`, args, log);

function inFlight(log: CallLog[]) {
  const ev = log.flatMap((c) => [[c.s, 1], [c.e, -1]] as [number, number][]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let cur = 0, max = 0;
  for (const [, d] of ev) { cur += d; if (cur > max) max = cur; }
  return max;
}
/** Roda um lote 100% em paralelo (Promise.all) e devolve evidência de sobreposição real. */
async function burst<T>(name: string, n: number, make: (i: number) => Promise<T>, evidence: any[]) {
  currentLog = [];
  const s = now();
  const out = await Promise.all(Array.from({ length: n }, (_, i) => make(i)));
  const wall = Math.round(now() - s);
  const log = currentLog;
  currentLog = null;
  const durs = log.map((c) => c.e - c.s).sort((a, b) => a - b);
  evidence.push({
    scenario: name,
    parallel_calls: n,
    max_in_flight: inFlight(log),
    wall_ms: wall,
    call_ms_min: Math.round(durs[0] ?? 0),
    call_ms_p50: Math.round(durs[Math.floor(durs.length / 2)] ?? 0),
    call_ms_max: Math.round(durs[durs.length - 1] ?? 0),
    http_5xx: log.filter((c) => c.status >= 500).length,
  });
  return out;
}

const results: { name: string; ok: boolean; detail: string }[] = [];
const check = (name: string, cond: unknown, detail = "") => results.push({ name, ok: Boolean(cond), detail });
const days = (iso: string) => (new Date(iso).getTime() - Date.now()) / 86400000;

Deno.serve(async (req) => {
  const reject = (status: number, msg: string) => new Response(JSON.stringify({ error: msg }), { status, headers: { "Content-Type": "application/json" } });
  if (req.method !== "POST") return reject(405, "POST apenas");
  if (!url.includes(TEST_REF)) return reject(412, "ABORTADO: não é o projeto TEST");
  if (!key) return reject(412, "ABORTADO: service role do runtime ausente");
  if (RUN_TOKEN.startsWith("__") || req.headers.get("x-run-token") !== RUN_TOKEN) return reject(401, "token inválido");

  const evidence: any[] = [];
  const created = { companies: [] as string[], keys: [] as string[] };
  const errors: string[] = [];
  let invariants: any = null;
  let cleanup: any = null;
  try {
    const monthly = (await api("GET", "plans?code=eq.MONTHLY&select=id,price,access_duration_days")).json?.[0];
    const yearly = (await api("GET", "plans?code=eq.YEARLY&select=id,price")).json?.[0];
    if (!monthly || !yearly) return reject(500, "planos MONTHLY/YEARLY ausentes no TEST");

    const newCompany = async (label: string) => {
      const r = await api("POST", "companies", { name: `[CONCTEST] ${label} ${Date.now()}`, business_type: "other", status: "active" });
      if (!r.ok) throw new Error(`criar empresa: ${r.status}`);
      created.companies.push(r.json[0].id);
      return r.json[0].id as string;
    };
    const claim = (company: string, plan = monthly) => rpc("claim_subscription_payment", { p_company_id: company, p_plan_id: plan.id, p_amount: Number(plan.price), p_currency: "BRL" }, true);
    const confirm = (paymentId: string, event: string, amount: number | null = Number(monthly.price), status = "paid") =>
      rpc("confirm_subscription_payment", { p_payment_id: paymentId, p_provider_status: status, p_end_to_end_id: "E2E-CONC", p_event_id: event, p_event_type: "pix.status_check", p_event_payload: {}, p_provider_amount: amount }, true);
    const setTx = (id: string, tag: string) => api("PATCH", `subscription_payments?id=eq.${id}`, { provider_transaction_id: `tx_conc_${Date.now()}_${tag}` });

    // S1: 12 reservas simultâneas da MESMA intenção
    {
      const company = await newCompany("S1");
      const calls = await burst("S1 claim x12 mesma intenção", 12, () => claim(company), evidence);
      const rows = calls.map((c: any) => c.json?.[0]).filter(Boolean);
      const ids = new Set(rows.map((r: any) => r.payment_id));
      const createdCount = rows.filter((r: any) => r.created).length;
      const open = (await api("GET", `subscription_payments?company_id=eq.${company}&status=eq.pending&select=id`)).json ?? [];
      check("S1 12 reservas simultâneas: todas responderam", rows.length === 12, `${rows.length}/12`);
      check("S1 exatamente 1 criou (created=true)", createdCount === 1, `created=${createdCount}`);
      check("S1 todas devolveram o MESMO pagamento", ids.size === 1, `ids distintos=${ids.size}`);
      check("S1 só existe 1 cobrança pending no banco", open.length === 1, `pending=${open.length}`);
    }

    // S2: 12 confirmações simultâneas do MESMO evento
    let company2 = "", pay2 = "";
    {
      company2 = await newCompany("S2");
      pay2 = (await claim(company2)).json[0].payment_id;
      await setTx(pay2, "a");
      const calls = await burst("S2 confirm x12 mesmo event_id", 12, () => confirm(pay2, "conc:COMPLETED:same"), evidence);
      const rows = calls.map((c: any) => c.json?.[0]);
      const firstOnes = rows.filter((r: any) => r && r.ok && !r.already_processed).length;
      const sub = (await api("GET", `subscriptions?company_id=eq.${company2}&select=expires_at,status`)).json?.[0];
      const ev = (await api("GET", `payment_events?subscription_payment_id=eq.${pay2}&select=id,processed`)).json ?? [];
      check("S2 12 confirmações do mesmo evento: nenhuma falhou", rows.every((r: any) => r && r.ok), JSON.stringify(rows.filter((r: any) => !r?.ok)).slice(0, 120));
      check("S2 exatamente 1 processou de verdade (as outras já processadas)", firstOnes === 1, `primeiras=${firstOnes}`);
      check("S2 acesso concedido UMA vez (~31 dias, não 372)", sub && days(sub.expires_at) > 30.5 && days(sub.expires_at) < 31.5, `dias=${sub ? days(sub.expires_at).toFixed(2) : "sem assinatura"}`);
      check("S2 um único payment_event, processado", ev.length === 1 && ev[0].processed === true, `eventos=${ev.length}`);
    }

    // S3: 12 confirmações com event_ids DIFERENTES (reentregas)
    {
      const calls = await burst("S3 confirm x12 event_ids distintos (reentregas)", 12, (i) => confirm(pay2, `conc:COMPLETED:redelivery:${i}`), evidence);
      const sub = (await api("GET", `subscriptions?company_id=eq.${company2}&select=expires_at`)).json?.[0];
      check("S3 12 reentregas com event_id distinto: nenhuma falhou", calls.every((c: any) => c.json?.[0]?.ok), "");
      check("S3 o vencimento continua ~31 dias (sem dupla concessão)", sub && days(sub.expires_at) > 30.5 && days(sub.expires_at) < 31.5, `dias=${sub ? days(sub.expires_at).toFixed(2) : "-"}`);
    }

    // S4: dois pagamentos DIFERENTES da mesma empresa NOVA, simultâneos
    {
      const company = await newCompany("S4");
      const a = (await claim(company, monthly)).json[0].payment_id;
      const b = (await claim(company, yearly)).json[0].payment_id;
      await setTx(a, "b1"); await setTx(b, "b2");
      const [ra, rb] = await burst("S4 confirm x2 (empresa sem assinatura)", 2, (i) => (i === 0 ? confirm(a, "conc:S4:a", Number(monthly.price)) : confirm(b, "conc:S4:b", Number(yearly.price))), evidence);
      const okA = (ra as any).json?.[0]?.ok === true, okB = (rb as any).json?.[0]?.ok === true;
      const sub = (await api("GET", `subscriptions?company_id=eq.${company}&select=expires_at,status`)).json ?? [];
      const ent = (await api("GET", `company_entitlements?company_id=eq.${company}&select=access_expires_at,status`)).json ?? [];
      check("S4 as duas confirmações concorrentes (empresa sem assinatura) terminam OK", okA && okB, `a=${(ra as any).status}/${(ra as any).json?.message ?? okA} b=${(rb as any).status}/${(rb as any).json?.message ?? okB}`);
      check("S4 existe exatamente 1 assinatura e 1 entitlement", sub.length === 1 && ent.length === 1, `subs=${sub.length} ent=${ent.length}`);
      check("S4 acesso = 31 + 365 dias (as duas compras valem)", sub[0] && Math.abs(days(sub[0].expires_at) - 396) < 1, `dias=${sub[0] ? days(sub[0].expires_at).toFixed(2) : "-"}`);
      check("S4 entitlements coerentes com a assinatura", sub[0] && ent[0] && sub[0].expires_at === ent[0].access_expires_at, "");
    }

    // S5: valor divergente/ausente concorrente nunca concede
    {
      const company = await newCompany("S5");
      const p = (await claim(company)).json[0].payment_id;
      await setTx(p, "c");
      const calls = await burst("S5 confirm x12 valor errado/ausente", 12, (i) => (i < 6 ? confirm(p, `conc:S5:bad:${i}`, 1.0) : confirm(p, `conc:S5:miss:${i}`, null)), evidence);
      const sub = (await api("GET", `subscriptions?company_id=eq.${company}&select=id`)).json ?? [];
      const pay = (await api("GET", `subscription_payments?id=eq.${p}&select=status`)).json?.[0];
      check("S5 12 confirmações com valor errado/ausente: todas rejeitadas", calls.every((c: any) => c.json?.[0]?.ok === false && ["AMOUNT_MISMATCH", "AMOUNT_MISSING"].includes(c.json?.[0]?.rejection)), JSON.stringify(calls.map((c: any) => c.json?.[0]?.rejection ?? c.json?.[0]?.ok)).slice(0, 200));
      check("S5 nenhuma assinatura criada e pagamento segue pending", sub.length === 0 && pay?.status === "pending", `subs=${sub.length} status=${pay?.status}`);
    }

    // S6: intenções DISTINTAS simultâneas continuam permitidas
    {
      const companyA = await newCompany("S6a");
      const companyB = await newCompany("S6b");
      const [a1, a2, b1] = await burst("S6 claim x3 intenções distintas", 3, (i) => (i === 0 ? claim(companyA, monthly) : i === 1 ? claim(companyA, yearly) : claim(companyB, monthly)), evidence) as any[];
      const rowsOk = [a1, a2, b1].every((c) => c.json?.[0]?.created === true);
      const ids = new Set([a1, a2, b1].map((c) => c.json?.[0]?.payment_id));
      const pendA = (await api("GET", `subscription_payments?company_id=eq.${companyA}&status=eq.pending&select=id,plan_id`)).json ?? [];
      check("S6 mesma empresa + planos diferentes + outra empresa: todas criaram", rowsOk && ids.size === 3, `ids=${ids.size}`);
      check("S6 a empresa A tem 2 pendentes (um por plano)", pendA.length === 2, `pendentes=${pendA.length}`);
    }

    // S7: reserva abandonada (timeout) + tentativas simultâneas
    {
      const company = await newCompany("S7");
      const first = (await claim(company)).json[0];
      await api("PATCH", `subscription_payments?id=eq.${first.payment_id}`, { created_at: new Date(Date.now() - 10 * 60 * 1000).toISOString() });
      const calls = await burst("S7 claim x10 após reserva abandonada", 10, () => claim(company), evidence);
      const rows = calls.map((c: any) => c.json?.[0]).filter(Boolean);
      const createdRows = rows.filter((r: any) => r.created);
      const open = (await api("GET", `subscription_payments?company_id=eq.${company}&status=eq.pending&select=id`)).json ?? [];
      const old = (await api("GET", `subscription_payments?id=eq.${first.payment_id}&select=status`)).json?.[0];
      check("S7 reserva abandonada vira 'failed'", old?.status === "failed", `status=${old?.status}`);
      check("S7 10 tentativas simultâneas: exatamente 1 nova reserva", createdRows.length === 1, `created=${createdRows.length}`);
      check("S7 só 1 cobrança aberta no banco", open.length === 1, `pending=${open.length}`);
      check("S7 as demais devolvem a mesma reserva (sem cobrança ainda)", rows.filter((r: any) => !r.created).every((r: any) => r.payment_id === createdRows[0]?.payment_id && r.has_charge === false), "");
    }

    // S8: cobrança já criada no provedor é reaproveitada por todos
    {
      const company = await newCompany("S8");
      const first = (await claim(company)).json[0];
      await setTx(first.payment_id, "d");
      const calls = await burst("S8 claim x10 com cobrança aberta", 10, () => claim(company), evidence);
      const rows = calls.map((c: any) => c.json?.[0]).filter(Boolean);
      check("S8 10 tentativas com cobrança aberta: nenhuma cria outra", rows.length === 10 && rows.every((r: any) => r.created === false && r.has_charge === true && r.payment_id === first.payment_id), "");
    }

    // S9: claim e confirmação disputando a mesma empresa
    {
      const company = await newCompany("S9");
      const first = (await claim(company)).json[0];
      await setTx(first.payment_id, "e");
      const mixed = await burst("S9 claim x5 + confirm x5 misturados", 10, (i) => (i < 5 ? claim(company) : confirm(first.payment_id, `conc:S9:${i}`)), evidence) as any[];
      const sub = (await api("GET", `subscriptions?company_id=eq.${company}&select=expires_at`)).json ?? [];
      const pays = (await api("GET", `subscription_payments?company_id=eq.${company}&select=id,status`)).json ?? [];
      const paid = pays.filter((p: any) => p.status === "paid").length;
      check("S9 nenhuma chamada falhou (sem deadlock/erro 5xx)", mixed.every((c) => c.status < 500), mixed.map((c) => c.status).join(","));
      check("S9 exatamente 1 pagamento pago e 1 assinatura", paid === 1 && sub.length === 1, `paid=${paid} subs=${sub.length}`);
      check("S9 acesso concedido UMA vez (~31 dias)", sub[0] && days(sub[0].expires_at) > 30.5 && days(sub[0].expires_at) < 31.5, `dias=${sub[0] ? days(sub[0].expires_at).toFixed(2) : "-"}`);
    }

    // S10: estorno concorrente com reentregas de "paid"
    {
      const company = await newCompany("S10");
      const p = (await claim(company)).json[0].payment_id;
      await setTx(p, "f");
      await confirm(p, "conc:S10:paid");
      const calls = await burst("S10 refunded x5 + paid x5", 10, (i) => (i < 5 ? confirm(p, `conc:S10:refund:${i}`, Number(monthly.price), "refunded") : confirm(p, `conc:S10:again:${i}`)), evidence) as any[];
      const pay = (await api("GET", `subscription_payments?id=eq.${p}&select=status`)).json?.[0];
      const sub = (await api("GET", `subscriptions?company_id=eq.${company}&select=expires_at`)).json?.[0];
      check("S10 nenhuma chamada deu erro de servidor", calls.every((c) => c.status < 500), calls.map((c) => c.status).join(","));
      check("S10 termina 'refunded' (terminal) sem conceder acesso em dobro", pay?.status === "refunded" && sub && days(sub.expires_at) < 31.5, `status=${pay?.status} dias=${sub ? days(sub.expires_at).toFixed(2) : "-"}`);
    }

    // S11/S12 (PRIMITIVA, nível de tabela): `platform_begin_operation` exige um ator administrador (actor_user_id NOT NULL; com
    // service_role não há ator), então a concorrência das RPCs admin NÃO é exercitada aqui. Provamos só a garantia do banco:
    // N inserções simultâneas da MESMA request_key (ON CONFLICT DO NOTHING) resultam em UMA linha.
    {
      const actor = (await api("GET", "profiles?select=user_id&limit=1")).json?.[0]?.user_id;
      const cA = await newCompany("S11a"), cB = await newCompany("S11b");
      const k = crypto.randomUUID(); created.keys.push(k);
      const ins = (company: string) => api("POST", "platform_operation_keys?on_conflict=request_key", { request_key: k, operation: "conc_test", company_id: company, actor_user_id: actor }, true, { Prefer: "resolution=ignore-duplicates,return=representation" });
      const calls = await burst("S11 (tabela) insert x12 mesma request_key", 12, () => ins(cA), evidence) as any[];
      const rows = (await api("GET", `platform_operation_keys?request_key=eq.${k}&select=request_key,company_id`)).json ?? [];
      check("S11 12 inserções simultâneas da mesma chave: nenhuma 5xx/erro", calls.every((c) => c.status < 300), calls.map((c) => c.status).join(",").slice(0, 60));
      check("S11 existe exatamente 1 linha da chave", rows.length === 1, `linhas=${rows.length}`);
      const k2 = crypto.randomUUID(); created.keys.push(k2);
      const ins2 = (company: string) => api("POST", "platform_operation_keys?on_conflict=request_key", { request_key: k2, operation: "conc_test", company_id: company, actor_user_id: actor }, true, { Prefer: "resolution=ignore-duplicates,return=representation" });
      await burst("S12 (tabela) insert x12 mesma chave, 2 empresas", 12, (i) => ins2(i % 2 ? cA : cB), evidence);
      const rows2 = (await api("GET", `platform_operation_keys?request_key=eq.${k2}&select=company_id`)).json ?? [];
      check("S12 a chave fica ligada a UMA só empresa (a primeira a confirmar)", rows2.length === 1, `linhas=${rows2.length}`);
    }

    // S13: burst maior: 10 empresas x 4 claims simultâneos (40 chamadas) => exatamente 10 reservas
    {
      const comps: string[] = [];
      for (let i = 0; i < 10; i++) comps.push(await newCompany(`S13-${i}`));
      const calls = await burst("S13 claim x40 (10 empresas x4)", 40, (i) => claim(comps[i % 10]), evidence) as any[];
      const createdN = calls.filter((c) => c.json?.[0]?.created).length;
      const pend = (await api("GET", `subscription_payments?company_id=in.(${comps.join(",")})&status=eq.pending&select=id,company_id`)).json ?? [];
      check("S13 40 chamadas: nenhuma 5xx", calls.every((c) => c.status < 500), "");
      check("S13 exatamente 10 reservas criadas (1 por empresa)", createdN === 10 && pend.length === 10 && new Set(pend.map((p: any) => p.company_id)).size === 10, `created=${createdN} pending=${pend.length}`);
    }

    // S14: 30 confirmações simultâneas em 30 empresas diferentes (sem contenção global / sem deadlock)
    {
      const comps: string[] = [], pays: string[] = [];
      for (let i = 0; i < 30; i++) {
        const c = await newCompany(`S14-${i}`); comps.push(c);
        const p = (await claim(c)).json[0].payment_id; pays.push(p);
        await setTx(p, `g${i}`);
      }
      const calls = await burst("S14 confirm x30 (30 empresas)", 30, (i) => confirm(pays[i], `conc:S14:${i}`), evidence) as any[];
      const subs = (await api("GET", `subscriptions?company_id=in.(${comps.join(",")})&select=company_id`)).json ?? [];
      check("S14 30 confirmações em empresas distintas: todas ok, sem 5xx", calls.every((c) => c.status < 500 && c.json?.[0]?.ok === true), calls.filter((c) => !(c.json?.[0]?.ok)).map((c) => c.status).join(","));
      check("S14 exatamente 30 assinaturas (uma por empresa)", subs.length === 30 && new Set(subs.map((s: any) => s.company_id)).size === 30, `subs=${subs.length}`);
    }

    // INVARIANTES GLOBAIS sobre todas as fixtures deste teste
    {
      const ids = created.companies.join(",");
      const pays = (await api("GET", `subscription_payments?company_id=in.(${ids})&select=id,company_id,plan_id,status,provider_transaction_id`)).json ?? [];
      const subs = (await api("GET", `subscriptions?company_id=in.(${ids})&select=id,company_id,plan_id,status,expires_at,lifetime`)).json ?? [];
      const ents = (await api("GET", `company_entitlements?company_id=in.(${ids})&select=company_id,plan_id,status,access_expires_at,lifetime`)).json ?? [];
      const evs = (await api("GET", `payment_events?subscription_payment_id=in.(${pays.map((p: any) => p.id).join(",")})&select=event_id,processed`)).json ?? [];
      const cnt = (arr: any[], f: (x: any) => string) => arr.reduce((m: Record<string, number>, x) => ((m[f(x)] = (m[f(x)] ?? 0) + 1), m), {});
      const dupPending = Object.values(cnt(pays.filter((p: any) => p.status === "pending"), (p) => `${p.company_id}|${p.plan_id}`)).filter((n) => n > 1).length;
      const dupSubs = Object.values(cnt(subs, (s) => s.company_id)).filter((n) => n > 1).length;
      const dupEnts = Object.values(cnt(ents, (e) => e.company_id)).filter((n) => n > 1).length;
      const dupEvents = Object.values(cnt(evs, (e) => e.event_id)).filter((n) => n > 1).length;
      const subBy = Object.fromEntries(subs.map((s: any) => [s.company_id, s]));
      const incoherent = ents.filter((e: any) => { const s = subBy[e.company_id]; return !s || s.plan_id !== e.plan_id || s.status !== e.status || (s.expires_at ?? null) !== (e.access_expires_at ?? null) || s.lifetime !== e.lifetime; }).length;
      const paidWithoutSub = pays.filter((p: any) => p.status === "paid" && !subBy[p.company_id]).length;
      invariants = { companies: created.companies.length, payments: pays.length, subscriptions: subs.length, entitlements: ents.length, events: evs.length, dup_pending_per_intent: dupPending, dup_subscriptions: dupSubs, dup_entitlements: dupEnts, dup_event_ids: dupEvents, entitlement_incoherent: incoherent, paid_without_subscription: paidWithoutSub };
      check("INV nenhuma intenção com >1 cobrança pending", dupPending === 0, JSON.stringify(invariants));
      check("INV no máximo 1 assinatura e 1 entitlement por empresa", dupSubs === 0 && dupEnts === 0, "");
      check("INV nenhum event_id duplicado", dupEvents === 0, "");
      check("INV entitlements idênticos à assinatura (plano, status, vencimento, lifetime)", incoherent === 0, "");
      check("INV nenhum pagamento 'paid' sem assinatura (exceto S10 refunded)", paidWithoutSub === 0, "");
    }
  } catch (e) {
    errors.push(String((e as Error).message ?? e));
  } finally {
    // limpeza: só o que este teste criou
    const failedDeletes: string[] = [];
    for (const c of created.companies) {
      const pays = (await api("GET", `subscription_payments?company_id=eq.${c}&select=id`)).json ?? [];
      for (const p of pays) await api("DELETE", `payment_events?subscription_payment_id=eq.${p.id}`);
      for (const t of ["subscription_payments?company_id", "company_entitlements?company_id", "subscriptions?company_id"]) {
        const r = await api("DELETE", `${t}=eq.${c}`); if (!r.ok) failedDeletes.push(`${t}:${r.status}`);
      }
    }
    // as chaves de operação referenciam as empresas: removê-las ANTES das empresas
    for (const k of created.keys) await api("DELETE", `platform_operation_keys?request_key=eq.${k}`);
    for (const c of created.companies) {
      const r = await api("DELETE", `companies?id=eq.${c}`); if (!r.ok) failedDeletes.push(`companies:${r.status}`);
    }
    const left = (await api("GET", "companies?name=like.%5BCONCTEST%5D*&select=id")).json ?? [];
    const leftKeys = created.keys.length ? ((await api("GET", `platform_operation_keys?request_key=in.(${created.keys.join(",")})&select=request_key`)).json ?? []) : [];
    cleanup = { companies_created: created.companies.length, residual_conctest_companies: left.length, residual_operation_keys: leftKeys.length, failed_deletes: failedDeletes };
  }
  const failed = results.filter((r) => !r.ok);
  return new Response(JSON.stringify({ total: results.length, pass: results.length - failed.length, fail: failed.length, failed, errors, invariants, concurrency_evidence: evidence, cleanup, results }), { headers: { "Content-Type": "application/json" } });
});
