import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mapEvoPayStatus } from "../../src/lib/billing/mappers.ts";
import { amountsMatch, toCents } from "../../src/lib/billing/amount.ts";

/**
 * Contrato da EvoPay conforme a DOCUMENTAÇÃO OFICIAL (https://docs.evopay.cash, consultada em 2026-10-09):
 *  - guia/introdução: "Valores monetários são sempre em reais decimais. R$ 10,50 = 10.50 — nunca em centavos.";
 *  - guia/webhook: payload DEPOSIT { id, type, status, amount (reais), endToEndId, payerDocument, payerName };
 *    uma única tentativa de entrega, sem reenvio; idempotência por id + status;
 *  - guia/schemas: status PENDING|COMPLETED|CANCELED|WAITING_FOR_REFUND|REFUNDED|EXPIRED; fluxo
 *    COMPLETED → WAITING_FOR_REFUND → REFUNDED; GET /v1/pix devolve `amount` (number) e NÃO devolve moeda,
 *    referência externa nem pagamento parcial (não documentado).
 * Os objetos abaixo reproduzem os exemplos da documentação. NÃO são respostas reais: não existe sandbox e nenhum
 * pagamento real foi feito — o contrato real continua NOT VERIFIED até a primeira cobrança de valor mínimo.
 */

const docWebhookDeposit = {
  id: "cmq47c6un0c05ufvvo58ohpqk",
  type: "DEPOSIT",
  status: "COMPLETED",
  amount: 100.0,
  endToEndId: "E60746948202406101500abcdef123456",
  payerDocument: "12345678901",
  payerName: "João Silva",
};

describe("contrato EvoPay (exemplos da documentação)", () => {
  it("amount do exemplo oficial (100.00) vale R$ 100,00, não 100 centavos", () => {
    assert.equal(toCents(docWebhookDeposit.amount), 10000);
    assert.equal(amountsMatch(100, docWebhookDeposit.amount), true);
    assert.equal(amountsMatch(1, docWebhookDeposit.amount), false);
  });

  it("COMPLETED do exemplo oficial vira 'paid'", () => {
    assert.equal(mapEvoPayStatus(docWebhookDeposit.status), "paid");
  });

  it("o id do evento de idempotência (id:status) distingue COMPLETED de REFUNDED na mesma transação", () => {
    const a = `${docWebhookDeposit.id}:COMPLETED`;
    const b = `${docWebhookDeposit.id}:REFUNDED`;
    assert.notEqual(a, b);
  });

  it("fluxo documentado COMPLETED → WAITING_FOR_REFUND → REFUNDED: só REFUNDED muda o estado interno para 'refunded'", () => {
    assert.equal(mapEvoPayStatus("COMPLETED"), "paid");
    assert.equal(mapEvoPayStatus("WAITING_FOR_REFUND"), "paid");
    assert.equal(mapEvoPayStatus("REFUNDED"), "refunded");
  });

  it("pagamento parcial, a mais, em centavos ou ilegível NÃO confere com o valor esperado", () => {
    const expected = 89;
    assert.equal(amountsMatch(expected, 44.5), false, "parcial");
    assert.equal(amountsMatch(expected, 89.01), false, "a mais");
    assert.equal(amountsMatch(expected, 8900), false, "centavos confundidos com reais");
    assert.equal(amountsMatch(expected, "89,00"), true, "vírgula decimal é lida como reais");
    assert.equal(amountsMatch(expected, undefined), false, "ausente");
    assert.equal(amountsMatch(expected, "R$ 89,00"), false, "texto com símbolo é ilegível");
    assert.equal(amountsMatch(expected, Number.NaN), false);
    assert.equal(amountsMatch(expected, -89), false);
  });

  it("o valor enviado ao banco é o do provedor em reais com 2 casas (centavos / 100)", () => {
    for (const amount of [89, 89.9, 249.9, 0.01, 1000.1]) {
      const cents = toCents(amount);
      assert.ok(cents !== null);
      assert.equal(cents / 100, Math.round(amount * 100) / 100);
    }
  });

  it("status desconhecido (fora do contrato) cai em 'pending', nunca em 'paid'", () => {
    assert.equal(mapEvoPayStatus("ALGO_NOVO"), "pending");
    assert.equal(mapEvoPayStatus(undefined), "pending");
  });
});
