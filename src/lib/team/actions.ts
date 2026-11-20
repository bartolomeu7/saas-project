"use server";

import { revalidatePath } from "next/cache";
import { createSessionClient } from "@/lib/supabase/server";
import { parseLocalDateTimeSaoPaulo } from "@/lib/timezone";
import type { ActionResult } from "@/lib/auth/actions";
import type { Database } from "@/types/supabase";
import { cleanText } from "@/lib/validations/common";
import {
  blockReasonSchema,
  blockWindowError,
  memberEmailSchema,
  parseServiceOverrides,
  professionalProfileSchema,
} from "@/lib/validations/team";

type CompanyRole = Database["public"]["Enums"]["company_role"];

const roles: readonly CompanyRole[] = ["admin", "employee"];

const textValue = (value: FormDataEntryValue | null) =>
  typeof value === "string" ? cleanText(value).trim() : "";

export async function addExistingMemberAction(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const emailResult = memberEmailSchema.safeParse(String(formData.get("email") ?? ""));
  const role = textValue(formData.get("role")) as CompanyRole;

  if (!emailResult.success) return { error: emailResult.error.issues[0]?.message ?? "Informe o e-mail do colaborador.", field: "email" };
  const email = emailResult.data;
  if (!roles.includes(role)) return { error: "Selecione uma função válida.", field: "role" };

  const supabase = await createSessionClient();
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
    return { error: "Função inválida.", field: "role" };
  }

  const supabase = await createSessionClient();
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

  const supabase = await createSessionClient();
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
  if (!companyMemberId) return { error: "Nome e colaborador são obrigatórios." };
  const profile = professionalProfileSchema.safeParse({
    displayName: formData.get("displayName"),
    phone: formData.get("phone"),
    specialty: formData.get("specialty"),
    color: formData.get("color"),
    notes: formData.get("notes"),
    active: formData.get("active") === "on",
  });
  if (!profile.success) return { error: profile.error.issues[0]?.message ?? "Dados inválidos." };
  const { displayName, active, color } = profile.data;
  const phone = profile.data.phone || undefined;
  const specialty = profile.data.specialty || undefined;
  const notes = profile.data.notes || undefined;

  const supabase = await createSessionClient();
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

  let parsedServices: unknown = [];
  try {
    parsedServices = JSON.parse(raw || "[]");
  } catch {
    return { error: "Configuração de serviços inválida." };
  }
  const checkedServices = parseServiceOverrides(parsedServices);
  if (!checkedServices.ok) return { error: checkedServices.error };
  const services = checkedServices.items;

  const supabase = await createSessionClient();
  const { error } = await supabase.rpc("set_professional_services", {
    p_professional_id: professionalId,
    p_services: services as never,
  });

  if (error) return { error: error.message || "Não foi possível salvar os serviços." };

  revalidatePath("/app/equipe");
  revalidatePath("/app/agenda");
  return { success: "Serviços do profissional atualizados." };
}

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Horários de atendimento: dia 0–6, "HH:MM", fim depois do início e sem dois períodos sobrepostos no mesmo dia. */
function availabilityError(schedule: unknown): string | null {
  if (!Array.isArray(schedule)) return "Horários inválidos.";
  if (schedule.length > 28) return "Períodos demais na semana.";
  const byDay = new Map<number, Array<[string, string]>>();
  for (const entry of schedule) {
    const row = (entry ?? {}) as { weekday?: unknown; start_time?: unknown; end_time?: unknown };
    const weekday = Number(row.weekday);
    const start = String(row.start_time ?? "").slice(0, 5);
    const end = String(row.end_time ?? "").slice(0, 5);
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) return "Dia da semana inválido.";
    if (!TIME_PATTERN.test(start) || !TIME_PATTERN.test(end)) return "Informe horário de início e de fim para cada dia marcado.";
    if (end <= start) return "O horário final deve ser maior que o inicial.";
    const list = byDay.get(weekday) ?? [];
    if (list.some(([s0, e0]) => start < e0 && s0 < end)) return "Há dois períodos que se sobrepõem no mesmo dia.";
    list.push([start, end]);
    byDay.set(weekday, list);
  }
  return null;
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
  const scheduleError = availabilityError(schedule);
  if (scheduleError) return { error: scheduleError };

  const supabase = await createSessionClient();
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
  const reasonResult = blockReasonSchema.safeParse(formData.get("reason"));
  if (!reasonResult.success) return { error: reasonResult.error.issues[0]?.message ?? "Motivo inválido." };
  const reason = reasonResult.data || undefined;

  if (!professionalId || !startsAt || !endsAt) {
    return { error: "Informe profissional, início e fim do bloqueio." };
  }

  const startsAtDate = parseLocalDateTimeSaoPaulo(startsAt);
  const endsAtDate = parseLocalDateTimeSaoPaulo(endsAt);
  if (!startsAtDate || !endsAtDate) return { error: "Início ou fim do bloqueio inválido." };
  const windowProblem = blockWindowError(startsAt, endsAt, startsAtDate, endsAtDate, new Date().getFullYear());
  if (windowProblem) return { error: windowProblem };

  const supabase = await createSessionClient();
  // dois bloqueios no mesmo horário só poluem a agenda (e o aviso de remoção): recusa em vez de duplicar
  const { data: overlapping } = await supabase
    .from("professional_blocks")
    .select("id")
    .eq("professional_id", professionalId)
    .lt("starts_at", endsAtDate.toISOString())
    .gt("ends_at", startsAtDate.toISOString())
    .limit(1);
  if ((overlapping ?? []).length > 0) return { error: "Já existe um bloqueio neste horário. Remova o anterior ou escolha outro período." };

  const { error } = await supabase.rpc("create_professional_block", {
    p_professional_id: professionalId,
    p_starts_at: startsAtDate.toISOString(),
    p_ends_at: endsAtDate.toISOString(),
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

  const supabase = await createSessionClient();
  const { error } = await supabase.rpc("delete_professional_block", {
    p_block_id: blockId,
  });

  if (error) return { error: error.message || "Não foi possível remover o bloqueio." };

  revalidatePath("/app/equipe");
  revalidatePath("/app/agenda");
  return { success: "Bloqueio removido." };
}
