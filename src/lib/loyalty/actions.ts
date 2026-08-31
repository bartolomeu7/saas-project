"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentCompany } from "@/lib/companies/queries";
import type { ActionResult } from "@/lib/auth/actions";

/**
 * Resgata pontos de fidelidade como desconto numa venda em rascunho.
 * Toda validação (saldo, mínimo, limite percentual, FIFO) acontece dentro
 * de public.redeem_loyalty_points — esta Server Action só repassa a
 * chamada e traduz o erro do Postgres para o usuário.
 */
export async function redeemLoyaltyPointsAction(
  saleId: string,
  _prevState: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const points = Number(formData.get("points"));

  if (!Number.isInteger(points) || points <= 0) {
    return { error: "Informe uma quantidade de pontos válida." };
  }

  const current = await getCurrentCompany();
  if (!current) {
    return { error: "Nenhuma empresa encontrada para o usuário atual." };
  }

  const supabase = createClient();
  const { error } = await supabase.rpc("redeem_loyalty_points", {
    p_sale_id: saleId,
    p_points: points,
  });

  if (error) {
    return { error: error.message || "Não foi possível usar os pontos de fidelidade." };
  }

  revalidatePath(`/app/vendas/${saleId}`);
  revalidatePath("/app/vendas/nova");
  return { success: "Pontos aplicados como desconto." };
}

/**
 * Ajuste manual de pontos — só owner/admin (checado dentro de
 * public.adjust_loyalty_points, já que a função é SECURITY DEFINER e
 * ignora RLS). Motivo obrigatório.
 */
export async function adjustLoyaltyPointsAction(
  customerId: string,
  _prevState: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const points = Number(formData.get("points"));
  const reason = (formData.get("reason") as string | null)?.trim() || "";

  if (!Number.isInteger(points) || points === 0) {
    return { error: "Informe uma quantidade de pontos diferente de zero." };
  }
  if (!reason) {
    return { error: "Informe o motivo do ajuste." };
  }

  const current = await getCurrentCompany();
  if (!current) {
    return { error: "Nenhuma empresa encontrada para o usuário atual." };
  }

  const supabase = createClient();
  const { error } = await supabase.rpc("adjust_loyalty_points", {
    p_customer_id: customerId,
    p_points: points,
    p_reason: reason,
  });

  if (error) {
    return { error: error.message || "Não foi possível ajustar os pontos." };
  }

  revalidatePath(`/app/clientes/${customerId}`);
  return { success: "Pontos ajustados." };
}
