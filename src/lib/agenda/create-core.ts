import "server-only";

import type { createSessionClient } from "@/lib/supabase/server";
import { parseLocalDateTimeSaoPaulo } from "@/lib/timezone";

/**
 * Criação de agendamento — núcleo ÚNICO usado pela tela da Agenda (createAppointmentAction) e pelo Chat AI.
 * Fica fora do arquivo "use server" de propósito: lá, toda função exportada vira uma ação chamável pelo navegador.
 * As conferências são as mesmas nos dois caminhos: dia sem expediente (regra do app) + create_appointment (regras do banco).
 */

type SessionClient = Awaited<ReturnType<typeof createSessionClient>>;

const WEEKDAY_NAMES = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];

/**
 * Se o profissional tem expediente cadastrado, um dia SEM expediente é dia de folga. O banco só confere o horário
 * quando existe regra para o dia, então um dia desmarcado ficava livre para agendar — o contrário do que o dono quis.
 */
export async function offDayError(supabase: SessionClient, professionalId: string | null | undefined, localDateTime: string): Promise<string | null> {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(localDateTime);
  if (!professionalId || !match) return null;
  const weekday = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))).getUTCDay();
  const { data } = await supabase.from("professional_availability").select("weekday").eq("professional_id", professionalId).eq("active", true);
  const rules = (data ?? []) as { weekday: number }[];
  if (rules.length > 0 && !rules.some((rule) => rule.weekday === weekday)) {
    return `O profissional não atende em ${WEEKDAY_NAMES[weekday]} (dia sem expediente).`;
  }
  return null;
}

export interface CreateAppointmentInput {
  customerId?: string;
  serviceId: string;
  professionalId?: string;
  /** horário local de São Paulo, "YYYY-MM-DDTHH:mm" */
  startsAtLocal: string;
  /** só quando a pessoa definiu a duração; senão o banco usa a do profissional para o serviço, depois a do serviço */
  durationMinutes?: number;
  /** só quando a pessoa definiu o valor; senão o banco usa o do profissional, depois o do serviço */
  price?: number;
  notes?: string;
}

export type CreateAppointmentResult = { error: string } | { id: string };

export async function createAppointmentCore(supabase: SessionClient, input: CreateAppointmentInput): Promise<CreateAppointmentResult> {
  if (!input.serviceId || !input.startsAtLocal) return { error: "Informe serviço e horário." };
  const startsAt = parseLocalDateTimeSaoPaulo(input.startsAtLocal);
  if (!startsAt) return { error: "Horário inválido." };

  const offDay = await offDayError(supabase, input.professionalId, input.startsAtLocal);
  if (offDay) return { error: offDay };

  const { data, error } = await supabase.rpc("create_appointment", {
    p_customer_id: input.customerId,
    p_service_id: input.serviceId,
    p_professional_id: input.professionalId,
    p_starts_at: startsAt.toISOString(),
    p_duration_minutes: input.durationMinutes,
    p_price: input.price,
    p_notes: input.notes,
  });
  if (error) return { error: error.message || "Não foi possível criar o agendamento." };
  const row = (Array.isArray(data) ? data[0] : data) as { id?: string } | null;
  return { id: row?.id ?? "" };
}
