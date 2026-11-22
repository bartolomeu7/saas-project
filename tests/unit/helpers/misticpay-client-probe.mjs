// Sonda do cliente HTTP da MisticPay, executada num processo filho com `--conditions=react-server` (o pacote `server-only`
// só deixa de lançar erro com essa condição). `fetch` é SUBSTITUÍDO por um dublê: NENHUMA chamada de rede e NENHUM dinheiro.
// As respostas reproduzem os exemplos da documentação (docs.misticpay.com) — não são prova de integração real.
// Credenciais FALSAS (inválidas de propósito).
process.env.MISTICPAY_CLIENT_ID = "pk_FAKE_ID";
process.env.MISTICPAY_CLIENT_SECRET = "sk_FAKE_SECRET_NOT_REAL";
process.env.MISTICPAY_API_BASE_URL = "https://misticpay.invalid/";

const { createPixCharge, checkTransaction, MisticPayError, MISTICPAY_TIMEOUT_MS, readConfig } = await import("../../../src/lib/misticpay/client.ts");

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

const out = [];
async function run(name, h, fn) {
  calls.length = 0;
  handler = h;
  let r;
  try {
    r = { ok: true, value: await fn() };
  } catch (e) {
    r = { ok: false, errName: e?.name, status: e?.status, code: e?.code ?? null, message: String(e?.message), isMisticPayError: e instanceof MisticPayError };
  }
  out.push({ name, ...r, calls: calls.map((c) => ({ ...c })) });
}

out.push({ name: "constants", timeoutMs: MISTICPAY_TIMEOUT_MS, basic: Buffer.from("pk_FAKE_ID:sk_FAKE_SECRET_NOT_REAL").toString("base64") });

const charge = { amount: 89, transactionId: "11111111-2222-3333-4444-555555555555", description: "Prime Ges MONTHLY", payerName: "Maria Silva", payerDocument: "52998224725", webhookUrl: "https://primeges.com.br/api/webhooks/misticpay?token=abc" };

// 1) Pix ok: corpo e resposta da documentação (transactionId vem como texto; copyPaste é o "copia e cola")
await run("pix ok", () => json(200, { message: "Transação criada com sucesso", data: { transactionId: "31484480", transactionState: "PENDENTE", transactionAmount: 8900, copyPaste: "00020101021226820014br.gov.bcb.pix2560qrcode..." } }), () => createPixCharge(charge));
await run("pix sem webhook", () => json(200, { data: { transactionId: 31484480, copyPaste: "000201..." } }), () => createPixCharge({ ...charge, webhookUrl: undefined }));
await run("pix resposta sem copyPaste", () => json(200, { data: { transactionId: "1" } }), () => createPixCharge(charge));
await run("pix resposta sem transactionId", () => json(200, { data: { copyPaste: "000201..." } }), () => createPixCharge(charge));
await run("pix corpo ilegivel", () => new Response("<html>ok</html>", { status: 200 }), () => createPixCharge(charge));

// 2) erros no formato documentado { code, message, statusCode, details, requestId }
await run("pix 401 IP", () => json(401, { code: "IP_NOT_ALLOWED", message: "O IP de origem não está autorizado.", statusCode: 401, details: null, requestId: "r1" }), () => createPixCharge(charge));
await run("pix 403 escopo", () => json(403, { code: "API_SCOPE_DENIED", message: "A chave não tem o escopo TRANSACTION_CREATE.", statusCode: 403 }), () => createPixCharge(charge));
await run("pix 400 validacao", () => json(400, { code: "VALIDATION_ERROR", message: "payerDocument inválido", statusCode: 400, details: { issues: [{ field: "payerDocument" }] } }), () => createPixCharge(charge));
await run("pix 429", () => json(429, { code: "RATE_LIMITED", message: "Muitas requisições", statusCode: 429 }), () => createPixCharge(charge));
await run("pix 500 sem json", () => new Response("Bad gateway", { status: 502 }), () => createPixCharge(charge));

// 3) check
await run("check ok", () => json(200, { message: "Transação encontrada com sucesso!", transaction: { transactionId: "301124932.60430735", value: 89, fee: 0.31, transactionState: "COMPLETO", transactionType: "DEPOSITO", transactionMethod: "PIX" } }), () => checkTransaction("31484480"));
await run("check pendente texto", () => json(200, { transaction: { value: "89.00", fee: "0.31", transactionState: "PENDENTE", transactionType: "DEPOSITO" } }), () => checkTransaction("x"));
await run("check sem estado", () => json(200, { transaction: { value: 89 } }), () => checkTransaction("x"));
await run("check sem transaction", () => json(200, { message: "ok" }), () => checkTransaction("x"));
await run("check 404", () => json(404, { code: "TRANSACTION_NOT_FOUND", message: "Transação não encontrada", statusCode: 404 }), () => checkTransaction("nao-existe"));

// 4) rede e tempo esgotado
await run("rede cai", () => { throw new TypeError("fetch failed"); }, () => createPixCharge(charge));
await run("tempo esgotado", () => { const e = new Error("timeout"); e.name = "TimeoutError"; throw e; }, () => checkTransaction("x"));

// 5) configuração ausente
{
  const bad = (env) => { try { readConfig(env); return "ok"; } catch (e) { return String(e.message); } };
  out.push({ name: "config", semId: bad({ MISTICPAY_CLIENT_SECRET: "x" }), semSecret: bad({ MISTICPAY_CLIENT_ID: "x" }), padrao: readConfig({ MISTICPAY_CLIENT_ID: "a", MISTICPAY_CLIENT_SECRET: "b" }).baseUrl });
}

// 6) o segredo nunca aparece em mensagens de erro
await run("segredo nao vaza", () => json(401, { code: "INVALID_API_CREDENTIAL", message: "Credencial inválida", statusCode: 401 }), () => createPixCharge(charge));

process.stdout.write(JSON.stringify(out));
