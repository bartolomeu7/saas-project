"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentCompany } from "@/lib/companies/queries";
import { getCurrentUser } from "@/lib/auth/session";
import { productSchema, stockAdjustmentSchema } from "@/lib/validations/product";
import { writeAuditLog } from "@/lib/audit/log";
import { adjustProductStock } from "@/lib/products/stock";
import { AUDIT_ACTIONS } from "@/types/audit";
import type { ActionResult } from "@/lib/auth/actions";

function parseProductForm(formData: FormData) {
  return productSchema.safeParse({
    name: formData.get("name"),
    categoryId: formData.get("categoryId"),
    sku: formData.get("sku"),
    barcode: formData.get("barcode"),
    description: formData.get("description"),
    unit: formData.get("unit") || "un",
    costPrice: formData.get("costPrice") || "0",
    salePrice: formData.get("salePrice") || "0",
    stockQuantity: formData.get("stockQuantity") || "0",
    minimumStock: formData.get("minimumStock") || "0",
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
    .from("product_categories")
    .select("id")
    .eq("id", categoryId)
    .eq("company_id", companyId)
    .maybeSingle();

  return !error && !!data;
}

export async function createProductAction(
  _prevState: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const parsed = parseProductForm(formData);

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
    .from("products")
    .insert({
      company_id: current.company.id,
      category_id: parsed.data.categoryId,
      name: parsed.data.name,
      sku: parsed.data.sku,
      barcode: parsed.data.barcode,
      description: parsed.data.description,
      unit: parsed.data.unit,
      cost_price: parsed.data.costPrice,
      sale_price: parsed.data.salePrice,
      stock_quantity: parsed.data.stockQuantity,
      minimum_stock: parsed.data.minimumStock,
      status: parsed.data.status,
    })
    .select("id")
    .single();

  if (error || !data) {
    if (error?.code === "23505") {
      return { error: "Já existe um produto com esse SKU ou código de barras." };
    }
    return { error: "Não foi possível salvar o produto. Tente novamente." };
  }

  const user = await getCurrentUser();
  await writeAuditLog(supabase, {
    companyId: current.company.id,
    actorUserId: user?.id ?? null,
    entityType: "product",
    entityId: data.id,
    action: AUDIT_ACTIONS.PRODUCT_CREATED,
    metadata: { name: parsed.data.name },
  });

  revalidatePath("/app");
  revalidatePath("/app/produtos");
  redirect(`/app/produtos/${data.id}`);
}

export async function updateProductAction(
  id: string,
  _prevState: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const parsed = parseProductForm(formData);

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
    .from("products")
    .update({
      category_id: parsed.data.categoryId,
      name: parsed.data.name,
      sku: parsed.data.sku,
      barcode: parsed.data.barcode,
      description: parsed.data.description,
      unit: parsed.data.unit,
      cost_price: parsed.data.costPrice,
      sale_price: parsed.data.salePrice,
      stock_quantity: parsed.data.stockQuantity,
      minimum_stock: parsed.data.minimumStock,
      status: parsed.data.status,
    })
    // Redundante com a RLS de propósito (defesa em profundidade).
    .eq("id", id)
    .eq("company_id", current.company.id);

  if (error) {
    if (error.code === "23505") {
      return { error: "Já existe um produto com esse SKU ou código de barras." };
    }
    return { error: "Não foi possível salvar as alterações. Tente novamente." };
  }

  const user = await getCurrentUser();
  await writeAuditLog(supabase, {
    companyId: current.company.id,
    actorUserId: user?.id ?? null,
    entityType: "product",
    entityId: id,
    action: AUDIT_ACTIONS.PRODUCT_UPDATED,
    metadata: { name: parsed.data.name, status: parsed.data.status },
  });

  revalidatePath("/app");
  revalidatePath("/app/produtos");
  revalidatePath(`/app/produtos/${id}`);
  redirect(`/app/produtos/${id}`);
}

export async function deactivateProductAction(id: string): Promise<void> {
  const current = await getCurrentCompany();
  if (!current) return;

  const supabase = createClient();
  await supabase
    .from("products")
    .update({ status: "inactive" })
    .eq("id", id)
    .eq("company_id", current.company.id);

  const user = await getCurrentUser();
  await writeAuditLog(supabase, {
    companyId: current.company.id,
    actorUserId: user?.id ?? null,
    entityType: "product",
    entityId: id,
    action: AUDIT_ACTIONS.PRODUCT_DEACTIVATED,
  });

  revalidatePath("/app");
  revalidatePath("/app/produtos");
  revalidatePath(`/app/produtos/${id}`);
  redirect("/app/produtos");
}

export async function reactivateProductAction(id: string): Promise<void> {
  const current = await getCurrentCompany();
  if (!current) return;

  const supabase = createClient();
  await supabase
    .from("products")
    .update({ status: "active" })
    .eq("id", id)
    .eq("company_id", current.company.id);

  const user = await getCurrentUser();
  await writeAuditLog(supabase, {
    companyId: current.company.id,
    actorUserId: user?.id ?? null,
    entityType: "product",
    entityId: id,
    action: AUDIT_ACTIONS.PRODUCT_ACTIVATED,
  });

  revalidatePath("/app");
  revalidatePath("/app/produtos");
  revalidatePath(`/app/produtos/${id}`);
  redirect(`/app/produtos/${id}`);
}

export async function adjustStockAction(
  id: string,
  _prevState: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const parsed = stockAdjustmentSchema.safeParse({
    newQuantity: formData.get("newQuantity"),
    reason: formData.get("reason"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const current = await getCurrentCompany();
  if (!current) {
    return { error: "Nenhuma empresa encontrada para o usuário atual." };
  }

  const user = await getCurrentUser();
  const supabase = createClient();

  const result = await adjustProductStock({
    supabase,
    companyId: current.company.id,
    productId: id,
    newQuantity: parsed.data.newQuantity,
    reason: parsed.data.reason,
    actorUserId: user?.id ?? null,
  });

  if (result.error) {
    return { error: result.error };
  }

  revalidatePath("/app");
  revalidatePath("/app/produtos");
  revalidatePath(`/app/produtos/${id}`);
  redirect(`/app/produtos/${id}`);
}
