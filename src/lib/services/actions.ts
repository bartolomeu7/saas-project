"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentCompany } from "@/lib/companies/queries";
import { getCurrentUser } from "@/lib/auth/session";
import { serviceSchema } from "@/lib/validations/service";
import { writeAuditLog } from "@/lib/audit/log";
import { AUDIT_ACTIONS } from "@/types/audit";
import type { ActionResult } from "@/lib/auth/actions";

function parseServiceForm(formData: FormData) {
  return serviceSchema.safeParse({
    name: formData.get("name"),
    categoryId: formData.get("categoryId"),
    description: formData.get("description"),
    costPrice: formData.get("costPrice") || "0",
    salePrice: formData.get("salePrice") || "0",
    durationMinutes: formData.get("durationMinutes") || "0",
    status: formData.get("status") || "active",
  });
}

/**
 * Confirma que a categoria informada (se houver) pertence à empresa
 * atual. A foreign key sozinha não garante isso — ela só exige que a
 * categoria exista em algum lugar, não que seja da mesma empresa.
 */
async function assertCategoryBelongsToCompany(
  supabase: ReturnType<typeof createClient>,
  companyId: string,
  categoryId: string | null
): Promise<boolean> {
  if (!categoryId) return true;

  const { data, error } = await supabase
    .from("service_categories")
    .select("id")
    .eq("id", categoryId)
    .eq("company_id", companyId)
    .maybeSingle();

  return !error && !!data;
}

export async function createServiceAction(
  _prevState: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const parsed = parseServiceForm(formData);

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const current = await getCurrentCompany();
  if (!current) {
    return { error: "Nenhuma empresa encontrada para o usuário atual." };
  }

  const supabase = createClient();

  const categoryValid = await assertCategoryBelongsToCompany(
    supabase,
    current.company.id,
    parsed.data.categoryId
  );
  if (!categoryValid) {
    return { error: "Categoria inválida." };
  }

  const { data, error } = await supabase
    .from("services")
    .insert({
      company_id: current.company.id,
      category_id: parsed.data.categoryId,
      name: parsed.data.name,
      description: parsed.data.description,
      cost_price: parsed.data.costPrice,
      sale_price: parsed.data.salePrice,
      duration_minutes: parsed.data.durationMinutes,
      status: parsed.data.status,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { error: "Não foi possível salvar o serviço. Tente novamente." };
  }

  const user = await getCurrentUser();
  await writeAuditLog(supabase, {
    companyId: current.company.id,
    actorUserId: user?.id ?? null,
    entityType: "service",
    entityId: data.id,
    action: AUDIT_ACTIONS.SERVICE_CREATED,
    metadata: { name: parsed.data.name },
  });

  revalidatePath("/app");
  revalidatePath("/app/servicos");
  redirect(`/app/servicos/${data.id}`);
}

export async function updateServiceAction(
  id: string,
  _prevState: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const parsed = parseServiceForm(formData);

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const current = await getCurrentCompany();
  if (!current) {
    return { error: "Nenhuma empresa encontrada para o usuário atual." };
  }

  const supabase = createClient();

  const categoryValid = await assertCategoryBelongsToCompany(
    supabase,
    current.company.id,
    parsed.data.categoryId
  );
  if (!categoryValid) {
    return { error: "Categoria inválida." };
  }

  const { error } = await supabase
    .from("services")
    .update({
      category_id: parsed.data.categoryId,
      name: parsed.data.name,
      description: parsed.data.description,
      cost_price: parsed.data.costPrice,
      sale_price: parsed.data.salePrice,
      duration_minutes: parsed.data.durationMinutes,
      status: parsed.data.status,
    })
    // Redundante com a RLS de propósito (defesa em profundidade).
    .eq("id", id)
    .eq("company_id", current.company.id);

  if (error) {
    return { error: "Não foi possível salvar as alterações. Tente novamente." };
  }

  const user = await getCurrentUser();
  await writeAuditLog(supabase, {
    companyId: current.company.id,
    actorUserId: user?.id ?? null,
    entityType: "service",
    entityId: id,
    action: AUDIT_ACTIONS.SERVICE_UPDATED,
    metadata: { name: parsed.data.name, status: parsed.data.status },
  });

  revalidatePath("/app");
  revalidatePath("/app/servicos");
  revalidatePath(`/app/servicos/${id}`);
  redirect(`/app/servicos/${id}`);
}

export async function deactivateServiceAction(id: string): Promise<void> {
  const current = await getCurrentCompany();
  if (!current) return;

  const supabase = createClient();
  await supabase
    .from("services")
    .update({ status: "inactive" })
    .eq("id", id)
    .eq("company_id", current.company.id);

  const user = await getCurrentUser();
  await writeAuditLog(supabase, {
    companyId: current.company.id,
    actorUserId: user?.id ?? null,
    entityType: "service",
    entityId: id,
    action: AUDIT_ACTIONS.SERVICE_DEACTIVATED,
  });

  revalidatePath("/app");
  revalidatePath("/app/servicos");
  revalidatePath(`/app/servicos/${id}`);
  redirect("/app/servicos");
}

export async function reactivateServiceAction(id: string): Promise<void> {
  const current = await getCurrentCompany();
  if (!current) return;

  const supabase = createClient();
  await supabase
    .from("services")
    .update({ status: "active" })
    .eq("id", id)
    .eq("company_id", current.company.id);

  const user = await getCurrentUser();
  await writeAuditLog(supabase, {
    companyId: current.company.id,
    actorUserId: user?.id ?? null,
    entityType: "service",
    entityId: id,
    action: AUDIT_ACTIONS.SERVICE_ACTIVATED,
  });

  revalidatePath("/app");
  revalidatePath("/app/servicos");
  revalidatePath(`/app/servicos/${id}`);
  redirect(`/app/servicos/${id}`);
}
