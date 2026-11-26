"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createSessionClient } from "@/lib/supabase/server";
import { getCurrentCompany } from "@/lib/companies/queries";
import { getCurrentUser } from "@/lib/auth/session";
import { writeAuditLog } from "@/lib/audit/log";
import type { ActionResult } from "@/lib/auth/actions";
import { supplierSchema } from "@/lib/validations/supplier";
import { documentVariants } from "@/lib/validations/document";
import { nameInUse } from "@/lib/validations/name-in-use";

function parse(formData: FormData) {
  const raw: Record<string, unknown> = {};
  for (const key of ["name", "legal_name", "document", "email", "phone", "whatsapp", "address", "address_number", "complement", "neighborhood", "city", "state", "postal_code", "notes", "status"]) {
    raw[key] = formData.get(key);
  }
  const parsed = supplierSchema.safeParse(raw);
  return parsed.success ? parsed.data : { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
}

type Supabase = Awaited<ReturnType<typeof createSessionClient>>;

/** Já existe OUTRO fornecedor da empresa com este CPF/CNPJ (com ou sem pontuação)? */
async function documentInUse(supabase: Supabase, companyId: string, document: string, excludeId?: string): Promise<boolean> {
  if (!/\d/.test(document)) return false; // texto sem números ("ISENTO") pode repetir
  let query = (supabase as any).from("suppliers").select("id").eq("company_id", companyId).in("document", documentVariants(document)).limit(1);
  if (excludeId) query = query.neq("id", excludeId);
  const { data } = await query;
  return ((data as { id: string }[] | null) ?? []).length > 0;
}

export async function createSupplierAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const parsed = parse(formData);
  if ("error" in parsed) return parsed;
  const current = await getCurrentCompany();
  if (!current) return { error: "Nenhuma empresa encontrada." };
  const supabase = await createSessionClient();
  if (await nameInUse(supabase, "suppliers", current.company.id, parsed.name)) {
    return { error: "Já existe um fornecedor com esse nome. Acrescente a cidade ou a filial para diferenciar." };
  }
  if (await documentInUse(supabase, current.company.id, parsed.document)) return { error: "Já existe um fornecedor com este documento." };
  const { data, error } = await (supabase as any).from("suppliers").insert({ company_id: current.company.id, ...parsed }).select("id").single();
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
  const supabase = await createSessionClient();
  if (await nameInUse(supabase, "suppliers", current.company.id, parsed.name, id)) {
    return { error: "Já existe um fornecedor com esse nome. Acrescente a cidade ou a filial para diferenciar." };
  }
  if (await documentInUse(supabase, current.company.id, parsed.document, id)) return { error: "Já existe um fornecedor com este documento." };
  const { data: updatedRows, error } = await (supabase as any).from("suppliers").update(parsed).eq("id", id).eq("company_id", current.company.id).select("id");
  if (error) return { error: error.code === "23505" ? "Já existe um fornecedor com este documento." : "Não foi possível salvar as alterações." };
  if (!updatedRows || updatedRows.length === 0) {
    return { error: "Fornecedor não encontrado. O cadastro pode ter sido removido ou ser de outra empresa." };
  }
  const user = await getCurrentUser();
  await writeAuditLog(supabase, { companyId: current.company.id, actorUserId: user?.id ?? null, entityType: "supplier", entityId: id, action: "supplier.updated", metadata: { name: parsed.name } });
  revalidatePath("/app/fornecedores");
  revalidatePath(`/app/fornecedores/${id}`);
  redirect(`/app/fornecedores/${id}`);
}

export async function toggleSupplierAction(id: string, status: "active" | "inactive"): Promise<void> {
  const current = await getCurrentCompany();
  if (!current) return;
  const supabase = (await createSessionClient()) as any;
  await supabase.from("suppliers").update({ status }).eq("id", id).eq("company_id", current.company.id);
  revalidatePath("/app/fornecedores");
  revalidatePath(`/app/fornecedores/${id}`);
  redirect("/app/fornecedores");
}
