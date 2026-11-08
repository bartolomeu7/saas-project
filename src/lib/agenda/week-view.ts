import type { AppointmentStatus } from "@/types/appointment";

/**
 * Lógica pura (sem banco, sem React) da agenda em 3 semanas: semana passada, atual e próxima.
 * Todas as datas são "YYYY-MM-DD" no calendário de São Paulo. A semana vai de domingo a sábado
 * (calendário brasileiro): hoje, domingo 08/11, abre a semana atual.
 *
 * São Paulo é sempre UTC-3 (sem horário de verão), como em `src/lib/timezone.ts`. As poucas contas
 * de fuso ficam aqui, sem importar aquele arquivo, para este módulo rodar também nos testes
 * unitários (que não resolvem o alias "@/").
 */
const SAO_PAULO_OFFSET_MS = 3 * 60 * 60 * 1000;

function saoPauloClock(reference: Date): Date {
  return new Date(reference.getTime() - SAO_PAULO_OFFSET_MS);
}

/** Data-calendário ("YYYY-MM-DD") de São Paulo no instante informado (padrão: agora). */
function dateKeyOf(reference: Date = new Date()): string {
  return saoPauloClock(reference).toISOString().slice(0, 10);
}

function startOfDayFromDateString(dateValue: string): Date {
  const [year = 1970, month = 1, day = 1] = dateValue.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0) + SAO_PAULO_OFFSET_MS);
}

function endOfDayFromDateString(dateValue: string): Date {
  const [year = 1970, month = 1, day = 1] = dateValue.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999) + SAO_PAULO_OFFSET_MS);
}

export type AgendaWeekKey = "passada" | "atual" | "proxima";

export const AGENDA_WEEK_KEYS: readonly AgendaWeekKey[] = ["passada", "atual", "proxima"];

export const AGENDA_WEEK_LABELS: Record<AgendaWeekKey, string> = {
  passada: "Semana passada",
  atual: "Esta semana",
  proxima: "Próxima semana",
};

const WEEK_OFFSETS: Record<AgendaWeekKey, number> = { passada: -1, atual: 0, proxima: 1 };

export function resolveWeekKey(raw: string | undefined | null): AgendaWeekKey {
  return AGENDA_WEEK_KEYS.find((key) => key === raw) ?? "atual";
}

export function addDaysToDateString(dateValue: string, amount: number): string {
  const [year = 1970, month = 1, day = 1] = dateValue.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

/** Domingo da semana que contém a data. */
export function weekStartSunday(dateValue: string): string {
  const [year = 1970, month = 1, day = 1] = dateValue.split("-").map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay(); // 0 = domingo
  return addDaysToDateString(dateValue, -weekday);
}

export interface AgendaWeekBounds {
  key: AgendaWeekKey;
  /** Domingo. */
  start: string;
  /** Sábado. */
  end: string;
  days: string[];
  /** Limites reais (UTC) para consultar o banco. */
  fromIso: string;
  toIso: string;
}

export function getWeekBounds(key: AgendaWeekKey, today: string = dateKeyOf()): AgendaWeekBounds {
  const start = addDaysToDateString(weekStartSunday(today), WEEK_OFFSETS[key] * 7);
  const days = Array.from({ length: 7 }, (_, index) => addDaysToDateString(start, index));
  const end = days[6] ?? start;
  const from = startOfDayFromDateString(start);
  const to = endOfDayFromDateString(end);
  return { key, start, end, days, fromIso: from.toISOString(), toIso: to.toISOString() };
}

/** Dia (YYYY-MM-DD) de São Paulo em que o instante cai. */
export function dayKeyOf(iso: string): string {
  return dateKeyOf(new Date(iso));
}

export function hourOf(iso: string): number {
  return saoPauloClock(new Date(iso)).getUTCHours();
}

export function timeLabel(iso: string): string {
  const clock = saoPauloClock(new Date(iso));
  return `${String(clock.getUTCHours()).padStart(2, "0")}:${String(clock.getUTCMinutes()).padStart(2, "0")}`;
}

/** "02/11" */
export function shortDateLabel(dateValue: string): string {
  const [, month = "01", day = "01"] = dateValue.split("-");
  return `${day}/${month}`;
}

const WEEKDAY_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"] as const;

export function weekdayShort(dateValue: string): string {
  const [year = 1970, month = 1, day = 1] = dateValue.split("-").map(Number);
  return WEEKDAY_SHORT[new Date(Date.UTC(year, month - 1, day)).getUTCDay()] ?? "";
}

/**
 * Como o agendamento aparece na agenda:
 * - done: concluído (verde)
 * - pending: o horário já passou e o dono não concluiu (branco)
 * - upcoming: agendado/confirmado, ainda por vir (azul)
 * - cancelled / no_show: fora do fluxo (cinza / vermelho suave)
 */
export type AgendaVisualState = "done" | "pending" | "upcoming" | "cancelled" | "no_show";

export const AGENDA_VISUAL_LABELS: Record<AgendaVisualState, string> = {
  done: "Concluído",
  pending: "Pendente",
  upcoming: "Agendado",
  cancelled: "Cancelado",
  no_show: "Não compareceu",
};

export function appointmentVisualState(
  appointment: { status: AppointmentStatus; ends_at: string },
  now: Date
): AgendaVisualState {
  if (appointment.status === "completed") return "done";
  if (appointment.status === "cancelled") return "cancelled";
  if (appointment.status === "no_show") return "no_show";
  return new Date(appointment.ends_at).getTime() <= now.getTime() ? "pending" : "upcoming";
}

/** Faixa de horas exibida na grade: 8h–18h no mínimo, ampliada se houver atendimento fora disso. */
export function hourRangeFor(startsAt: string[]): { first: number; last: number } {
  let first = 8;
  let last = 18;
  for (const iso of startsAt) {
    const hour = hourOf(iso);
    if (hour < first) first = hour;
    if (hour > last) last = hour;
  }
  return { first, last };
}
