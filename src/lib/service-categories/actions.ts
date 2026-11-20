"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createSessionClient } from "@/lib/supabase/server";
import { getCurrentCompany } from "@/lib/companies/queries";
import { getCurrentUser } from "@/lib/auth/session";
import { serviceCategorySchema } from "@/lib/validations/service";
import { nameInUse } from "@/lib/validations/name-in-use";
import { writeAuditLog } from "@/lib/audit/log";
import { AUDIT_ACTIONS } from "@/types/audit";
import type { ActionResult } from "@/lib/auth/actions";

function parseCategoryForm(formData: FormData) {
  return serviceCategorySchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description"),
    status: formData.get("status") || "active",
  });
}

export async function createCategoryAction(
  _prevState: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const parsed = parseCategoryForm(formData);

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const current = await getCurrentCompany();
  if (!current) {
    return { error: "Nenhuma empresa encontrada para o usuário atual." };
  }

  const supabase = await createSessionClient();
  if (await nameInUse(supabase, "service_categories", current.company.id, parsed.data.name)) {
    return { error: "Já existe uma categoria de serviço com esse nome." };
  }

  const { data, error } = await supabase
    .from("service_categories")
    .insert({
      company_id: current.company.id,
      name: parsed.data.name,
      description: parsed.data.description,
      status: parsed.data.status,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { error: "Não foi possível salvar a categoria. Tente novamente." };
  }

  const user = await getCurrentUser();
  await writeAuditLog(supabase, {
    companyId: current.company.id,
    actorUserId: user?.id ?? null,
    entityType: "service_category",
    entityId: data.id,
    action: AUDIT_ACTIONS.SERVICE_CATEGORY_CREATED,
    metadata: { name: parsed.data.name },
  });

  revalidatePath("/app/servicos");
  revalidatePath("/app/servicos/categorias");
  redirect("/app/servicos/categorias");
}

export async function updateCategoryAction(
  id: string,
  _prevState: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const parsed = parseCategoryForm(formData);

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const current = await getCurrentCompany();
  if (!current) {
    return { error: "Nenhuma empresa encontrada para o usuário atual." };
  }

  const supabase = await createSessionClient();
  if (await nameInUse(supabase, "service_categories", current.company.id, parsed.data.name, id)) {
    return { error: "Já existe uma categoria de serviço com esse nome." };
  }

  const { data: updatedRows, error } = await supabase
    .from("service_categories")
    .update({
      name: parsed.data.name,
      description: parsed.data.description,
      status: parsed.data.status,
    })
    .eq("id", id)
    .eq("company_id", current.company.id)
    .select("id");

  if (error) {
    return { error: "Não foi possível salvar as alterações. Tente novamente." };
  }

  if (!updatedRows || updatedRows.length === 0) {
    return { error: "Categoria não encontrada. O cadastro pode ter sido removido ou ser de outra empresa." };
  }

  const user = await getCurrentUser();
  await writeAuditLog(supabase, {
    companyId: current.company.id,
    actorUserId: user?.id ?? null,
    entityType: "service_category",
    entityId: id,
    action: AUDIT_ACTIONS.SERVICE_CATEGORY_UPDATED,
    metadata: { name: parsed.data.name },
  });

  revalidatePath("/app/servicos");
  revalidatePath("/app/servicos/categorias");
  redirect("/app/servicos/categorias");
}

export async function deactivateCategoryAction(id: string): Promise<void> {
  const current = await getCurrentCompany();
  if (!current) return;

  const supabase = await createSessionClient();
  await supabase
    .from("service_categories")
    .update({ status: "inactive" })
    .eq("id", id)
    .eq("company_id", current.company.id);

  const user = await getCurrentUser();
  await writeAuditLog(supabase, {
    companyId: current.company.id,
    actorUserId: user?.id ?? null,
    entityType: "service_category",
    entityId: id,
    action: AUDIT_ACTIONS.SERVICE_CATEGORY_DEACTIVATED,
  });

  revalidatePath("/app/servicos");
  revalidatePath("/app/servicos/categorias");
  redirect("/app/servicos/categorias");
}

export async function reactivateCategoryAction(id: string): Promise<void> {
  const current = await getCurrentCompany();
  if (!current) return;

  const supabase = await createSessionClient();
  await supabase
    .from("service_categories")
    .update({ status: "active" })
    .eq("id", id)
    .eq("company_id", current.company.id);

  const user = await getCurrentUser();
  await writeAuditLog(supabase, {
    companyId: current.company.id,
    actorUserId: user?.id ?? null,
    entityType: "service_category",
    entityId: id,
    action: AUDIT_ACTIONS.SERVICE_CATEGORY_ACTIVATED,
  });

  revalidatePath("/app/servicos");
  revalidatePath("/app/servicos/categorias");
  redirect("/app/servicos/categorias");
}
