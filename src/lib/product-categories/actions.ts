"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentCompany } from "@/lib/companies/queries";
import { getCurrentUser } from "@/lib/auth/session";
import { productCategorySchema } from "@/lib/validations/product";
import { writeAuditLog } from "@/lib/audit/log";
import { AUDIT_ACTIONS } from "@/types/audit";
import type { ActionResult } from "@/lib/auth/actions";

function parseCategoryForm(formData: FormData) {
  return productCategorySchema.safeParse({
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

  const supabase = createClient();
  const { data, error } = await supabase
    .from("product_categories")
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
    entityType: "product_category",
    entityId: data.id,
    action: AUDIT_ACTIONS.CATEGORY_CREATED,
    metadata: { name: parsed.data.name },
  });

  revalidatePath("/app/produtos");
  revalidatePath("/app/produtos/categorias");
  redirect("/app/produtos/categorias");
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

  const supabase = createClient();
  const { error } = await supabase
    .from("product_categories")
    .update({
      name: parsed.data.name,
      description: parsed.data.description,
      status: parsed.data.status,
    })
    .eq("id", id)
    .eq("company_id", current.company.id);

  if (error) {
    return { error: "Não foi possível salvar as alterações. Tente novamente." };
  }

  const user = await getCurrentUser();
  await writeAuditLog(supabase, {
    companyId: current.company.id,
    actorUserId: user?.id ?? null,
    entityType: "product_category",
    entityId: id,
    action: AUDIT_ACTIONS.CATEGORY_UPDATED,
    metadata: { name: parsed.data.name },
  });

  revalidatePath("/app/produtos");
  revalidatePath("/app/produtos/categorias");
  redirect("/app/produtos/categorias");
}

export async function deactivateCategoryAction(id: string): Promise<void> {
  const current = await getCurrentCompany();
  if (!current) return;

  const supabase = createClient();
  await supabase
    .from("product_categories")
    .update({ status: "inactive" })
    .eq("id", id)
    .eq("company_id", current.company.id);

  const user = await getCurrentUser();
  await writeAuditLog(supabase, {
    companyId: current.company.id,
    actorUserId: user?.id ?? null,
    entityType: "product_category",
    entityId: id,
    action: AUDIT_ACTIONS.CATEGORY_DEACTIVATED,
  });

  revalidatePath("/app/produtos");
  revalidatePath("/app/produtos/categorias");
  redirect("/app/produtos/categorias");
}

export async function reactivateCategoryAction(id: string): Promise<void> {
  const current = await getCurrentCompany();
  if (!current) return;

  const supabase = createClient();
  await supabase
    .from("product_categories")
    .update({ status: "active" })
    .eq("id", id)
    .eq("company_id", current.company.id);

  const user = await getCurrentUser();
  await writeAuditLog(supabase, {
    companyId: current.company.id,
    actorUserId: user?.id ?? null,
    entityType: "product_category",
    entityId: id,
    action: AUDIT_ACTIONS.CATEGORY_ACTIVATED,
  });

  revalidatePath("/app/produtos");
  revalidatePath("/app/produtos/categorias");
  redirect("/app/produtos/categorias");
}
