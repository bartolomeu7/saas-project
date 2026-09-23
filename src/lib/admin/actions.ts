"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/auth/actions";

export async function setPlatformCompanyStatusAction(
  _prevState: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const companyId = String(formData.get("companyId") ?? "");
  const status = String(formData.get("status") ?? "");

  if (!companyId || !["active", "inactive"].includes(status)) return { error: "Parâmetros inválidos." };

  const supabase = createClient();
  const { error } = await supabase.rpc("set_platform_company_status", {
    p_company_id: companyId,
    p_status: status as "active" | "inactive",
  });

  if (error) return { error: "Não foi possível alterar o status da empresa." };

  revalidatePath("/admin");
  return { success: "Status da empresa atualizado." };
}
