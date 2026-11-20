"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSessionClient } from "@/lib/supabase/server";
import { requireSuperAdmin } from "@/lib/admin/queries";
import { parseLocalDateTimeSaoPaulo } from "@/lib/timezone";
import { cleanText } from "@/lib/validations/common";
import type { ActionResult } from "@/lib/auth/actions";

/**
 * Manutenção programada — painel admin. SÓ super administrador (requireSuperAdmin + is_super_admin() dentro de cada RPC).
 * Aqui só se confere o formato do formulário; as regras (período, conflito, no máximo uma ativa) e a auditoria são do banco.
 */

const uuid = z.string().uuid("Manutenção inválida.");
const LEVELS = ["notice", "read_only", "blocked"] as const;

function text(formData: FormData, name: string, max: number): string {
  const value = formData.get(name);
  return typeof value === "string" ? cleanText(value).trim().slice(0, max + 1) : "";
}

function userMessage(error: { message: string; code?: string }): string {
  if (error.message === "not authorized") return "Você não tem permissão para realizar esta operação.";
  if (error.code === "P0001") return error.message;
  return "Não foi possível concluir a operação. Tente novamente.";
}

function refresh() {
  revalidatePath("/admin/maintenance");
  revalidatePath("/admin/audit");
}

const scheduleSchema = z.object({
  title: z.string().min(3, "Informe um título (pelo menos 3 letras).").max(120, "Título muito longo (máximo 120)."),
  message: z.string().min(3, "Informe a mensagem para o cliente.").max(1000, "Mensagem muito longa (máximo 1000)."),
  level: z.enum(LEVELS, { message: "Escolha o nível da manutenção." }),
  contact: z.string().max(200, "Contato muito longo (máximo 200).").optional(),
  note: z.string().max(1000, "Nota interna muito longa (máximo 1000).").optional(),
  announceHours: z.coerce.number().int("Aviso antecipado: use horas inteiras.").min(1, "Aviso antecipado: mínimo 1 hora.").max(336, "Aviso antecipado: máximo 336 horas (14 dias)."),
});

function parseWindowForm(formData: FormData) {
  const parsed = scheduleSchema.safeParse({
    title: text(formData, "title", 120),
    message: text(formData, "message", 1000),
    level: formData.get("level"),
    contact: text(formData, "contact", 200) || undefined,
    note: text(formData, "note", 1000) || undefined,
    announceHours: formData.get("announceHours") || 48,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." } as const;

  const startsAt = parseLocalDateTimeSaoPaulo(String(formData.get("startsAt") ?? ""));
  const endsAt = parseLocalDateTimeSaoPaulo(String(formData.get("expectedEndAt") ?? ""));
  if (!startsAt) return { error: "Informe o início da manutenção." } as const;
  if (!endsAt) return { error: "Informe a previsão de término." } as const;
  return { data: parsed.data, startsAt, endsAt } as const;
}

export async function scheduleMaintenanceAction(formData: FormData): Promise<ActionResult> {
  await requireSuperAdmin();
  const form = parseWindowForm(formData);
  if ("error" in form) return { error: form.error };

  const supabase = await createSessionClient();
  const { error } = await supabase.rpc("schedule_maintenance" as never, {
    p_title: form.data.title,
    p_message: form.data.message,
    p_level: form.data.level,
    p_starts_at: form.startsAt.toISOString(),
    p_expected_end_at: form.endsAt.toISOString(),
    p_announce_hours: form.data.announceHours,
    p_contact: form.data.contact ?? null,
    p_internal_note: form.data.note ?? null,
  } as never);
  if (error) return { error: userMessage(error) };

  refresh();
  return { success: "Manutenção agendada." };
}

export async function updateMaintenanceAction(id: string, formData: FormData): Promise<ActionResult> {
  await requireSuperAdmin();
  const parsedId = uuid.safeParse(id);
  if (!parsedId.success) return { error: "Manutenção inválida." };
  const form = parseWindowForm(formData);
  if ("error" in form) return { error: form.error };

  const supabase = await createSessionClient();
  const { error } = await supabase.rpc("update_maintenance" as never, {
    p_id: parsedId.data,
    p_title: form.data.title,
    p_message: form.data.message,
    p_level: form.data.level,
    p_starts_at: form.startsAt.toISOString(),
    p_expected_end_at: form.endsAt.toISOString(),
    p_announce_hours: form.data.announceHours,
    p_contact: form.data.contact ?? null,
    p_internal_note: form.data.note ?? null,
  } as never);
  if (error) return { error: userMessage(error) };

  refresh();
  return { success: "Manutenção atualizada." };
}

/** Inicia agora uma manutenção já agendada. */
export async function startScheduledMaintenanceAction(id: string): Promise<ActionResult> {
  await requireSuperAdmin();
  const parsedId = uuid.safeParse(id);
  if (!parsedId.success) return { error: "Manutenção inválida." };

  const supabase = await createSessionClient();
  const { error } = await supabase.rpc("start_maintenance_now" as never, { p_from_id: parsedId.data } as never);
  if (error) return { error: userMessage(error) };

  refresh();
  return { success: "Manutenção iniciada." };
}

const emergencySchema = z.object({
  title: z.string().min(3, "Informe um título (pelo menos 3 letras).").max(120, "Título muito longo (máximo 120)."),
  message: z.string().min(3, "Informe a mensagem para o cliente.").max(1000, "Mensagem muito longa (máximo 1000)."),
  level: z.enum(LEVELS, { message: "Escolha o nível da manutenção." }),
  minutes: z.coerce.number().int("Duração: use minutos inteiros.").min(5, "Duração mínima: 5 minutos.").max(24 * 60, "Duração máxima: 24 horas."),
  contact: z.string().max(200, "Contato muito longo (máximo 200).").optional(),
});

/** Começa uma manutenção agora, sem agendamento prévio (emergência). Bloqueio total exige digitar a palavra de confirmação. */
export async function startMaintenanceNowAction(formData: FormData): Promise<ActionResult> {
  await requireSuperAdmin();
  const parsed = emergencySchema.safeParse({
    title: text(formData, "title", 120),
    message: text(formData, "message", 1000),
    level: formData.get("level"),
    minutes: formData.get("minutes"),
    contact: text(formData, "contact", 200) || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };

  if (parsed.data.level === "blocked") {
    const confirm = text(formData, "confirm", 40).normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
    if (confirm !== "MANUTENCAO") return { error: "Para bloquear o sistema, digite MANUTENÇÃO no campo de confirmação." };
  }

  const supabase = await createSessionClient();
  const { error } = await supabase.rpc("start_maintenance_now" as never, {
    p_title: parsed.data.title,
    p_message: parsed.data.message,
    p_level: parsed.data.level,
    p_expected_minutes: parsed.data.minutes,
    p_contact: parsed.data.contact ?? null,
  } as never);
  if (error) return { error: userMessage(error) };

  refresh();
  return { success: "Manutenção iniciada." };
}

export async function extendMaintenanceAction(id: string, formData: FormData): Promise<ActionResult> {
  await requireSuperAdmin();
  const parsedId = uuid.safeParse(id);
  if (!parsedId.success) return { error: "Manutenção inválida." };
  const minutes = z.coerce.number().int("Use minutos inteiros.").min(5, "Mínimo de 5 minutos.").max(480, "Máximo de 8 horas.").safeParse(formData.get("minutes"));
  if (!minutes.success) return { error: minutes.error.issues[0]?.message ?? "Minutos inválidos." };

  const supabase = await createSessionClient();
  const { error } = await supabase.rpc("extend_maintenance" as never, { p_id: parsedId.data, p_minutes: minutes.data } as never);
  if (error) return { error: userMessage(error) };

  refresh();
  return { success: "Previsão de término estendida." };
}

export async function endMaintenanceAction(id: string): Promise<ActionResult> {
  await requireSuperAdmin();
  const parsedId = uuid.safeParse(id);
  if (!parsedId.success) return { error: "Manutenção inválida." };

  const supabase = await createSessionClient();
  const { error } = await supabase.rpc("end_maintenance" as never, { p_id: parsedId.data } as never);
  if (error) return { error: userMessage(error) };

  refresh();
  return { success: "Manutenção encerrada. O sistema voltou ao normal." };
}

export async function cancelMaintenanceAction(id: string, formData: FormData): Promise<ActionResult> {
  await requireSuperAdmin();
  const parsedId = uuid.safeParse(id);
  if (!parsedId.success) return { error: "Manutenção inválida." };
  const reason = text(formData, "reason", 300);
  if (reason.length > 300) return { error: "Motivo muito longo (máximo 300)." };

  const supabase = await createSessionClient();
  const { error } = await supabase.rpc("cancel_maintenance" as never, { p_id: parsedId.data, p_reason: reason || null } as never);
  if (error) return { error: userMessage(error) };

  refresh();
  return { success: "Manutenção cancelada." };
}
