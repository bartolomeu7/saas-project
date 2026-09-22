"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/auth/actions";
import type { Database } from "@/types/supabase";

type CompanyRole = Database["public"]["Enums"]["company_role"];

const roles: readonly CompanyRole[] = ["admin", "employee"];

const textValue = (value: FormDataEntryValue | null) =>
  typeof value === "string" ? value.trim() : "";

export async function addExistingMemberAction(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const email = textValue(formData.get("email"));
  const role = textValue(formData.get("role")) as CompanyRole;

  if (!email) return { error: "Informe o e-mail do colaborador." };
  if (!roles.includes(role)) return { error: "Selecione uma função válida." };

  const supabase = createClient();
  const { error } = await supabase.rpc("add_existing_company_member", {
    p_email: email,
    p_role: role,
  });

  if (error) return { error: error.message || "Não foi possível adicionar o colaborador." };

  revalidatePath("/app/equipe");
  return { success: "Colaborador adicionado à empresa." };
}

export async function updateMemberRoleAction(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const memberId = textValue(formData.get("memberId"));
  const role = textValue(formData.get("role")) as CompanyRole;

  if (!memberId) return { error: "Colaborador inválido." };
  if (!(["owner", "admin", "employee"] as const).includes(role as "owner" | "admin" | "employee")) {
    return { error: "Função inválida." };
  }

  const supabase = createClient();
  const { error } = await supabase.rpc("update_company_member_role", {
    p_member_id: memberId,
    p_role: role,
  });

  if (error) return { error: error.message || "Não foi possível atualizar a função." };

  revalidatePath("/app/equipe");
  return { success: "Permissão atualizada." };
}

export async function removeMemberAction(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const memberId = textValue(formData.get("memberId"));
  if (!memberId) return { error: "Colaborador inválido." };

  const supabase = createClient();
  const { error } = await supabase.rpc("remove_company_member", {
    p_member_id: memberId,
  });

  if (error) return { error: error.message || "Não foi possível remover o colaborador." };

  revalidatePath("/app/equipe");
  revalidatePath("/app/agenda");
  return { success: "Colaborador removido." };
}

export async function saveProfessionalAction(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const companyMemberId = textValue(formData.get("companyMemberId"));
  const displayName = textValue(formData.get("displayName"));
  const phone = textValue(formData.get("phone")) || undefined;
  const specialty = textValue(formData.get("specialty")) || undefined;
  const color = textValue(formData.get("color")) || "sky";
  const notes = textValue(formData.get("notes")) || undefined;
  const active = formData.get("active") === "on";

  if (!companyMemberId || !displayName) {
    return { error: "Nome e colaborador são obrigatórios." };
  }

  const supabase = createClient();
  const { error } = await supabase.rpc("upsert_professional_profile", {
    p_company_member_id: companyMemberId,
    p_display_name: displayName,
    p_phone: phone,
    p_specialty: specialty,
    p_color: color,
    p_notes: notes,
    p_active: active,
  });

  if (error) return { error: error.message || "Não foi possível salvar o profissional." };

  revalidatePath("/app/equipe");
  revalidatePath("/app/agenda");
  return { success: "Ficha profissional salva." };
}

export async function saveProfessionalServicesAction(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const professionalId = textValue(formData.get("professionalId"));
  const raw = textValue(formData.get("services"));
  if (!professionalId) return { error: "Profissional inválido." };

  let services: unknown = [];
  try {
    services = JSON.parse(raw || "[]");
  } catch {
    return { error: "Configuração de serviços inválida." };
  }

  const supabase = createClient();
  const { error } = await supabase.rpc("set_professional_services", {
    p_professional_id: professionalId,
    p_services: services as never,
  });

  if (error) return { error: error.message || "Não foi possível salvar os serviços." };

  revalidatePath("/app/equipe");
  revalidatePath("/app/agenda");
  return { success: "Serviços do profissional atualizados." };
}

export async function saveProfessionalAvailabilityAction(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const professionalId = textValue(formData.get("professionalId"));
  const raw = textValue(formData.get("schedule"));
  if (!professionalId) return { error: "Profissional inválido." };

  let schedule: unknown = [];
  try {
    schedule = JSON.parse(raw || "[]");
  } catch {
    return { error: "Horários inválidos." };
  }

  const supabase = createClient();
  const { error } = await supabase.rpc("set_professional_availability", {
    p_professional_id: professionalId,
    p_schedule: schedule as never,
  });

  if (error) return { error: error.message || "Não foi possível salvar a disponibilidade." };

  revalidatePath("/app/equipe");
  revalidatePath("/app/agenda");
  return { success: "Disponibilidade atualizada." };
}

export async function createProfessionalBlockAction(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const professionalId = textValue(formData.get("professionalId"));
  const startsAt = textValue(formData.get("startsAt"));
  const endsAt = textValue(formData.get("endsAt"));
  const reason = textValue(formData.get("reason")) || undefined;

  if (!professionalId || !startsAt || !endsAt) {
    return { error: "Informe profissional, início e fim do bloqueio." };
  }

  const supabase = createClient();
  const { error } = await supabase.rpc("create_professional_block", {
    p_professional_id: professionalId,
    p_starts_at: new Date(startsAt).toISOString(),
    p_ends_at: new Date(endsAt).toISOString(),
    p_reason: reason,
  });

  if (error) return { error: error.message || "Não foi possível criar o bloqueio." };

  revalidatePath("/app/equipe");
  revalidatePath("/app/agenda");
  return { success: "Horário bloqueado." };
}

export async function deleteProfessionalBlockAction(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const blockId = textValue(formData.get("blockId"));
  if (!blockId) return { error: "Bloqueio inválido." };

  const supabase = createClient();
  const { error } = await supabase.rpc("delete_professional_block", {
    p_block_id: blockId,
  });

  if (error) return { error: error.message || "Não foi possível remover o bloqueio." };

  revalidatePath("/app/equipe");
  revalidatePath("/app/agenda");
  return { success: "Bloqueio removido." };
}
