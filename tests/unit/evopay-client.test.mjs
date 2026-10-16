import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { describe, it, before } from "node:test";
import { fileURLToPath } from "node:url";

/**
 * Cliente HTTP da EvoPay com `fetch` SIMULADO (sem rede, sem dinheiro). Cobre o que dá para provar sem uma cobrança real:
 * método/URL/cabeçalho, timeout, corpo ilegível, erros 4xx/5xx, falha de rede, configuração ausente e vazamento de chave.
 * Isto NÃO verifica a integração real: respostas aqui são dublês baseados na documentação.
 */
const probe = fileURLToPath(new URL("./helpers/evopay-client-probe.mjs", import.meta.url));
let r = {};
describe("cliente EvoPay (fetch simulado)", () => {
  before(() => {
    const child = spawnSync(process.execPath, ["--no-warnings", "--experimental-strip-types", "--conditions=react-server", probe], { encoding: "utf8" });
    assert.equal(child.status, 0, `sonda falhou: ${child.stderr}`);
    const list = JSON.parse(child.stdout);
    r = Object.fromEntries(list.map((x) => [x.name, x]));
  });

  it("o timeout por chamada é finito e curto (10 s) e toda chamada leva um AbortSignal ainda não abortado", () => {
    assert.equal(r.constants.timeoutMs, 10_000);
    for (const k of ["create ok", "get ok", "401 message"]) {
      assert.equal(r[k].call.hasSignal, true, k);
      assert.equal(r[k].call.signalAborted, false, k);
    }
  });

  it("POST /pix: método, URL base + /pix, cabeçalho API-Key e corpo com amount numérico em reais", () => {
    const c = r["create ok"].call;
    assert.equal(c.method, "POST");
    assert.equal(c.url, "https://evopay.invalid/v1/pix");
    assert.equal(c.hasKey, true);
    assert.equal(c.body.amount, 89);
    assert.equal(c.body.externalReference, "PRIMEGES:x");
    assert.equal(r["create ok"].value.id, "cmq47c6un0c05ufvvo58ohpqk");
  });

  it("GET /pix?id=: id vai codificado na query (sem injeção de parâmetros)", () => {
    const c = r["get ok"].call;
    assert.equal(c.method, "GET");
    assert.equal(c.url, "https://evopay.invalid/v1/pix?id=abc+def%26x%3D1");
  });

  it("erro 401/400/404: EvoPayError com o status HTTP e a mensagem do corpo ({message} ou {error})", () => {
    assert.equal(r["401 message"].isEvoPayError, true);
    assert.equal(r["401 message"].status, 401);
    assert.equal(r["401 message"].message, "Token inválido");
    assert.equal(r["400 error field"].status, 400);
    assert.equal(r["400 error field"].message, "Depósito bloqueado");
    assert.equal(r["404"].status, 404);
  });

  it("5xx com corpo não-JSON: mensagem genérica com o status, nunca o HTML", () => {
    assert.equal(r["500 html"].isEvoPayError, true);
    assert.equal(r["500 html"].status, 500);
    assert.equal(r["500 html"].message, "EvoPay respondeu 500");
  });

  it("2xx com corpo ilegível NÃO vira sucesso: EvoPayError (antes lançava SyntaxError)", () => {
    assert.equal(r["200 not json"].ok, false);
    assert.equal(r["200 not json"].isEvoPayError, true);
    assert.equal(r["200 not json"].message, "Resposta inválida da EvoPay.");
  });

  it("falha de rede, timeout e abort viram EvoPayError com status 0 (provedor indisponível)", () => {
    for (const k of ["network failure", "timeout", "abort"]) {
      assert.equal(r[k].isEvoPayError, true, k);
      assert.equal(r[k].status, 0, k);
    }
    assert.match(r["timeout"].message, /Tempo esgotado/);
    assert.match(r["network failure"].message, /Falha de rede/);
  });

  it("configuração ausente falha fechado, com mensagem sem valores", () => {
    assert.equal(r["missing key"].ok, false);
    assert.match(r["missing key"].message, /EVOPAY_API_KEY/);
    assert.equal(r["missing base url"].ok, false);
    assert.match(r["missing base url"].message, /EVOPAY_API_BASE_URL/);
    assert.equal(r["missing key"].call, null, "sem chave nenhuma requisição sai");
  });

  it("nenhuma mensagem de erro contém a chave de API", () => {
    for (const x of Object.values(r)) assert.ok(!String(x.message ?? "").includes("FAKE-KEY-NOT-REAL"), x.name);
  });
});
