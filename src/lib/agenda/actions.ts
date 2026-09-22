"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/auth/actions";
import type { Database } from "@/types/supabase";

type AppointmentStatus = Database["public"]["Enums"]["appointment_status"];

const textValue = (value: FormDataEntryValue | null) =>
  typeof value === "string" ? value.trim() : "";

function parsePositiveInt(value: FormDataEntryValue | null): number | undefined {
  const raw = textValue(value);
  if (!raw) return undefined;
  const number = Number(raw);
  return Number.isInteger(number) && number > 0 ? number : undefined;
}

function parseMoney(value: FormDataEntryValue | null): number | undefined {
  const raw = textValue(value).replace(",", ".");
  if (!raw) return undefined;
  const number = Number(raw);
  return Number.isFinite(number) && number >= 0 ? number : undefined;
}

export async function createAppointmentAction(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const customerId = textValue(formData.get("customerId")) || undefined;
  const serviceId = textValue(formData.get("serviceId"));
  const professionalId = textValue(formData.get("professionalId")) || undefined;
  const startsAt = textValue(formData.get("startsAt"));
  const duration = parsePositiveInt(formData.get("durationMinutes"));
  const price = parseMoney(formData.get("price"));
  const notes = textValue(formData.get("notes")) || undefined;

  if (!serviceId || !startsAt) {
    return { error: "Informe serviço e horário." };
  }

  const supabase = createClient();
  const { error } = await supabase.rpc("create_appointment", {
    p_customer_id: customerId,
    p_service_id: serviceId,
    p_professional_id: professionalId,
    p_starts_at: new Date(startsAt).toISOString(),
    p_duration_minutes: duration,
    p_price: price,
    p_notes: notes,
  });

  if (error) return { error: error.message || "Não foi possível criar o agendamento." };

  revalidatePath("/app/agenda");
  return { success: "Agendamento criado." };
}

export async function rescheduleAppointmentAction(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const appointmentId = textValue(formData.get("appointmentId"));
  const startsAt = textValue(formData.get("startsAt"));

  if (!appointmentId || !startsAt) return { error: "Agendamento ou horário inválido." };

  const supabase = createClient();
  const { error } = await supabase.rpc("reschedule_appointment", {
    p_appointment_id: appointmentId,
    p_starts_at: new Date(startsAt).toISOString(),
  });

  if (error) return { error: error.message || "Não foi possível reagendar." };

  revalidatePath("/app/agenda");
  return { success: "Agendamento reagendado." };
}

export async function setAppointmentStatusAction(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const appointmentId = textValue(formData.get("appointmentId"));
  const status = textValue(formData.get("status")) as AppointmentStatus;
  const reason = textValue(formData.get("reason")) || undefined;

  if (!appointmentId) return { error: "Agendamento inválido." };

  const allowed: AppointmentStatus[] = [
    "scheduled",
    "confirmed",
    "completed",
    "cancelled",
    "no_show",
  ];

  if (!allowed.includes(status)) return { error: "Status inválido." };

  const supabase = createClient();
  const { error } = await supabase.rpc("set_appointment_status", {
    p_appointment_id: appointmentId,
    p_status: status,
    p_reason: reason,
  });

  if (error) return { error: error.message || "Não foi possível atualizar o agendamento." };

  revalidatePath("/app/agenda");
  return { success: "Agendamento atualizado." };
}
