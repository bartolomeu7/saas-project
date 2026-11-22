import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { describe, it, before } from "node:test";
import { fileURLToPath } from "node:url";

/**
 * Cliente HTTP da SyncPay com `fetch` SIMULADO (sem rede, sem dinheiro). Cobre o que dá para provar sem uma cobrança real:
 * URL/método/cabeçalhos/corpo conforme a documentação, cache e renovação do token, erros 4xx/5xx, timeout, corpo ilegível,
 * configuração ausente e vazamento de segredo. NÃO verifica a integração real: as respostas são dublês da documentação.
 */
const probe = fileURLToPath(new URL("./helpers/syncpay-client-probe.mjs", import.meta.url));
let r = {};
const BASE = "https://syncpay.invalid";

describe("cliente SyncPay (fetch simulado)", () => {
  before(() => {
    const child = spawnSync(process.execPath, ["--no-warnings", "--experimental-strip-types", "--conditions=react-server", probe], { encoding: "utf8" });
    assert.equal(child.status, 0, `sonda falhou: ${child.stderr}`);
    const list = JSON.parse(child.stdout);
    r = Object.fromEntries(list.map((x) => [x.name, x]));
  });

  it("o timeout por chamada é finito (12 s) e toda chamada leva um AbortSignal", () => {
    assert.equal(r.constants.timeoutMs, 12_000);
    for (const k of ["pix ok", "cartao cpf ok", "get v2 ok"]) for (const c of r[k].calls) assert.equal(c.hasSignal, true, k);
  });

  it("token: POST /api/partner/v1/auth-token com client_id e client_secret; base com barra final não duplica", () => {
    const c = r["pix ok"].calls[0];
    assert.equal(c.url, `${BASE}/api/partner/v1/auth-token`);
    assert.equal(c.method, "POST");
    assert.deepEqual(c.body, { client_id: "FAKE-CLIENT-ID", client_secret: "FAKE-SECRET-NOT-REAL" });
    assert.equal(c.auth, null, "o pedido de token não leva Authorization");
  });

  it("o token é reaproveitado: duas cobranças = UM pedido de token", () => {
    assert.equal(r["token cache"].ok, true);
    assert.equal(r["token cache"].value, 1);
    assert.equal(r["token cache"].calls.filter((c) => c.url.endsWith("/auth-token")).length, 1);
    assert.equal(r["token cache"].calls.filter((c) => c.url.endsWith("/cash-in")).length, 2);
  });

  it("Pix: POST /cash-in com Bearer, amount em reais, description e client — e devolve pix_code + identifier", () => {
    const c = r["pix ok"].calls[1];
    assert.equal(c.url, `${BASE}/api/partner/v1/cash-in`);
    assert.equal(c.method, "POST");
    assert.equal(c.auth, "Bearer TOKEN_1");
    assert.deepEqual(c.body, {
      amount: 89,
      description: "Prime Ges MONTHLY PRIMEGES:x",
      client: { name: "Maria Silva", document: "52998224725", email: "maria@teste.com", phone: "11999998888" },
    });
    assert.deepEqual(r["pix ok"].value, { pixCode: "00020126820014br.gov.bcb.pix...", identifier: "3df0319d-ecf7-455a-84c4-070aee2779c1" });
    assert.equal("webhook_url" in c.body, false, "sem webhook_url: o formato legado não é assinado");
  });

  it("Pix: resposta 200 sem identifier não vira cobrança", () => {
    assert.equal(r["pix resposta sem identifier"].ok, false);
    assert.equal(r["pix resposta sem identifier"].isSyncPayError, true);
  });

  it("422 conta não aprovada vira SyncPayError com status e a mensagem do provedor", () => {
    const x = r["pix 422"];
    assert.equal(x.ok, false);
    assert.equal(x.status, 422);
    assert.match(x.message, /not approved/);
  });

  it("401 renova o token UMA vez e repete; 401 persistente falha", () => {
    assert.equal(r["401 renova"].ok, true);
    assert.equal(r["401 renova"].calls.filter((c) => c.url.endsWith("/auth-token")).length, 2);
    assert.equal(r["401 renova"].calls.filter((c) => c.url.endsWith("/cash-in")).length, 2);
    assert.equal(r["401 persistente"].ok, false);
    assert.equal(r["401 persistente"].status, 401);
    assert.equal(r["401 persistente"].calls.filter((c) => c.url.endsWith("/cash-in")).length, 2, "no máximo uma repetição");
  });

  it("credenciais inválidas: erro com a descrição do provedor", () => {
    assert.equal(r["credenciais inválidas"].ok, false);
    assert.equal(r["credenciais inválidas"].status, 401);
    assert.match(r["credenciais inválidas"].message, /Client authentication failed/);
  });

  it("cartão: POST /credit-card com 1 parcela, token, comprador (cpf/cnpj) e device do COMPRADOR", () => {
    const c = r["cartao cpf ok"].calls[1];
    assert.equal(c.url, `${BASE}/api/partner/v1/credit-card`);
    assert.equal(c.auth, "Bearer TOKEN_1");
    assert.equal(c.body.amount, 89);
    assert.equal(c.body.installments, 1);
    assert.deepEqual(c.body.card, { token: "card_token.abcdefgh" });
    assert.deepEqual(c.body.client, { name: "Maria Silva", email: "maria@teste.com", phone: "11999998888", document: { type: "cpf", number: "52998224725" } });
    assert.deepEqual(c.body.device, { ip: "187.45.201.10", user_agent: "UA", page_url: "https://primeges.com.br/app/assinatura/pagamento/x", metadata: { payment: "x" } });
    assert.equal("number" in c.body.card || "cvv" in c.body.card, false, "dados do cartão nunca vão por aqui");
    assert.equal(r["cartao cpf ok"].value.transactionId, "acfbabc5-bb8a-4459-aa05-7374c2e5e9ef");
  });

  it("cartão: documento de 14 dígitos vira cnpj; transaction_id nulo não é erro (não retentar)", () => {
    const c = r["cartao cnpj + transaction_id null"];
    assert.equal(c.calls[1].body.client.document.type, "cnpj");
    assert.equal(c.ok, true);
    assert.equal(c.value.transactionId, null);
  });

  it("cartão: 409/422/403/500 viram SyncPayError com status (e o código de negócio no 409)", () => {
    assert.equal(r["cartao 409"].status, 409);
    assert.equal(r["cartao 409"].code, "DUPLICATE_CARD_TOKEN");
    assert.equal(r["cartao 422"].status, 422);
    assert.equal(r["cartao 403"].status, 403);
    assert.equal(r["cartao 500"].status, 500);
    for (const k of ["cartao 409", "cartao 422", "cartao 403", "cartao 500"]) {
      assert.equal(r[k].calls.filter((c) => c.url.endsWith("/credit-card")).length, 1, `${k}: nunca repete a cobrança (a rota não tem idempotência)`);
    }
  });

  it("consulta V2: GET /api/partner/v2/transactions/{reference_id}, com o id codificado na URL", () => {
    const ok = r["get v2 ok"];
    assert.equal(ok.calls[1].url, `${BASE}/api/partner/v2/transactions/9f3c2a7e-5b1d-4c8e-a2f0-7d6b1e4c9a31`);
    assert.equal(ok.calls[1].method, "GET");
    assert.deepEqual(ok.value, { referenceId: "9f3c2a7e-5b1d-4c8e-a2f0-7d6b1e4c9a31", status: "completed", amount: 197, endToEndId: "E1823", description: "Prime Ges PRIMEGES:x" });
    assert.equal(r["get v2 caractere especial"].calls[1].url, `${BASE}/api/partner/v2/transactions/a%20b%2Fc%3Fx%3D1`);
    assert.equal(r["get v2 caractere especial"].value.amount, 10.5, "amount em texto vira número");
  });

  it("consulta V2: 429 do limite de 5 consultas vira SyncPayError 429; corpo sem transaction é inválido", () => {
    assert.equal(r["get v2 429 (limite de 5 consultas)"].status, 429);
    assert.equal(r["get v2 corpo vazio"].ok, false);
    assert.equal(r["get v2 corpo vazio"].isSyncPayError, true);
  });

  it("5xx com corpo que não é JSON e 200 ilegível viram SyncPayError genérico (nunca 'pago' nem 'criado')", () => {
    assert.equal(r["get 500 html"].status, 500);
    assert.equal(r["get 500 html"].message, "SyncPay respondeu 500");
    assert.equal(r["200 não json"].ok, false);
    assert.equal(r["200 não json"].message, "Resposta inválida da SyncPay.");
  });

  it("falha de rede e timeout viram status 0 — e a mensagem NÃO repete o erro cru (que poderia ter segredo)", () => {
    assert.equal(r["falha de rede"].status, 0);
    assert.equal(r["falha de rede"].isSyncPayError, true);
    assert.doesNotMatch(r["falha de rede"].message, /FAKE-SECRET/);
    assert.equal(r.timeout.status, 0);
    assert.match(r.timeout.message, /Tempo esgotado/);
  });

  it("sem SYNCPAY_CLIENT_ID / SYNCPAY_CLIENT_SECRET falha claramente e NÃO envia requisição", () => {
    assert.match(r["sem secret"].message, /SYNCPAY_CLIENT_SECRET não configurada/);
    assert.match(r["sem client id"].message, /SYNCPAY_CLIENT_ID não configurada/);
    assert.equal(r["sem secret"].calls.length, 0);
    assert.equal(r["sem client id"].calls.length, 0);
  });

  it("nenhum erro nem log carrega o client_secret", () => {
    for (const x of Object.values(r)) if (x.message) assert.doesNotMatch(x.message, /FAKE-SECRET|TOKEN_/, x.name);
  });

  it("cartão só é oferecido com a chave pública pk_live_ E a liberação ligada", () => {
    const c = r.cardCheckoutConfig;
    assert.deepEqual(c.semNada, { enabled: false, publicKey: null });
    assert.deepEqual(c.semFlag, { enabled: false, publicKey: null });
    assert.deepEqual(c.chaveRuim, { enabled: false, publicKey: null });
    assert.deepEqual(c.ok, { enabled: true, publicKey: "pk_live_abc123" });
  });
});
