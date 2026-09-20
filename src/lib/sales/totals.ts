import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";

/** Extraído para seu próprio módulo (sem "use server") na Etapa 1D.6A —
 * recalculateSaleTotals passou a ser usada também por
 * removeLoyaltyRedemptionFromDraftAction (lib/loyalty/actions.ts), e
 * exportá-la de sales/actions.ts (que tem "use server") a transformaria
 * numa Server Action pública desnecessária. Aqui é só uma função de
 * servidor comum, importável por qualquer módulo do lado do servidor.
 */

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Margem para comparação de valores monetários (evita falso-positivo por ponto flutuante). */
export const ROUNDING_TOLERANCE = 0.005;

const RECALCULATE_TOTALS_ERROR =
  "Não foi possível recalcular os totais da venda. Tente novamente.";

/**
 * Dispara sempre que uma alteração de item deixaria o subtotal menor que
 * o desconto de fidelidade já aplicado (sales.loyalty_discount_amount).
 * loyalty_points_redeemed/loyalty_discount_amount nunca são reduzidos por
 * aqui — só removeLoyaltyRedemptionFromDraftAction pode zerá-los. Texto
 * atualizado na Etapa 1D.6C para o wording exato pedido para a UI de
 * "Usar pontos".
 */
export const LOYALTY_DISCOUNT_EXCEEDS_SUBTOTAL_ERROR =
  "Remova o uso de pontos antes de reduzir o valor da venda abaixo do desconto de fidelidade.";

/**
 * Recalcula subtotal/custo/total/margem de uma venda a partir dos itens
 * reais no banco — nunca a partir de um valor vindo do frontend. Único
 * caminho de escrita para esses campos agregados enquanto a venda é
 * rascunho (chamado depois de toda mutação de item, de desconto, ou de
 * remoção de resgate de fidelidade).
 *
 * Desde a Etapa 1D.6A, discount_amount (manual) e loyalty_discount_amount
 * (fidelidade, gravado por public.redeem_loyalty_points /
 * public.undo_loyalty_redemption_for_draft_sale) são somas INDEPENDENTES
 * sobre o mesmo subtotal — nunca um sobrescreve o outro:
 *   total_amount = subtotal - discount_amount - loyalty_discount_amount
 * Se o novo subtotal ficar menor que loyalty_discount_amount, a operação é
 * inteiramente rejeitada (nada é persistido) em vez de reduzir o desconto
 * de fidelidade silenciosamente — só o desconto MANUAL é clampado quando
 * necessário para caber no subtotal, exatamente como antes desta etapa.
 *
 * Cada chamada ao Supabase tem o `error` checado explicitamente: se
 * qualquer uma falhar, interrompe e devolve erro em vez de seguir com
 * dado parcial/zerado (ex.: `items` vindo `null` por causa de um erro
 * silenciosamente calcularia subtotal 0 e sobrescreveria o total real
 * da venda).
 */
export async function recalculateSaleTotals(
  supabase: SupabaseClient<Database>,
  saleId: string,
  companyId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: items, error: itemsError } = await supabase
    .from("sale_items")
    .select("total_amount, quantity, unit_cost")
    .eq("sale_id", saleId);

  if (itemsError) {
    return { ok: false, error: RECALCULATE_TOTALS_ERROR };
  }

  const rows = items ?? [];
  const subtotal = round2(rows.reduce((sum, row) => sum + Number(row.total_amount), 0));
  const totalCost = round2(
    rows.reduce((sum, row) => sum + Number(row.quantity) * Number(row.unit_cost), 0)
  );

  const { data: sale, error: saleError } = await supabase
    .from("sales")
    .select("discount_amount, loyalty_discount_amount")
    .eq("id", saleId)
    .single();

  if (saleError || !sale) {
    return { ok: false, error: RECALCULATE_TOTALS_ERROR };
  }

  const loyaltyDiscountAmount = Number(sale.loyalty_discount_amount);

  if (loyaltyDiscountAmount > subtotal + ROUNDING_TOLERANCE) {
    return { ok: false, error: LOYALTY_DISCOUNT_EXCEEDS_SUBTOTAL_ERROR };
  }

  const discountAmount = Math.min(
    Number(sale.discount_amount),
    round2(subtotal - loyaltyDiscountAmount)
  );
  const totalAmount = Math.max(0, round2(subtotal - discountAmount - loyaltyDiscountAmount));
  const estimatedMargin = round2(totalAmount - totalCost);

  const { error: updateError } = await supabase
    .from("sales")
    .update({
      subtotal,
      discount_amount: discountAmount,
      total_amount: totalAmount,
      total_cost: totalCost,
      estimated_margin: estimatedMargin,
    })
    .eq("id", saleId)
    .eq("company_id", companyId);

  if (updateError) {
    return { ok: false, error: RECALCULATE_TOTALS_ERROR };
  }

  return { ok: true };
}
