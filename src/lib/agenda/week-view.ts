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

/* ------------------------------------------------------------------------------------------------------------------
 * Linha do tempo: cada atendimento ocupa uma altura proporcional à duração e, quando dois se sobrepõem no mesmo dia
 * (ou na mesma coluna de profissional), ficam lado a lado em vez de um por cima do outro.
 * ---------------------------------------------------------------------------------------------------------------- */

/** Minutos desde 00:00 (horário de São Paulo) do instante informado. */
export function minutesOfDay(iso: string): number {
  const clock = saoPauloClock(new Date(iso));
  return clock.getUTCHours() * 60 + clock.getUTCMinutes();
}

/** Altura (em minutos) de um atendimento; nunca menos de 15 para o bloco continuar clicável e legível. */
export function durationMinutes(item: { starts_at: string; ends_at: string }): number {
  const minutes = Math.round((new Date(item.ends_at).getTime() - new Date(item.starts_at).getTime()) / 60000);
  return Math.max(15, minutes);
}

export interface TimelineBlock<T> {
  item: T;
  /** Início em minutos desde 00:00. */
  startMin: number;
  /** Fim em minutos desde 00:00 (limitado a 24h: atendimento que passa da meia-noite é cortado no fim do dia). */
  endMin: number;
  /** Faixa (0, 1, 2…) em que o bloco fica quando há sobreposição. */
  lane: number;
  /** Quantas faixas o grupo de atendimentos sobrepostos tem (o bloco ocupa 1/lanes da largura). */
  lanes: number;
}

/**
 * Posiciona os atendimentos de UM dia/coluna. Quem se sobrepõe forma um grupo; dentro do grupo, cada atendimento vai
 * para a primeira faixa livre (ordem de início; empate: o mais longo primeiro). Atendimentos que apenas se tocam
 * (um termina exatamente quando o outro começa) NÃO se sobrepõem.
 */
export function layoutTimeline<T extends { starts_at: string; ends_at: string }>(items: readonly T[]): TimelineBlock<T>[] {
  const sorted = items
    .map((item) => {
      const startMin = minutesOfDay(item.starts_at);
      return { item, startMin, endMin: Math.min(1440, startMin + durationMinutes(item)) };
    })
    .sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin);

  const result: TimelineBlock<T>[] = [];
  let group: TimelineBlock<T>[] = [];
  let groupEnd = -1;
  let laneEnds: number[] = [];

  const closeGroup = () => {
    const lanes = Math.max(1, laneEnds.length);
    for (const block of group) block.lanes = lanes;
    result.push(...group);
    group = [];
    laneEnds = [];
    groupEnd = -1;
  };

  for (const entry of sorted) {
    if (group.length && entry.startMin >= groupEnd) closeGroup();
    let lane = laneEnds.findIndex((end) => end <= entry.startMin);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(entry.endMin);
    } else {
      laneEnds[lane] = entry.endMin;
    }
    group.push({ ...entry, lane, lanes: 1 });
    groupEnd = Math.max(groupEnd, entry.endMin);
  }
  if (group.length) closeGroup();
  return result;
}

/**
 * Faixa de horas da grade (inteiras): de 8h a 18h no mínimo, ampliada para caber qualquer atendimento
 * (do começo da primeira hora ao fim da última, arredondado para cima).
 */
export function timelineHourRange(items: readonly { starts_at: string; ends_at: string }[]): { first: number; last: number } {
  let first = 8;
  let last = 18;
  for (const item of items) {
    const startMin = minutesOfDay(item.starts_at);
    const endMin = Math.min(1440, startMin + durationMinutes(item));
    first = Math.min(first, Math.floor(startMin / 60));
    last = Math.max(last, Math.ceil(endMin / 60));
  }
  return { first: Math.max(0, first), last: Math.min(24, last) };
}

/** Posição vertical (0–100% da altura da grade) do instante, ou null se ficar fora da faixa exibida. */
export function timelinePercent(minutes: number, range: { first: number; last: number }): number | null {
  const start = range.first * 60;
  const end = range.last * 60;
  if (minutes < start || minutes > end) return null;
  return ((minutes - start) / (end - start)) * 100;
}

/** Dia e minuto de "agora" em São Paulo. */
export function nowInSaoPaulo(now: Date): { date: string; minutes: number } {
  return { date: dateKeyOf(now), minutes: minutesOfDay(now.toISOString()) };
}

/* ------------------------------------------------------------------------------------------------------------------
 * Visão de mês e busca
 * ---------------------------------------------------------------------------------------------------------------- */

const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
] as const;

/** "Novembro de 2026" */
export function monthLabel(dateValue: string): string {
  const [year = 1970, month = 1] = dateValue.split("-").map(Number);
  return `${MONTH_NAMES[month - 1] ?? ""} de ${year}`;
}

/** Soma meses mantendo o dia (31/01 + 1 mês = 28/02, nunca 03/03). */
export function addMonthsToDateString(dateValue: string, amount: number): string {
  const [year = 1970, month = 1, day = 1] = dateValue.split("-").map(Number);
  const target = new Date(Date.UTC(year, month - 1 + amount, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  const clamped = Math.min(day, lastDay);
  return `${target.getUTCFullYear()}-${String(target.getUTCMonth() + 1).padStart(2, "0")}-${String(clamped).padStart(2, "0")}`;
}

export interface MonthGrid {
  /** Primeiro e último dia do mês. */
  monthStart: string;
  monthEnd: string;
  /** Domingo da primeira semana e sábado da última (a grade mostra semanas inteiras). */
  gridStart: string;
  gridEnd: string;
  /** Todos os dias da grade, em ordem (múltiplo de 7: 28, 35 ou 42). */
  days: string[];
}

export function monthGrid(dateValue: string): MonthGrid {
  const [year = 1970, month = 1] = dateValue.split("-").map(Number);
  const monthStart = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const monthEnd = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  const gridStart = weekStartSunday(monthStart);
  const gridEnd = addDaysToDateString(weekStartSunday(monthEnd), 6);
  const days: string[] = [];
  for (let day = gridStart; day <= gridEnd; day = addDaysToDateString(day, 1)) days.push(day);
  return { monthStart, monthEnd, gridStart, gridEnd, days };
}

/** Limites reais (UTC) de um intervalo de dias de São Paulo, ambos inclusive, para consultar o banco. */
export function dateRangeIso(start: string, end: string): { fromIso: string; toIso: string } {
  return { fromIso: startOfDayFromDateString(start).toISOString(), toIso: endOfDayFromDateString(end).toISOString() };
}

/** Minúsculas e sem acento: "João" encontra "joao". */
export function normalizeSearch(text: string): string {
  // \p{M} = marcas combinantes (acentos) depois de separar as letras acentuadas (NFD)
  return text.normalize("NFD").replace(/\p{M}+/gu, "").toLowerCase().trim();
}

/** O atendimento combina com a busca? (cliente, serviço, profissional ou observação; todas as palavras precisam aparecer) */
export function matchesSearch(
  appointment: { service_name?: string | null; customer_name?: string | null; professional_name?: string | null; notes?: string | null },
  query: string
): boolean {
  const terms = normalizeSearch(query).split(/\s+/).filter(Boolean);
  if (!terms.length) return true;
  const haystack = normalizeSearch(
    [appointment.customer_name, appointment.service_name, appointment.professional_name, appointment.notes].filter(Boolean).join(" ")
  );
  return terms.every((term) => haystack.includes(term));
}
