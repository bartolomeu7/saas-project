import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { describe, it, before } from "node:test";
import { fileURLToPath } from "node:url";

/**
 * Cliente HTTP da MisticPay com `fetch` SIMULADO (sem rede, sem dinheiro). Cobre o que dá para provar sem uma cobrança real:
 * URL/método/autenticação Basic/corpo conforme a documentação, erros 4xx/5xx no formato { code, message }, timeout, corpo
 * ilegível, configuração ausente e vazamento de segredo. NÃO verifica a integração real: as respostas são dublês da documentação.
 */
const probe = fileURLToPath(new URL("./helpers/misticpay-client-probe.mjs", import.meta.url));
let r = {};
const BASE = "https://misticpay.invalid";

describe("cliente MisticPay (fetch simulado)", () => {
  before(() => {
    const child = spawnSync(process.execPath, ["--no-warnings", "--experimental-strip-types", "--conditions=react-server", probe], { encoding: "utf8" });
    assert.equal(child.status, 0, `sonda falhou: ${child.stderr}`);
    r = Object.fromEntries(JSON.parse(child.stdout).map((x) => [x.name, x]));
  });

  it("o timeout por chamada é finito (12 s) e toda chamada leva um AbortSignal", () => {
    assert.equal(r.constants.timeoutMs, 12_000);
    for (const k of ["pix ok", "check ok"]) for (const c of r[k].calls) assert.equal(c.hasSignal, true, k);
  });

  it("Pix: POST /api/transactions/create com Basic base64(id:secret), valor em reais e nosso transactionId", () => {
    const c = r["pix ok"].calls[0];
    assert.equal(c.url, `${BASE}/api/transactions/create`, "base com barra final não duplica");
    assert.equal(c.method, "POST");
    assert.equal(c.auth, `Basic ${r.constants.basic}`);
    assert.deepEqual(c.body, {
      amount: 89,
      payerName: "Maria Silva",
      payerDocument: "52998224725",
      transactionId: "11111111-2222-3333-4444-555555555555",
      description: "Prime Ges MONTHLY",
      projectWebhook: "https://primeges.com.br/api/webhooks/misticpay?token=abc",
    });
  });

  it("Pix: devolve o transactionId da MisticPay e o copia-e-cola", () => {
    assert.equal(r["pix ok"].ok, true);
    assert.deepEqual(r["pix ok"].value, { transactionId: "31484480", pixCode: "00020101021226820014br.gov.bcb.pix2560qrcode..." });
  });

  it("Pix: transactionId numérico vira texto; sem webhook o campo projectWebhook nem é enviado", () => {
    assert.equal(r["pix sem webhook"].value.transactionId, "31484480");
    assert.equal("projectWebhook" in r["pix sem webhook"].calls[0].body, false);
  });

  it("Pix: resposta sem copia-e-cola, sem id ou com corpo ilegível NUNCA vira cobrança criada", () => {
    for (const k of ["pix resposta sem copyPaste", "pix resposta sem transactionId", "pix corpo ilegivel"]) {
      assert.equal(r[k].ok, false, k);
      assert.equal(r[k].isMisticPayError, true, k);
    }
  });

  it("erros documentados preservam status, código estável e mensagem", () => {
    assert.deepEqual([r["pix 401 IP"].status, r["pix 401 IP"].code], [401, "IP_NOT_ALLOWED"]);
    assert.match(r["pix 401 IP"].message, /não está autorizado/);
    assert.deepEqual([r["pix 403 escopo"].status, r["pix 403 escopo"].code], [403, "API_SCOPE_DENIED"]);
    assert.deepEqual([r["pix 400 validacao"].status, r["pix 400 validacao"].code], [400, "VALIDATION_ERROR"]);
    assert.deepEqual([r["pix 429"].status, r["pix 429"].code], [429, "RATE_LIMITED"]);
  });

  it("5xx com corpo que não é JSON mantém o status e uma mensagem genérica", () => {
    assert.equal(r["pix 500 sem json"].status, 502);
    assert.equal(r["pix 500 sem json"].code, null);
    assert.match(r["pix 500 sem json"].message, /502/);
  });

  it("check: POST /api/transactions/check com o identificador; lê estado, valor e taxa em reais", () => {
    const c = r["check ok"].calls[0];
    assert.equal(c.url, `${BASE}/api/transactions/check`);
    assert.equal(c.method, "POST");
    assert.deepEqual(c.body, { transactionId: "31484480" });
    assert.deepEqual(r["check ok"].value, { state: "COMPLETO", value: 89, fee: 0.31, type: "DEPOSITO" });
  });

  it("check: números como texto são lidos; estado ausente ou sem transaction é recusado", () => {
    assert.deepEqual(r["check pendente texto"].value, { state: "PENDENTE", value: 89, fee: 0.31, type: "DEPOSITO" });
    assert.equal(r["check sem estado"].ok, false);
    assert.equal(r["check sem transaction"].ok, false);
  });

  it("check: 404 TRANSACTION_NOT_FOUND chega com status 404 (o chamador tenta o outro identificador)", () => {
    assert.deepEqual([r["check 404"].status, r["check 404"].code], [404, "TRANSACTION_NOT_FOUND"]);
  });

  it("rede e tempo esgotado viram MisticPayError com status 0 (resultado desconhecido)", () => {
    assert.deepEqual([r["rede cai"].status, r["rede cai"].isMisticPayError], [0, true]);
    assert.deepEqual([r["tempo esgotado"].status, r["tempo esgotado"].isMisticPayError], [0, true]);
    assert.match(r["tempo esgotado"].message, /Tempo esgotado/);
  });

  it("configuração: sem Client ID ou Secret falha com mensagem clara; base padrão é a oficial", () => {
    assert.match(r.config.semId, /MISTICPAY_CLIENT_ID/);
    assert.match(r.config.semSecret, /MISTICPAY_CLIENT_SECRET/);
    assert.equal(r.config.padrao, "https://api.misticpay.com");
  });

  it("o segredo nunca aparece nas mensagens de erro", () => {
    const all = JSON.stringify(r);
    assert.equal(r["segredo nao vaza"].message.includes("sk_FAKE_SECRET_NOT_REAL"), false);
    assert.equal(r["segredo nao vaza"].message.includes(r.constants.basic), false);
    // o segredo só viaja dentro do cabeçalho Basic (base64) — nunca em texto puro nas chamadas registradas
    assert.equal(all.includes("sk_FAKE_SECRET_NOT_REAL\""), false);
  });
});
