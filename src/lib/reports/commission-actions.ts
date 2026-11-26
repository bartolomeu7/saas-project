"use server";

import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/lib/auth/actions";
import { getCurrentCompany } from "@/lib/companies/queries";
import { can } from "@/lib/permissions/matrix";
import { isRateDate, parsePercentInput } from "@/lib/reports/commission";
import { createSessionClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DENIED = "Apenas dono ou administrador podem alterar a comissão.";

const field = (formData: FormData, name: string) => {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
};

async function allowed() {
  const current = await getCurrentCompany();
  return Boolean(current && can(current.role, "reports.view"));
}

/** Percentual de um profissional a partir de uma data. O banco confere papel e empresa de novo. */
export async function setCommissionRateAction(_prevState: ActionResult, formData: FormData): Promise<ActionResult> {
  const professionalId = field(formData, "professionalId");
  const from = field(formData, "from");
  const parsed = parsePercentInput(field(formData, "percent"));
  if (!UUID.test(professionalId)) return { error: "Profissional inválido." };
  if (!parsed.ok) return { error: parsed.error };
  if (!isRateDate(from)) return { error: "Informe uma data válida." };
  if (!(await allowed())) return { error: DENIED };

  const supabase = await createSessionClient();
  const { error } = await supabase.rpc("set_commission_rate", { p_professional_id: professionalId, p_percent: parsed.percent, p_from: from });
  if (error) {
    console.error("[comissao] falha ao salvar o percentual:", error.message);
    return { error: "Não foi possível salvar o percentual. Confira a data e tente novamente." };
  }
  revalidatePath("/app/relatorios");
  return { success: "Percentual salvo." };
}

/** Escolhe quem fez um serviço vendido; vazio volta a valer o atendimento da agenda. */
export async function setItemProfessionalAction(_prevState: ActionResult, formData: FormData): Promise<ActionResult> {
  const itemId = field(formData, "itemId");
  const professionalId = field(formData, "professionalId");
  if (!UUID.test(itemId) || (professionalId && !UUID.test(professionalId))) return { error: "Escolha inválida." };
  if (!(await allowed())) return { error: DENIED };

  const supabase = await createSessionClient();
  const { error } = await supabase.rpc("set_sale_item_professional", {
    p_sale_item_id: itemId,
    // o banco aceita vazio (volta à agenda); o tipo gerado não declara o nulo
    p_professional_id: (professionalId || null) as unknown as string,
  });
  if (error) {
    console.error("[comissao] falha ao salvar o profissional:", error.message);
    return { error: "Não foi possível salvar. Tente novamente." };
  }
  revalidatePath("/app/relatorios");
  return { success: "Salvo." };
}
