"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentCompany } from "@/lib/companies/queries";
import { getCurrentUser } from "@/lib/auth/session";
import { writeAuditLog } from "@/lib/audit/log";
import type { ActionResult } from "@/lib/auth/actions";
import type { SupplierFormFields } from "@/types/supplier";

function parse(formData: FormData): SupplierFormFields | { error: string } {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Informe o nome do fornecedor." };
  const status = String(formData.get("status") ?? "active");
  return {
    name, legal_name: String(formData.get("legal_name") ?? "").trim(),
    document: String(formData.get("document") ?? "").trim(),
    email: String(formData.get("email") ?? "").trim(),
    phone: String(formData.get("phone") ?? "").trim(),
    whatsapp: String(formData.get("whatsapp") ?? "").trim(),
    address: String(formData.get("address") ?? "").trim(),
    address_number: String(formData.get("address_number") ?? "").trim(),
    complement: String(formData.get("complement") ?? "").trim(),
    neighborhood: String(formData.get("neighborhood") ?? "").trim(),
    city: String(formData.get("city") ?? "").trim(),
    state: String(formData.get("state") ?? "").trim(),
    postal_code: String(formData.get("postal_code") ?? "").trim(),
    notes: String(formData.get("notes") ?? "").trim(),
    status: status === "inactive" ? "inactive" : "active",
  };
}

export async function createSupplierAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const parsed = parse(formData);
  if ("error" in parsed) return parsed;
  const current = await getCurrentCompany();
  if (!current) return { error: "Nenhuma empresa encontrada." };
  const supabase = createClient() as any;
  const { data, error } = await supabase.from("suppliers").insert({ company_id: current.company.id, ...parsed }).select("id").single();
  if (error || !data) return { error: error?.code === "23505" ? "Já existe um fornecedor com este documento." : "Não foi possível salvar o fornecedor." };
  const user = await getCurrentUser();
  await writeAuditLog(supabase, { companyId: current.company.id, actorUserId: user?.id ?? null, entityType: "supplier", entityId: data.id, action: "supplier.created", metadata: { name: parsed.name } });
  revalidatePath("/app/fornecedores");
  redirect(`/app/fornecedores/${data.id}`);
}

export async function updateSupplierAction(id: string, _prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const parsed = parse(formData);
  if ("error" in parsed) return parsed;
  const current = await getCurrentCompany();
  if (!current) return { error: "Nenhuma empresa encontrada." };
  const supabase = createClient() as any;
  const { error } = await supabase.from("suppliers").update(parsed).eq("id", id).eq("company_id", current.company.id);
  if (error) return { error: error.code === "23505" ? "Já existe um fornecedor com este documento." : "Não foi possível salvar as alterações." };
  const user = await getCurrentUser();
  await writeAuditLog(supabase, { companyId: current.company.id, actorUserId: user?.id ?? null, entityType: "supplier", entityId: id, action: "supplier.updated", metadata: { name: parsed.name } });
  revalidatePath("/app/fornecedores");
  revalidatePath(`/app/fornecedores/${id}`);
  redirect(`/app/fornecedores/${id}`);
}

export async function toggleSupplierAction(id: string, status: "active" | "inactive"): Promise<void> {
  const current = await getCurrentCompany();
  if (!current) return;
  const supabase = createClient() as any;
  await supabase.from("suppliers").update({ status }).eq("id", id).eq("company_id", current.company.id);
  revalidatePath("/app/fornecedores");
  revalidatePath(`/app/fornecedores/${id}`);
  redirect("/app/fornecedores");
}