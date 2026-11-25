import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { buildExternalReference, formatOrderCode, parseExternalReference } from "../../src/types/billing.ts";
import { paymentTicketSchema } from "../../src/lib/validations/billing.ts";
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

describe("botão \"Já paguei\"", () => {
  it("avisa quando a consulta confirma que o pagamento continua pendente", () => {
    const source = readFileSync(new URL("../../src/components/app/payment-status-poller.tsx", import.meta.url), "utf8");
    assert.match(source, /setCheckedPending\(result\.status === "pending"\)/);
    assert.match(source, /role="status"/);
    assert.match(source, /continua pendente/);
  });
});

describe("ordem de pagamento e chamado", () => {
  const paymentId = "82938e7a-b47e-4291-b9d1-29c01345c6a7";

  it("mostra o código com seis dígitos sem cortar números grandes", () => {
    assert.equal(formatOrderCode(7), "OP-000007");
    assert.equal(formatOrderCode(12345678), "OP-12345678");
  });

  it("valida assunto, tamanho da mensagem e o id da ordem", () => {
    assert.equal(paymentTicketSchema.safeParse({ paymentId, reason: "paid_not_released", message: "Paguei e não liberou." }).success, true);
    for (const bad of [
      { paymentId, reason: "hack", message: "mensagem com tamanho ok" },
      { paymentId, reason: "other", message: "   curta   " },
      { paymentId, reason: "other", message: "a".repeat(1001) },
      { paymentId: "1", reason: "other", message: "mensagem com tamanho ok" },
    ]) assert.equal(paymentTicketSchema.safeParse(bad).success, false, JSON.stringify(bad).slice(0, 60));
  });

  it("a ordem e o suporte aparecem na tela do pagamento e o histórico leva até elas", () => {
    const page = readFileSync(new URL("../../src/app/(app)/app/assinatura/pagamento/[id]/page.tsx", import.meta.url), "utf8");
    assert.match(page, /Ordem de pagamento/);
    assert.match(page, /<PaymentSupport /);
    const history = readFileSync(new URL("../../src/app/(app)/app/assinatura/historico/page.tsx", import.meta.url), "utf8");
    assert.match(history, /Ver ordem/);
  });
});
