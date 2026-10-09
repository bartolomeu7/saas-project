/**
 * Teste de CONCORRÊNCIA do billing contra o projeto TEST do Supabase (transações reais e separadas, via PostgREST).
 * Não faz parte do `npm run test:unit` (precisa de rede e da service role do TEST).
 *
 *   node --env-file=.env.local tests/integration/billing-concurrency.mjs
 *
 * Segurança: só roda se o projeto for o TEST (ref abaixo). Cria uma empresa "[CONCTEST]" e remove tudo no final.
 * Nunca imprime chaves. Sem provedor e sem dinheiro: chama as RPCs que o webhook/"Já paguei" chamariam.
 */
import assert from "node:assert/strict";

const TEST_REF = "zlmxbqlpjstmllrvafmy";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
if (!url.includes(TEST_REF)) {
  console.error(`ABORTADO: este teste só roda no projeto TEST (${TEST_REF}).`);
  process.exit(2);
}
if (!key) {
  console.error("ABORTADO: SUPABASE_SERVICE_ROLE_KEY ausente.");
  process.exit(2);
}

const headers = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=representation" };
async function api(method, path, body) {
  const res = await fetch(`${url}/rest/v1/${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* corpo não JSON */ }
  return { ok: res.ok, status: res.status, json, text };
}
const rpc = (fn, args) => api("POST", `rpc/${fn}`, args);

const results = [];
function check(name, condition, detail = "") {
  results.push({ name, ok: Boolean(condition), detail });
  console.log(`${condition ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
}

const monthly = (await api("GET", "plans?code=eq.MONTHLY&select=id,price,access_duration_days")).json?.[0];
assert.ok(monthly, "plano MONTHLY não encontrado no TEST");
const yearly = (await api("GET", "plans?code=eq.YEARLY&select=id,price")).json?.[0];

const created = { companies: [], payments: [] };
async function newCompany(label) {
  const r = await api("POST", "companies", { name: `[CONCTEST] ${label} ${Date.now()}`, business_type: "other", status: "active" });
  assert.ok(r.ok, `criar empresa: ${r.text}`);
  created.companies.push(r.json[0].id);
  return r.json[0].id;
}
const claim = (company, plan = monthly) => rpc("claim_subscription_payment", { p_company_id: company, p_plan_id: plan.id, p_amount: Number(plan.price), p_currency: "BRL" });
const confirm = (paymentId, event, amount = Number(monthly.price), status = "paid") =>
  rpc("confirm_subscription_payment", { p_payment_id: paymentId, p_provider_status: status, p_end_to_end_id: "E2E-CONC", p_event_id: event, p_event_type: "pix.status_check", p_event_payload: {}, p_provider_amount: amount });
const days = (iso) => (new Date(iso).getTime() - Date.now()) / 86400000;

try {
  // ---------------------------------------------------------------- S1: 12 reservas simultâneas da MESMA intenção
  {
    const company = await newCompany("S1");
    const calls = await Promise.all(Array.from({ length: 12 }, () => claim(company)));
    const rows = calls.map((c) => c.json?.[0]).filter(Boolean);
    const ids = new Set(rows.map((r) => r.payment_id));
    const createdCount = rows.filter((r) => r.created).length;
    const open = (await api("GET", `subscription_payments?company_id=eq.${company}&status=eq.pending&select=id`)).json ?? [];
    created.payments.push(...open.map((p) => p.id));
    check("S1 12 reservas simultâneas: todas responderam", rows.length === 12, `${rows.length}/12`);
    check("S1 exatamente 1 criou (created=true)", createdCount === 1, `created=${createdCount}`);
    check("S1 todas devolveram o MESMO pagamento", ids.size === 1, `ids distintos=${ids.size}`);
    check("S1 só existe 1 cobrança pending no banco", open.length === 1, `pending=${open.length}`);
  }

  // ---------------------------------------------------------------- S2: 12 confirmações simultâneas do MESMO evento
  let company2, pay2;
  {
    company2 = await newCompany("S2");
    pay2 = (await claim(company2)).json[0].payment_id;
    created.payments.push(pay2);
    await api("PATCH", `subscription_payments?id=eq.${pay2}`, { provider_transaction_id: `tx_conc_${Date.now()}_a` });
    const calls = await Promise.all(Array.from({ length: 12 }, () => confirm(pay2, "conc:COMPLETED:same")));
    const rows = calls.map((c) => c.json?.[0]);
    const firstOnes = rows.filter((r) => r && r.ok && !r.already_processed).length;
    const sub = (await api("GET", `subscriptions?company_id=eq.${company2}&select=expires_at,status`)).json?.[0];
    const ev = (await api("GET", `payment_events?subscription_payment_id=eq.${pay2}&select=id,processed`)).json ?? [];
    check("S2 12 confirmações do mesmo evento: nenhuma falhou", rows.every((r) => r && r.ok), JSON.stringify(rows.filter((r) => !r?.ok)).slice(0, 120));
    check("S2 exatamente 1 processou de verdade (as outras já processadas)", firstOnes === 1, `primeiras=${firstOnes}`);
    check("S2 acesso concedido UMA vez (~31 dias, não 372)", sub && days(sub.expires_at) > 30.5 && days(sub.expires_at) < 31.5, `dias=${sub ? days(sub.expires_at).toFixed(2) : "sem assinatura"}`);
    check("S2 um único payment_event, processado", ev.length === 1 && ev[0].processed === true, `eventos=${ev.length}`);
  }

  // ---------------------------------------------------------------- S3: 12 confirmações com event_ids DIFERENTES (reentregas)
  {
    const calls = await Promise.all(Array.from({ length: 12 }, (_, i) => confirm(pay2, `conc:COMPLETED:redelivery:${i}`)));
    const sub = (await api("GET", `subscriptions?company_id=eq.${company2}&select=expires_at`)).json?.[0];
    check("S3 12 reentregas com event_id distinto: nenhuma falhou", calls.every((c) => c.json?.[0]?.ok), "");
    check("S3 o vencimento continua ~31 dias (sem dupla concessão)", sub && days(sub.expires_at) > 30.5 && days(sub.expires_at) < 31.5, `dias=${sub ? days(sub.expires_at).toFixed(2) : "-"}`);
  }

  // ---------------------------------------------------------------- S4: dois pagamentos DIFERENTES da mesma empresa NOVA, simultâneos
  {
    const company = await newCompany("S4");
    const a = (await claim(company, monthly)).json[0].payment_id;
    const b = (await claim(company, yearly)).json[0].payment_id;
    created.payments.push(a, b);
    await api("PATCH", `subscription_payments?id=eq.${a}`, { provider_transaction_id: `tx_conc_${Date.now()}_b1` });
    await api("PATCH", `subscription_payments?id=eq.${b}`, { provider_transaction_id: `tx_conc_${Date.now()}_b2` });
    const [ra, rb] = await Promise.all([confirm(a, "conc:S4:a", Number(monthly.price)), confirm(b, "conc:S4:b", Number(yearly.price))]);
    const okA = ra.json?.[0]?.ok === true, okB = rb.json?.[0]?.ok === true;
    const sub = (await api("GET", `subscriptions?company_id=eq.${company}&select=expires_at,status`)).json ?? [];
    const ent = (await api("GET", `company_entitlements?company_id=eq.${company}&select=access_expires_at,status`)).json ?? [];
    check("S4 as duas confirmações concorrentes (empresa sem assinatura) terminam OK", okA && okB, `a=${ra.status}/${ra.json?.message ?? okA} b=${rb.status}/${rb.json?.message ?? okB}`);
    check("S4 existe exatamente 1 assinatura e 1 entitlement", sub.length === 1 && ent.length === 1, `subs=${sub.length} ent=${ent.length}`);
    check("S4 acesso = 31 + 365 dias (as duas compras valem)", sub[0] && Math.abs(days(sub[0].expires_at) - 396) < 1, `dias=${sub[0] ? days(sub[0].expires_at).toFixed(2) : "-"}`);
    check("S4 entitlements coerentes com a assinatura", sub[0] && ent[0] && sub[0].expires_at === ent[0].access_expires_at, "");
  }

  // ---------------------------------------------------------------- S5: valor divergente concorrente nunca concede
  {
    const company = await newCompany("S5");
    const p = (await claim(company)).json[0].payment_id;
    created.payments.push(p);
    await api("PATCH", `subscription_payments?id=eq.${p}`, { provider_transaction_id: `tx_conc_${Date.now()}_c` });
    const calls = await Promise.all([...Array.from({ length: 6 }, (_, i) => confirm(p, `conc:S5:bad:${i}`, 1.0)), ...Array.from({ length: 6 }, (_, i) => confirm(p, `conc:S5:miss:${i}`, undefined))]);
    const sub = (await api("GET", `subscriptions?company_id=eq.${company}&select=id`)).json ?? [];
    const pay = (await api("GET", `subscription_payments?id=eq.${p}&select=status`)).json?.[0];
    check("S5 12 confirmações com valor errado/ausente: todas rejeitadas", calls.every((c) => c.json?.[0]?.ok === false && ["AMOUNT_MISMATCH", "AMOUNT_MISSING"].includes(c.json?.[0]?.rejection)), "");
    check("S5 nenhuma assinatura criada e pagamento segue pending", sub.length === 0 && pay?.status === "pending", `subs=${sub.length} status=${pay?.status}`);
  }
} finally {
  // limpeza: só o que este teste criou (filtra pelos ids)
  for (const c of created.companies) {
    const pays = (await api("GET", `subscription_payments?company_id=eq.${c}&select=id`)).json ?? [];
    for (const p of pays) await api("DELETE", `payment_events?subscription_payment_id=eq.${p.id}`);
    await api("DELETE", `subscription_payments?company_id=eq.${c}`);
    await api("DELETE", `company_entitlements?company_id=eq.${c}`);
    await api("DELETE", `subscriptions?company_id=eq.${c}`);
    await api("DELETE", `companies?id=eq.${c}`);
  }
  const left = (await api("GET", "companies?name=like.%5BCONCTEST%5D*&select=id")).json ?? [];
  console.log(`limpeza: resíduos [CONCTEST] restantes = ${left.length}`);
}

const failed = results.filter((r) => !r.ok);
console.log(`\nTOTAL ${results.length} | PASS ${results.length - failed.length} | FAIL ${failed.length}`);
process.exit(failed.length ? 1 : 0);
