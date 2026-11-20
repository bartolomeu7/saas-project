import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loyaltyDiscountRuleBroken, loyaltyPercentError } from "../../src/lib/sales/loyalty-cap.ts";

test("sem desconto de pontos nada é barrado", () => {
  assert.equal(loyaltyDiscountRuleBroken({ projectedSubtotal: 0, loyaltyDiscount: 0, maxRedeemPercent: 30 }), null);
});

test("subtotal abaixo do desconto de pontos é barrado antes de qualquer percentual", () => {
  assert.equal(loyaltyDiscountRuleBroken({ projectedSubtotal: 4.99, loyaltyDiscount: 5, maxRedeemPercent: 30 }), "exceeds_subtotal");
  assert.equal(loyaltyDiscountRuleBroken({ projectedSubtotal: 4.99, loyaltyDiscount: 5, maxRedeemPercent: null }), "exceeds_subtotal");
});

test("caso real (20/11): R$ 5 em pontos numa venda que caiu de R$ 50 para R$ 10 passa de 30%", () => {
  assert.equal(loyaltyDiscountRuleBroken({ projectedSubtotal: 50, loyaltyDiscount: 5, maxRedeemPercent: 30 }), null);
  assert.equal(loyaltyDiscountRuleBroken({ projectedSubtotal: 10, loyaltyDiscount: 5, maxRedeemPercent: 30 }), "exceeds_percent");
  assert.equal(loyaltyDiscountRuleBroken({ projectedSubtotal: 16.67, loyaltyDiscount: 5, maxRedeemPercent: 30 }), null);
});

test("sem limite percentual configurado só vale o subtotal; 100% permite o desconto igual ao subtotal", () => {
  assert.equal(loyaltyDiscountRuleBroken({ projectedSubtotal: 10, loyaltyDiscount: 5, maxRedeemPercent: null }), null);
  assert.equal(loyaltyDiscountRuleBroken({ projectedSubtotal: 5, loyaltyDiscount: 5, maxRedeemPercent: 100 }), null);
});

test("mensagem cita o percentual configurado", () => {
  assert.match(loyaltyPercentError(30), /30%/);
});

test("alterar quantidade e remover item conferem o limite percentual", () => {
  const actions = readFileSync("src/lib/sales/actions.ts", "utf8");
  assert.equal((actions.match(/loyaltyDiscountRuleBroken\(/g) ?? []).length, 2);
  assert.ok(actions.includes("loyaltyPercentError"));
});

test("cancelar venda exige motivo com pelo menos 3 letras e o aviso do diálogo cita os pontos", () => {
  assert.match(readFileSync("src/lib/validations/sale.ts", "utf8"), /value\.length >= 3/);
  assert.match(readFileSync("src/components/app/cancel-sale-button.tsx", "utf8"), /pontos de fidelidade/);
});
