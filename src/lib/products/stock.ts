import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import { writeAuditLog } from "@/lib/audit/log";
import { AUDIT_ACTIONS } from "@/types/audit";

interface AdjustProductStockParams {
  supabase: SupabaseClient<Database>;
  companyId: string;
  productId: string;
  newQuantity: number;
  reason: string;
  actorUserId: string | null;
}

/**
 * Camada de serviço para qualquer ajuste de estoque — usada hoje só
 * pelo ajuste manual, mas pensada para ser o único caminho de escrita
 * em `products.stock_quantity` quando Vendas/Compras/Estoque avançado
 * existirem (saída por venda, entrada por compra, etc.), em vez de cada
 * módulo futuro alterar a coluna diretamente. Toda chamada grava em
 * audit_logs (estoque anterior, novo, diferença, motivo).
 */
export async function adjustProductStock({
  supabase,
  companyId,
  productId,
  newQuantity,
  reason,
  actorUserId,
}: AdjustProductStockParams): Promise<{ error?: string }> {
  const { data: current, error: fetchError } = await supabase
    .from("products")
    .select("stock_quantity")
    .eq("id", productId)
    .eq("company_id", companyId)
    .maybeSingle();

  if (fetchError || !current) {
    return { error: "Produto não encontrado." };
  }

  const previousStock = current.stock_quantity;

  const { error: updateError } = await supabase
    .from("products")
    .update({ stock_quantity: newQuantity })
    .eq("id", productId)
    .eq("company_id", companyId);

  if (updateError) {
    return { error: "Não foi possível ajustar o estoque. Tente novamente." };
  }

  await writeAuditLog(supabase, {
    companyId,
    actorUserId,
    entityType: "product",
    entityId: productId,
    action: AUDIT_ACTIONS.PRODUCT_STOCK_ADJUSTED,
    metadata: {
      previousStock,
      newStock: newQuantity,
      difference: newQuantity - previousStock,
      reason,
    },
  });

  return {};
}
