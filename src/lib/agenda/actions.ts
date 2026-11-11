"use server";

import { revalidatePath } from "next/cache";
import { createSessionClient } from "@/lib/supabase/server";
import { parseLocalDateTimeSaoPaulo, todayDateSaoPaulo } from "@/lib/timezone";
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

const WEEKDAY_NAMES = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];

/**
 * Se o profissional tem expediente cadastrado, um dia SEM expediente é dia de folga. O banco só confere o horário
 * quando existe regra para o dia, então um dia desmarcado ficava livre para agendar — o contrário do que o dono quis.
 */
async function offDayError(
  supabase: Awaited<ReturnType<typeof createSessionClient>>,
  professionalId: string | null | undefined,
  localDateTime: string
): Promise<string | null> {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(localDateTime);
  if (!professionalId || !match) return null;
  const weekday = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))).getUTCDay();
  const { data } = await supabase
    .from("professional_availability")
    .select("weekday")
    .eq("professional_id", professionalId)
    .eq("active", true);
  const rules = (data ?? []) as { weekday: number }[];
  if (rules.length > 0 && !rules.some((rule) => rule.weekday === weekday)) {
    return `O profissional não atende em ${WEEKDAY_NAMES[weekday]} (dia sem expediente).`;
  }
  return null;
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
  const startsAtDate = parseLocalDateTimeSaoPaulo(startsAt);
  if (!startsAtDate) return { error: "Horário inválido." };

  const supabase = await createSessionClient();
  const offDay = await offDayError(supabase, professionalId, startsAt);
  if (offDay) return { error: offDay };
  const { error } = await supabase.rpc("create_appointment", {
    p_customer_id: customerId,
    p_service_id: serviceId,
    p_professional_id: professionalId,
    p_starts_at: startsAtDate.toISOString(),
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
  const startsAtDate = parseLocalDateTimeSaoPaulo(startsAt);
  if (!startsAtDate) return { error: "Horário inválido." };

  const supabase = await createSessionClient();
  const { data: current } = await supabase.from("appointments").select("professional_id").eq("id", appointmentId).maybeSingle();
  const offDay = await offDayError(supabase, (current as { professional_id: string | null } | null)?.professional_id, startsAt);
  if (offDay) return { error: offDay };
  const { error } = await supabase.rpc("reschedule_appointment", {
    p_appointment_id: appointmentId,
    p_starts_at: startsAtDate.toISOString(),
  });

  if (error) return { error: error.message || "Não foi possível reagendar." };

  revalidatePath("/app/agenda");
  return { success: "Agendamento reagendado." };
}

const PAYMENT_METHODS = ["cash", "pix", "debit", "credit", "other"] as const;
type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/**
 * Conclui o atendimento e gera a venda (e o pagamento, se informado) numa única operação no banco
 * (`complete_appointment`: tudo ou nada). Sem forma de pagamento, a venda fica "a receber".
 */
export async function completeAppointmentAction(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const appointmentId = textValue(formData.get("appointmentId"));
  const rawMethod = textValue(formData.get("method"));
  const amount = parseMoney(formData.get("amount"));

  if (!appointmentId) return { error: "Agendamento inválido." };
  if (rawMethod && !PAYMENT_METHODS.includes(rawMethod as PaymentMethod)) {
    return { error: "Forma de pagamento inválida." };
  }
  const method = (rawMethod || undefined) as PaymentMethod | undefined;
  if (!method && textValue(formData.get("amount"))) {
    return { error: "Informe a forma de pagamento." };
  }
  if (method && textValue(formData.get("amount")) && amount === undefined) {
    return { error: "Valor inválido." };
  }

  const supabase = await createSessionClient();
  // Não gera receita de um serviço que ainda não aconteceu: só conclui até o fim do dia do atendimento.
  const { data: found } = await supabase.from("appointments").select("starts_at").eq("id", appointmentId).maybeSingle();
  const storedStart = (found as { starts_at?: string } | null)?.starts_at;
  if (storedStart && todayDateSaoPaulo(new Date(storedStart)) > todayDateSaoPaulo()) {
    return { error: "Este atendimento é de um dia futuro. Conclua no dia do atendimento (ou reagende)." };
  }
  const { error } = await supabase.rpc("complete_appointment", {
    p_appointment_id: appointmentId,
    p_method: method,
    p_amount: method ? amount : undefined,
  });

  if (error) return { error: error.message || "Não foi possível concluir o atendimento." };

  revalidatePath("/app/agenda");
  revalidatePath("/app/vendas");
  revalidatePath("/app/caixa");
  revalidatePath("/app/financeiro");
  revalidatePath("/app");
  return {
    success: method
      ? "Atendimento concluído e pagamento registrado."
      : "Atendimento concluído. A venda ficou a receber.",
  };
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

  // Concluir sempre passa por complete_appointment: o atendimento nunca fica "concluído" sem a venda ligada a ele.
  if (status === "completed") {
    return completeAppointmentAction({}, formData);
  }

  const supabase = await createSessionClient();
  const { error } = await supabase.rpc("set_appointment_status", {
    p_appointment_id: appointmentId,
    p_status: status,
    p_reason: reason,
  });

  if (error) return { error: error.message || "Não foi possível atualizar o agendamento." };

  revalidatePath("/app/agenda");
  return { success: "Agendamento atualizado." };
}
