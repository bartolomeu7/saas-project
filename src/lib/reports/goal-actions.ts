"use server";

import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/lib/auth/actions";
import { getCurrentCompany } from "@/lib/companies/queries";
import { can } from "@/lib/permissions/matrix";
import { parseGoalInput } from "@/lib/reports/goal";
import { createSessionClient } from "@/lib/supabase/server";

/** Define (ou remove, com o campo vazio) a meta de faturamento. O banco confere o papel de novo. */
export async function setRevenueGoalAction(_prevState: ActionResult, formData: FormData): Promise<ActionResult> {
  const typed = formData.get("target");
  const parsed = parseGoalInput(typeof typed === "string" ? typed : "");
  if (!parsed.ok) return { error: parsed.error };

  const current = await getCurrentCompany();
  if (!current) return { error: "Nenhuma empresa encontrada." };
  if (!can(current.role, "reports.view")) return { error: "Apenas dono ou administrador podem definir a meta." };

  const supabase = await createSessionClient();
  const { error } = await supabase.rpc("set_revenue_goal", { p_company_id: current.company.id, p_target: parsed.target });
  if (error) {
    console.error("[meta] falha ao salvar:", error.message);
    return { error: "Não foi possível salvar a meta. Tente novamente." };
  }

  revalidatePath("/app");
  revalidatePath("/app/relatorios");
  return { success: parsed.target > 0 ? "Meta salva." : "Meta removida." };
}
