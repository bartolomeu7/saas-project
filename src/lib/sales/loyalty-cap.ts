/** Regras puras do desconto de pontos numa venda em rascunho (sem acesso ao banco, testável isoladamente). */

const TOLERANCE = 0.005;
const cents = (value: number) => Math.round(value * 100) / 100;

/**
 * O desconto de pontos tem DOIS limites: nunca passar do subtotal e nunca passar de X% do valor da venda
 * (loyalty_settings.max_redeem_percent_per_sale, conferido pelo banco só na hora de usar os pontos).
 * Reduzir a quantidade ou remover um item depois de usar os pontos podia deixar a venda abaixo do segundo
 * limite sem aviso (ex.: 100 pontos = R$ 5 usados numa venda de R$ 50 e a venda cai para R$ 10: 50% de desconto
 * por pontos com limite de 30%). Esta checagem pura vale para qualquer alteração que mude o subtotal.
 */
export function loyaltyDiscountRuleBroken(input: {
  projectedSubtotal: number;
  loyaltyDiscount: number;
  maxRedeemPercent: number | null;
}): "exceeds_subtotal" | "exceeds_percent" | null {
  const { projectedSubtotal, loyaltyDiscount, maxRedeemPercent } = input;
  if (loyaltyDiscount <= 0) return null;
  if (projectedSubtotal < loyaltyDiscount - TOLERANCE) return "exceeds_subtotal";
  if (maxRedeemPercent !== null && maxRedeemPercent !== undefined) {
    const maxDiscount = cents((projectedSubtotal * maxRedeemPercent) / 100);
    if (loyaltyDiscount > maxDiscount + TOLERANCE) return "exceeds_percent";
  }
  return null;
}

export function loyaltyPercentError(maxRedeemPercent: number | null): string {
  return `Remova o uso de pontos antes de reduzir a venda: o desconto de pontos não pode passar de ${maxRedeemPercent ?? 0}% do valor da venda.`;
}
