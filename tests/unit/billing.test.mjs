import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildExternalReference, parseExternalReference } from "../../src/types/billing.ts";
import { amountsMatch, rejectionMessage, toCents } from "../../src/lib/billing/amount.ts";

/**
 * Billing: só o que é verificável SEM dinheiro real (referência externa e comparação de valores). O contrato da SyncPay
 * (webhook, status, cliente HTTP) tem testes próprios: syncpay-webhook.test.mjs e syncpay-client.test.mjs.
 */

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

describe("comparação de valores (centavos inteiros)", () => {
  it("converte para centavos sem erro de ponto flutuante", () => {
    assert.equal(toCents(89), 8900);
    assert.equal(toCents("89"), 8900);
    assert.equal(toCents("89.00"), 8900);
    assert.equal(toCents("89,00"), 8900);
    assert.equal(toCents(0.1 + 0.2), 30);
    assert.equal(toCents(19.9), 1990);
    assert.equal(toCents(0), 0);
  });

  it("valor ausente, ilegível, negativo ou infinito é ambíguo (null)", () => {
    for (const bad of [null, undefined, "", "   ", "abc", NaN, Infinity, -1, "-5", {}, [], true, false]) assert.equal(toCents(bad), null, String(bad));
  });

  it("amountsMatch só aceita igualdade ao centavo", () => {
    assert.equal(amountsMatch("89.00", 89), true);
    assert.equal(amountsMatch(89, 89.0), true);
    assert.equal(amountsMatch(89, 88.99), false);
    assert.equal(amountsMatch(89, 89.01), false);
    assert.equal(amountsMatch(89, 1), false);
    assert.equal(amountsMatch(89, "8900"), false, "centavos NÃO são reais");
  });

  it("nunca considera igual quando um dos lados é ambíguo", () => {
    assert.equal(amountsMatch(89, null), false);
    assert.equal(amountsMatch(null, null), false);
    assert.equal(amountsMatch(undefined, undefined), false);
    assert.equal(amountsMatch(89, "abc"), false);
  });

  it("mensagens de rejeição não vazam dados e têm fallback", () => {
    for (const code of ["AMOUNT_MISMATCH", "AMOUNT_MISSING", "NO_PROVIDER_CHARGE", "PLAN_NOT_BILLABLE", "EVENT_PAYMENT_MISMATCH", "REFUNDED_TERMINAL"]) {
      const text = rejectionMessage(code);
      assert.ok(text.length > 10 && !/\d{2,}/.test(text), code);
    }
    assert.match(rejectionMessage("CODIGO_NOVO"), /recusada/);
    assert.match(rejectionMessage(null), /recusada/);
  });
});
