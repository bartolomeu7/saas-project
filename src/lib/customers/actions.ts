"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentCompany } from "@/lib/companies/queries";
import { getCurrentUser } from "@/lib/auth/session";
import { customerSchema } from "@/lib/validations/customer";
import { writeAuditLog } from "@/lib/audit/log";
import { AUDIT_ACTIONS } from "@/types/audit";
import type { ActionResult } from "@/lib/auth/actions";

/**
 * Extrai e valida os campos do formulário de cliente a partir de um
 * FormData. company_id NUNCA é lido do formulário — é sempre resolvido
 * a partir da empresa atual do usuário autenticado.
 */
function parseCustomerForm(formData: FormData) {
  return customerSchema.safeParse({
    name: formData.get("name"),
    document: formData.get("document"),
    phone: formData.get("phone"),
    whatsapp: formData.get("whatsapp"),
    email: formData.get("email"),
    address: formData.get("address"),
    addressNumber: formData.get("addressNumber"),
    complement: formData.get("complement"),
    neighborhood: formData.get("neighborhood"),
    city: formData.get("city"),
    state: formData.get("state"),
    postalCode: formData.get("postalCode"),
    notes: formData.get("notes"),
    birthDate: formData.get("birthDate"),
    preferences: formData.get("preferences"),
    status: formData.get("status") || "active",
  });
}

/** Cria um novo cliente na empresa do usuário autenticado. */
export async function createCustomerAction(
  _prevState: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const parsed = parseCustomerForm(formData);

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const current = await getCurrentCompany();
  if (!current) {
    return { error: "Nenhuma empresa encontrada para o usuário atual." };
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from("customers")
    .insert({
      company_id: current.company.id,
      name: parsed.data.name,
      document: parsed.data.document,
      phone: parsed.data.phone,
      whatsapp: parsed.data.whatsapp,
      email: parsed.data.email,
      address: parsed.data.address,
      address_number: parsed.data.addressNumber,
      complement: parsed.data.complement,
      neighborhood: parsed.data.neighborhood,
      city: parsed.data.city,
      state: parsed.data.state,
      postal_code: parsed.data.postalCode,
      notes: parsed.data.notes,
      birth_date: parsed.data.birthDate,
      preferences: parsed.data.preferences,
      status: parsed.data.status,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { error: "Não foi possível salvar o cliente. Tente novamente." };
  }

  const user = await getCurrentUser();
  await writeAuditLog(supabase, {
    companyId: current.company.id,
    actorUserId: user?.id ?? null,
    entityType: "customer",
    entityId: data.id,
    action: AUDIT_ACTIONS.CUSTOMER_CREATED,
    metadata: { name: parsed.data.name },
  });

  revalidatePath("/app");
  revalidatePath("/app/clientes");
  redirect(`/app/clientes/${data.id}`);
}

/**
 * Atualiza um cliente existente. O `id` é passado por bind (não vem do
 * formulário) e o company_id nunca é alterado aqui — RLS + o trigger
 * `customers_protect_company_id` garantem isso mesmo que fosse tentado.
 */
export async function updateCustomerAction(
  id: string,
  _prevState: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const parsed = parseCustomerForm(formData);

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const current = await getCurrentCompany();
  if (!current) {
    return { error: "Nenhuma empresa encontrada para o usuário atual." };
  }

  const supabase = createClient();

  // Lido antes do update só para saber se birth_date/preferences
  // realmente mudaram — permite registrar eventos de auditoria
  // específicos além do customer_updated genérico, sem duplicar lógica.
  const { data: before } = await supabase
    .from("customers")
    .select("birth_date, preferences")
    .eq("id", id)
    .eq("company_id", current.company.id)
    .maybeSingle();

  const { error } = await supabase
    .from("customers")
    .update({
      name: parsed.data.name,
      document: parsed.data.document,
      phone: parsed.data.phone,
      whatsapp: parsed.data.whatsapp,
      email: parsed.data.email,
      address: parsed.data.address,
      address_number: parsed.data.addressNumber,
      complement: parsed.data.complement,
      neighborhood: parsed.data.neighborhood,
      city: parsed.data.city,
      state: parsed.data.state,
      postal_code: parsed.data.postalCode,
      notes: parsed.data.notes,
      birth_date: parsed.data.birthDate,
      preferences: parsed.data.preferences,
      status: parsed.data.status,
    })
    // Redundante com a RLS de propósito (defesa em profundidade): mesmo
    // que a policy falhe por algum motivo, esta cláusula garante que só
    // atualizamos um cliente da própria empresa.
    .eq("id", id)
    .eq("company_id", current.company.id);

  if (error) {
    return { error: "Não foi possível salvar as alterações. Tente novamente." };
  }

  const user = await getCurrentUser();
  await writeAuditLog(supabase, {
    companyId: current.company.id,
    actorUserId: user?.id ?? null,
    entityType: "customer",
    entityId: id,
    action: AUDIT_ACTIONS.CUSTOMER_UPDATED,
    metadata: { name: parsed.data.name, status: parsed.data.status },
  });

  if (before && before.birth_date !== parsed.data.birthDate) {
    await writeAuditLog(supabase, {
      companyId: current.company.id,
      actorUserId: user?.id ?? null,
      entityType: "customer",
      entityId: id,
      action: AUDIT_ACTIONS.CUSTOMER_BIRTH_DATE_UPDATED,
    });
  }

  if (
    before &&
    JSON.stringify(before.preferences ?? {}) !== JSON.stringify(parsed.data.preferences ?? {})
  ) {
    await writeAuditLog(supabase, {
      companyId: current.company.id,
      actorUserId: user?.id ?? null,
      entityType: "customer",
      entityId: id,
      action: AUDIT_ACTIONS.CUSTOMER_PREFERENCES_UPDATED,
    });
  }

  revalidatePath("/app");
  revalidatePath("/app/clientes");
  revalidatePath(`/app/clientes/${id}`);
  redirect(`/app/clientes/${id}`);
}

/**
 * "Exclusão" de cliente nesta etapa é lógica: define status = inactive.
 * Ver docs/architecture.md para a justificativa dessa escolha.
 */
export async function deactivateCustomerAction(id: string): Promise<void> {
  const current = await getCurrentCompany();
  if (!current) {
    return;
  }

  const supabase = createClient();
  await supabase
    .from("customers")
    .update({ status: "inactive" })
    .eq("id", id)
    .eq("company_id", current.company.id);

  const user = await getCurrentUser();
  await writeAuditLog(supabase, {
    companyId: current.company.id,
    actorUserId: user?.id ?? null,
    entityType: "customer",
    entityId: id,
    action: AUDIT_ACTIONS.CUSTOMER_DEACTIVATED,
  });

  revalidatePath("/app");
  revalidatePath("/app/clientes");
  revalidatePath(`/app/clientes/${id}`);
  redirect("/app/clientes");
}

/** Reativa um cliente previamente desativado (status = active). */
export async function reactivateCustomerAction(id: string): Promise<void> {
  const current = await getCurrentCompany();
  if (!current) {
    return;
  }

  const supabase = createClient();
  await supabase
    .from("customers")
    .update({ status: "active" })
    .eq("id", id)
    .eq("company_id", current.company.id);

  const user = await getCurrentUser();
  await writeAuditLog(supabase, {
    companyId: current.company.id,
    actorUserId: user?.id ?? null,
    entityType: "customer",
    entityId: id,
    action: AUDIT_ACTIONS.CUSTOMER_REACTIVATED,
  });

  revalidatePath("/app");
  revalidatePath("/app/clientes");
  revalidatePath(`/app/clientes/${id}`);
  redirect(`/app/clientes/${id}`);
}
