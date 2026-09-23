import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";

interface AdjustProductStockParams {
  supabase: SupabaseClient<Database>;
  productId: string;
  newQuantity: number;
  reason: string;
}

/**
 * Ajuste manual de estoque usando exclusivamente a operação transacional
 * do banco. O RPC valida sessão, empresa, role, bloqueia a linha do produto
 * e grava stock_movements + audit_logs na mesma transação.
 */
export async function adjustProductStock({
  supabase,
  productId,
  newQuantity,
  reason,
}: AdjustProductStockParams): Promise<{ error?: string }> {
  const { error } = await supabase.rpc("adjust_product_stock", {
    p_product_id: productId,
    p_new_quantity: newQuantity,
    p_reason: reason,
  });

  if (error) {
    return {
      error:
        error.message ||
        "Não foi possível ajustar o estoque. Tente novamente.",
    };
  }

  return {};
}
