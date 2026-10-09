import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { describe, it } from "node:test";
import { mapEvoPayStatus } from "../../src/lib/billing/mappers.ts";
import { buildExternalReference, parseExternalReference } from "../../src/types/billing.ts";

/**
 * Billing/EvoPay: só o que é verificável SEM dinheiro real. A EvoPay não tem sandbox nem token de
 * teste (ver src/lib/evopay/client.ts), então cobrança, webhook e pagamento reais ficam fora daqui.
 */

describe("mapEvoPayStatus", () => {
  it("mapeia os 6 status documentados da EvoPay para o enum interno", () => {
    assert.equal(mapEvoPayStatus("COMPLETED"), "paid");
    assert.equal(mapEvoPayStatus("PENDING"), "pending");
    assert.equal(mapEvoPayStatus("EXPIRED"), "expired");
    assert.equal(mapEvoPayStatus("CANCELED"), "cancelled");
    assert.equal(mapEvoPayStatus("REFUNDED"), "refunded");
  });

  it("WAITING_FOR_REFUND continua 'paid' (o pagamento foi recebido; o estorno ainda não terminou)", () => {
    assert.equal(mapEvoPayStatus("WAITING_FOR_REFUND"), "paid");
  });

  it("status desconhecido NUNCA vira 'paid' (fail closed para 'pending')", () => {
    for (const value of ["", "paid", "SUCCESS", "approved", undefined, null, "completed"]) {
      assert.equal(mapEvoPayStatus(value), "pending", String(value));
    }
  });
});

describe("referência externa do pagamento", () => {
  const id = "0b54f92a-ec10-46cb-9762-0e84d759cce2";

  it("ida e volta", () => {
    assert.equal(buildExternalReference(id), `PRIMEGES:${id}`);
    assert.equal(parseExternalReference(buildExternalReference(id)), id);
  });

  it("recusa prefixo errado, vazio e nulo", () => {
    assert.equal(parseExternalReference(`OUTRO:${id}`), null);
    assert.equal(parseExternalReference("PRIMEGES:"), null);
    assert.equal(parseExternalReference("PRIMEGES"), null);
    assert.equal(parseExternalReference(""), null);
    assert.equal(parseExternalReference(null), null);
  });
});

/**
 * O cliente HTTP importa "server-only", que só carrega com a condição `react-server`. O cenário roda
 * num processo filho com `fetch` simulado e devolve JSON; nenhuma requisição real é feita.
 */
const CLIENT_SCENARIO = `
import { createPixCharge, getPixCharge, EvoPayError } from "./src/lib/evopay/client.ts";
const out = {};
const calls = [];
function mockFetch(handler) { globalThis.fetch = async (url, init) => { calls.push({ url: String(url), method: init?.method, headers: init?.headers }); return handler(url, init); }; }
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

process.env.EVOPAY_API_BASE_URL = "https://evopay.invalid/v1";
process.env.EVOPAY_API_KEY = "chave-de-teste-nao-real";

mockFetch(() => json(200, { id: "tx_1", status: "PENDING", amount: 89 }));
out.ok = await createPixCharge({ amount: 89, externalReference: "PRIMEGES:x" });
out.okCall = calls.at(-1);

await getPixCharge("a b&c=1");
out.getUrl = calls.at(-1).url;

mockFetch(() => json(422, { message: "valor inválido" }));
try { await createPixCharge({ amount: -1 }); out.err422 = "não lançou"; } catch (e) { out.err422 = { isEvo: e instanceof EvoPayError, status: e.status, message: e.message }; }

mockFetch(() => new Response("<html>bad gateway</html>", { status: 502 }));
try { await getPixCharge("x"); out.err502 = "não lançou"; } catch (e) { out.err502 = { isEvo: e instanceof EvoPayError, status: e.status, message: e.message }; }

mockFetch(() => { throw new Error("ECONNRESET"); });
try { await getPixCharge("x"); out.errNet = "não lançou"; } catch (e) { out.errNet = { isEvo: e instanceof EvoPayError, status: e.status, message: e.message }; }

delete process.env.EVOPAY_API_KEY;
mockFetch(() => json(200, {}));
try { await getPixCharge("x"); out.noKey = "não lançou"; } catch (e) { out.noKey = e.message; }
process.env.EVOPAY_API_KEY = "chave-de-teste-nao-real";
delete process.env.EVOPAY_API_BASE_URL;
try { await getPixCharge("x"); out.noBase = "não lançou"; } catch (e) { out.noBase = e.message; }

console.log(JSON.stringify(out));
`;

describe("cliente HTTP da EvoPay (fetch simulado, sem rede)", () => {
  const raw = execFileSync(
    process.execPath,
    ["--no-warnings", "--conditions=react-server", "--experimental-strip-types", "--input-type=module", "-e", CLIENT_SCENARIO],
    { cwd: new URL("../..", import.meta.url), encoding: "utf8" },
  );
  const out = JSON.parse(raw.trim().split("\n").at(-1));

  it("envia a chave no header API-Key e devolve a transação", () => {
    assert.equal(out.ok.id, "tx_1");
    assert.equal(out.okCall.method, "POST");
    assert.equal(out.okCall.headers["API-Key"], "chave-de-teste-nao-real");
    assert.equal(out.okCall.url, "https://evopay.invalid/v1/pix");
  });

  it("consulta por id com query string codificada (sem injeção de parâmetros)", () => {
    assert.equal(out.getUrl, "https://evopay.invalid/v1/pix?id=a+b%26c%3D1");
  });

  it("erro HTTP com corpo JSON vira EvoPayError com status e mensagem do provedor", () => {
    assert.deepEqual(out.err422, { isEvo: true, status: 422, message: "valor inválido" });
  });

  it("erro HTTP com corpo que não é JSON vira EvoPayError genérico com o status", () => {
    assert.deepEqual(out.err502, { isEvo: true, status: 502, message: "EvoPay respondeu 502" });
  });

  it("falha de rede vira EvoPayError status 0", () => {
    assert.equal(out.errNet.isEvo, true);
    assert.equal(out.errNet.status, 0);
  });

  it("a chave nunca aparece em mensagens de erro", () => {
    for (const e of [out.err422, out.err502, out.errNet]) assert.ok(!JSON.stringify(e).includes("chave-de-teste-nao-real"));
  });

  it("sem EVOPAY_API_KEY / EVOPAY_API_BASE_URL falha claramente (não envia requisição anônima)", () => {
    assert.match(out.noKey, /EVOPAY_API_KEY não configurada/);
    assert.match(out.noBase, /EVOPAY_API_BASE_URL não configurada/);
  });
});
