// Sonda do cliente HTTP da SyncPay, executada num processo filho com `--conditions=react-server` (o pacote `server-only`
// só deixa de lançar erro com essa condição). `fetch` é SUBSTITUÍDO por um dublê: NENHUMA chamada de rede e NENHUM dinheiro.
// As respostas abaixo reproduzem os exemplos da documentação (docs.syncpayments.com.br) — não são prova de integração real.
// Credenciais são FALSAS (inválidas de propósito).
process.env.SYNCPAY_CLIENT_ID = "FAKE-CLIENT-ID";
process.env.SYNCPAY_CLIENT_SECRET = "FAKE-SECRET-NOT-REAL";
process.env.SYNCPAY_API_BASE_URL = "https://syncpay.invalid/";

const client = await import("../../../src/lib/syncpay/client.ts");
const { createPixCharge, createCardCharge, getTransaction, getAccessToken, resetTokenCache, SyncPayError, SYNCPAY_TIMEOUT_MS, cardCheckoutConfig } = client;

const calls = [];
let handler;
globalThis.fetch = async (url, init) => {
  calls.push({
    url: String(url),
    method: init?.method ?? "GET",
    auth: init?.headers?.Authorization ?? null,
    hasSignal: init?.signal instanceof AbortSignal,
    body: init?.body ? JSON.parse(init.body) : null,
  });
  return handler(String(url), init);
};
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const TOKEN = (n) => json(200, { access_token: `TOKEN_${n}`, token_type: "Bearer", expires_in: 3600, expires_at: "2099-01-01T00:00:00Z" });

const buyer = { name: "Maria Silva", document: "52998224725", email: "maria@teste.com", phone: "11999998888" };
const out = [];

async function run(name, h, fn) {
  resetTokenCache();
  calls.length = 0;
  handler = h;
  let r;
  try {
    r = { ok: true, value: await fn() };
  } catch (e) {
    r = { ok: false, errName: e?.name, status: e?.status, code: e?.code ?? null, message: String(e?.message), isSyncPayError: e instanceof SyncPayError };
  }
  out.push({ name, ...r, calls: calls.map((c) => ({ ...c })) });
}

out.push({ name: "constants", timeoutMs: SYNCPAY_TIMEOUT_MS });

// 1) token: POST /api/partner/v1/auth-token, base sem barra dupla, reaproveitado
{
  let n = 0;
  await run("token cache", (url) => (url.endsWith("/auth-token") ? TOKEN(++n) : json(200, { pix_code: "00020126...", identifier: "3df0319d-ecf7-455a-84c4-070aee2779c1" })), async () => {
    await createPixCharge({ amount: 89, description: "d", buyer });
    await createPixCharge({ amount: 89, description: "d", buyer });
    return n;
  });
}

// 2) Pix: corpo e resposta da documentação
await run("pix ok", (url) => (url.endsWith("/auth-token") ? TOKEN(1) : json(200, { message: "Cashin request successfully submitted", pix_code: "00020126820014br.gov.bcb.pix...", identifier: "3df0319d-ecf7-455a-84c4-070aee2779c1" })), () => createPixCharge({ amount: 89, description: "Prime Ges MONTHLY PRIMEGES:x", buyer }));
await run("pix resposta sem identifier", (url) => (url.endsWith("/auth-token") ? TOKEN(1) : json(200, { message: "ok", pix_code: "x" })), () => createPixCharge({ amount: 89, description: "d", buyer }));
await run("pix 422", (url) => (url.endsWith("/auth-token") ? TOKEN(1) : json(422, { message: "Your account is not approved yet. Please wait for approval.", action: "wait_for_approval" })), () => createPixCharge({ amount: 89, description: "d", buyer }));

// 3) 401 renova o token UMA vez
{
  let tokens = 0;
  let pixCalls = 0;
  await run("401 renova", (url) => {
    if (url.endsWith("/auth-token")) return TOKEN(++tokens);
    pixCalls += 1;
    return pixCalls === 1 ? json(401, { message: "Unauthenticated." }) : json(200, { pix_code: "x", identifier: "id1" });
  }, () => createPixCharge({ amount: 89, description: "d", buyer }));
}
await run("401 persistente", (url) => (url.endsWith("/auth-token") ? TOKEN(1) : json(401, { message: "Unauthenticated." })), () => createPixCharge({ amount: 89, description: "d", buyer }));
await run("credenciais inválidas", () => json(401, { error: "invalid_client", error_description: "Client authentication failed" }), () => getAccessToken());

// 4) cartão
await run("cartao cpf ok", (url) => (url.endsWith("/auth-token") ? TOKEN(1) : json(200, { data: { message: "Credit card payment request successfully submitted.", transaction_id: "acfbabc5-bb8a-4459-aa05-7374c2e5e9ef" } })), () =>
  createCardCharge({ amount: 89, description: "d", cardToken: "card_token.abcdefgh", buyer, device: { ip: "187.45.201.10", userAgent: "UA", pageUrl: "https://primeges.com.br/app/assinatura/pagamento/x", metadata: { payment: "x" } } }));
await run("cartao cnpj + transaction_id null", (url) => (url.endsWith("/auth-token") ? TOKEN(1) : json(200, { data: { message: "ok", transaction_id: null } })), () =>
  createCardCharge({ amount: 89, description: "d", cardToken: "card_token.abcdefgh", buyer: { ...buyer, document: "11222333000181" }, device: { ip: "1.2.3.4", userAgent: "UA", pageUrl: "https://primeges.com.br/p", metadata: { a: "b" } } }));
for (const [status, body] of [[409, { error_code: "DUPLICATE_CARD_TOKEN", message: "Este cartão já foi utilizado nesta cobrança." }], [422, { message: "Não foi possível processar o pagamento com este cartão." }], [403, { message: "Credit card via API is not enabled for this user." }], [500, { message: "boom" }]]) {
  await run(`cartao ${status}`, (url) => (url.endsWith("/auth-token") ? TOKEN(1) : json(status, body)), () =>
    createCardCharge({ amount: 89, description: "d", cardToken: "card_token.abcdefgh", buyer, device: { ip: "1.2.3.4", userAgent: "UA", pageUrl: "https://primeges.com.br/p", metadata: { a: "b" } } }));
}

// 5) consulta V2
await run("get v2 ok", (url) => (url.endsWith("/auth-token") ? TOKEN(1) : json(200, { data: { transaction: { reference_id: "9f3c2a7e-5b1d-4c8e-a2f0-7d6b1e4c9a31", status: "completed", amount: 197, end_to_end_id: "E1823", description: "Prime Ges PRIMEGES:x" } } })), () => getTransaction("9f3c2a7e-5b1d-4c8e-a2f0-7d6b1e4c9a31"));
await run("get v2 caractere especial", (url) => (url.endsWith("/auth-token") ? TOKEN(1) : json(200, { data: { transaction: { reference_id: "a", status: "pending", amount: "10.50" } } })), () => getTransaction("a b/c?x=1"));
await run("get v2 429 (limite de 5 consultas)", (url) => (url.endsWith("/auth-token") ? TOKEN(1) : json(429, { message: "Limite de 5 consultas para este recurso atingido. Use o webhook para receber as mudanças de status." })), () => getTransaction("a"));
await run("get v2 corpo vazio", (url) => (url.endsWith("/auth-token") ? TOKEN(1) : json(200, { data: {} })), () => getTransaction("a"));

// 6) falhas
await run("get 500 html", (url) => (url.endsWith("/auth-token") ? TOKEN(1) : new Response("<html>boom</html>", { status: 500 })), () => getTransaction("a"));
await run("200 não json", (url) => (url.endsWith("/auth-token") ? TOKEN(1) : new Response("<html>proxy</html>", { status: 200 })), () => getTransaction("a"));
await run("falha de rede", () => { throw new TypeError("fetch failed: segredo FAKE-SECRET-NOT-REAL"); }, () => getTransaction("a"));
await run("timeout", () => { throw new DOMException("The operation was aborted due to timeout", "TimeoutError"); }, () => getTransaction("a"));

// 7) configuração ausente (não envia requisição anônima)
delete process.env.SYNCPAY_CLIENT_SECRET;
await run("sem secret", () => TOKEN(1), () => getAccessToken());
process.env.SYNCPAY_CLIENT_SECRET = "FAKE-SECRET-NOT-REAL";
delete process.env.SYNCPAY_CLIENT_ID;
await run("sem client id", () => TOKEN(1), () => getAccessToken());

// 8) configuração do cartão
out.push({
  name: "cardCheckoutConfig",
  semNada: cardCheckoutConfig({}),
  semFlag: cardCheckoutConfig({ SYNCPAY_PUBLIC_KEY: "pk_live_abc123" }),
  chaveRuim: cardCheckoutConfig({ SYNCPAY_PUBLIC_KEY: "sk_live_abc123", SYNCPAY_CARD_ENABLED: "1" }),
  ok: cardCheckoutConfig({ SYNCPAY_PUBLIC_KEY: "pk_live_abc123", SYNCPAY_CARD_ENABLED: "1" }),
});

console.log(JSON.stringify(out));
