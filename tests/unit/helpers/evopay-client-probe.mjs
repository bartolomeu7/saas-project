// Sonda do cliente HTTP da EvoPay, executada em um processo filho com `--conditions=react-server` (o pacote
// `server-only` só deixa de lançar erro com essa condição). `fetch` é SUBSTITUÍDO por um dublê: NENHUMA chamada de rede
// e NENHUM dinheiro. As respostas abaixo são SIMULADAS — não são prova de integração real com a EvoPay.
// Variáveis e chave são FALSAS (inválidas de propósito).
process.env.EVOPAY_API_BASE_URL = "https://evopay.invalid/v1";
process.env.EVOPAY_API_KEY = "FAKE-KEY-NOT-REAL";

const { createPixCharge, getPixCharge, EvoPayError, EVOPAY_TIMEOUT_MS } = await import("../../../src/lib/evopay/client.ts");

const calls = [];
let next;
globalThis.fetch = async (url, init) => {
  calls.push({
    url: String(url),
    method: init?.method ?? "GET",
    hasKey: init?.headers?.["API-Key"] === "FAKE-KEY-NOT-REAL",
    hasSignal: init?.signal instanceof AbortSignal,
    signalAborted: init?.signal?.aborted === true,
    body: init?.body ? JSON.parse(init.body) : null,
  });
  return next();
};
const json = (status, body) => () => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const text = (status, body) => () => new Response(body, { status });

async function run(name, makeNext, fn) {
  next = makeNext;
  calls.length = 0;
  let out;
  try {
    out = { ok: true, value: await fn() };
  } catch (e) {
    out = { ok: false, errName: e?.name, status: e?.status, message: String(e?.message), isEvoPayError: e instanceof EvoPayError };
  }
  return { name, ...out, call: calls[0] ?? null };
}

const results = [];
results.push({ name: "constants", timeoutMs: EVOPAY_TIMEOUT_MS });
results.push(await run("create ok", json(200, { id: "cmq47c6un0c05ufvvo58ohpqk", status: "PENDING", amount: 89 }), () => createPixCharge({ amount: 89, externalReference: "PRIMEGES:x" })));
results.push(await run("get ok", json(200, { id: "abc", status: "COMPLETED", amount: 89 }), () => getPixCharge("abc def&x=1")));
results.push(await run("401 message", json(401, { success: false, message: "Token inválido" }), () => getPixCharge("a")));
results.push(await run("400 error field", json(400, { error: "Depósito bloqueado" }), () => createPixCharge({ amount: 89 })));
results.push(await run("500 html", text(500, "<html>boom</html>"), () => getPixCharge("a")));
results.push(await run("200 not json", text(200, "<html>proxy</html>"), () => getPixCharge("a")));
results.push(await run("404", json(404, { message: "Transação não encontrada" }), () => getPixCharge("zzz")));
results.push(await run("network failure", () => { throw new TypeError("fetch failed"); }, () => getPixCharge("a")));
results.push(await run("timeout", () => { throw new DOMException("The operation was aborted due to timeout", "TimeoutError"); }, () => getPixCharge("a")));
results.push(await run("abort", () => { throw new DOMException("aborted", "AbortError"); }, () => createPixCharge({ amount: 89 })));

delete process.env.EVOPAY_API_KEY;
results.push(await run("missing key", json(200, {}), () => getPixCharge("a")));
process.env.EVOPAY_API_KEY = "FAKE-KEY-NOT-REAL";
delete process.env.EVOPAY_API_BASE_URL;
results.push(await run("missing base url", json(200, {}), () => getPixCharge("a")));

console.log(JSON.stringify(results));
