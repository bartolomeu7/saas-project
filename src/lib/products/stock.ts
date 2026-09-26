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
 * Único caminho de escrita manual em `products.stock_quantity`. Delega à RPC
 * `adjust_product_stock` (SECURITY DEFINER), que valida papel (owner/admin),
 * trava a linha, grava `stock_movements` e `audit_logs` na mesma transação.
 *
 * O papel `authenticated` não tem privilégio de UPDATE na coluna
 * `stock_quantity` (migration 041) — um UPDATE direto é rejeitado pelo banco.
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
    return { error: error.message || "Não foi possível ajustar o estoque. Tente novamente." };
  }

  return {};
}
