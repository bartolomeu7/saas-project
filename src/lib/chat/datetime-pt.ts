import { norm } from "./text.ts";
import { spokenNumbersToDigits, wordsToNumber } from "./numbers-pt.ts";

/**
 * Chat AI — datas e horas em português do Brasil, em texto simples (YYYY-MM-DD e HH:mm, horário de São Paulo).
 *
 * Escrito do zero porque, na prova de conceito de 11/11/2026, o chrono-node (locale pt) ignorava "às 14h" e o
 * Recognizers-Text não devolvia a data de "amanhã". A gramática de agendamento é pequena e fechada, então um
 * interpretador próprio, testado frase a frase, é mais previsível.
 *
 * Regra de ouro: na dúvida, NÃO escolhe — devolve `candidates`/`dayPart` para a Cláudia perguntar.
 */

export interface ChatClock {
  /** hoje em São Paulo, YYYY-MM-DD */
  today: string;
  /** minutos desde 00:00 agora em São Paulo (0..1439) */
  nowMinutes: number;
}

export interface ParsedDate {
  value: string;
  /** mais de uma leitura possível: perguntar (ex.: "sexta" dita numa sexta) */
  candidates?: string[];
  kind: "relativa" | "dia-da-semana" | "dia-do-mes" | "data" | "daqui-a";
}

export interface ParsedTime {
  value: string;
  /** "às 2" pode ser 02:00 ou 14:00: perguntar */
  candidates?: string[];
}

export interface ParsedDateTime {
  date?: ParsedDate;
  time?: ParsedTime;
  /** fim informado ("das 14 às 16") */
  endTime?: string;
  /** "de tarde" sem hora: precisa perguntar a hora */
  dayPart?: "manha" | "tarde" | "noite" | "madrugada";
  problems: string[];
}

// ------------------------------------------------------------------ datas (aritmética sem fuso)
const pad = (n: number) => String(n).padStart(2, "0");
const fmt = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

function parseYmd(s: string): { y: number; m: number; d: number } {
  const [y, m, d] = s.split("-").map(Number) as [number, number, number];
  return { y, m, d };
}

export function daysInMonthOf(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function isValidYmd(y: number, m: number, d: number): boolean {
  return m >= 1 && m <= 12 && d >= 1 && d <= daysInMonthOf(y, m);
}

export function addDays(date: string, n: number): string {
  const { y, m, d } = parseYmd(date);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return fmt(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

/** 0 = domingo … 6 = sábado */
export function weekdayOf(date: string): number {
  const { y, m, d } = parseYmd(date);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export const WEEKDAY_NAMES = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
export const MONTH_NAMES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

/** "2026-11-12" → "quinta-feira, 12/11/2026" */
export function formatDatePt(date: string): string {
  const { y, m, d } = parseYmd(date);
  return `${WEEKDAY_NAMES[weekdayOf(date)]}, ${pad(d)}/${pad(m)}/${y}`;
}

export function addMinutesToLocal(date: string, time: string, minutes: number): { date: string; time: string } {
  const [h, mi] = time.split(":").map(Number) as [number, number];
  const total = h * 60 + mi + minutes;
  const dayShift = Math.floor(total / 1440);
  const rest = ((total % 1440) + 1440) % 1440;
  return { date: addDays(date, dayShift), time: `${pad(Math.floor(rest / 60))}:${pad(rest % 60)}` };
}

export function minutesOf(time: string): number {
  const [h, m] = time.split(":").map(Number) as [number, number];
  return h * 60 + m;
}

// ------------------------------------------------------------------ interpretação
const MONTHS: Record<string, number> = {
  janeiro: 1, fevereiro: 2, marco: 3, abril: 4, maio: 5, junho: 6, julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
};
const WEEKDAYS: Record<string, number> = { domingo: 0, segunda: 1, terca: 2, quarta: 3, quinta: 4, sexta: 5, sabado: 6 };
const MONTH_RE = Object.keys(MONTHS).join("|");

function numberFromToken(token: string): number | null {
  if (/^\d+$/.test(token)) return Number(token);
  return wordsToNumber([token]);
}

function resolveDayOfMonth(clock: ChatClock, day: number, month?: number, year?: number): ParsedDate | string {
  const { y, m, d } = parseYmd(clock.today);
  if (year !== undefined && month !== undefined) {
    if (!isValidYmd(year, month, day)) return `Data inválida: ${pad(day)}/${pad(month)}/${year}.`;
    return { value: fmt(year, month, day), kind: "data" };
  }
  if (month !== undefined) {
    if (!isValidYmd(y, month, day)) return `Data inválida: ${pad(day)}/${pad(month)}.`;
    let candidate = fmt(y, month, day);
    if (candidate < clock.today) {
      if (!isValidYmd(y + 1, month, day)) return `Data inválida: ${pad(day)}/${pad(month)}.`;
      candidate = fmt(y + 1, month, day);
    }
    return { value: candidate, kind: "data" };
  }
  // só "dia N": próxima ocorrência a partir de hoje
  let yy = y;
  let mm = m;
  for (let i = 0; i < 14; i += 1) {
    if (isValidYmd(yy, mm, day) && fmt(yy, mm, day) >= clock.today) return { value: fmt(yy, mm, day), kind: "dia-do-mes" };
    mm += 1;
    if (mm > 12) {
      mm = 1;
      yy += 1;
    }
  }
  return `Data inválida: dia ${day}.`;
}

function parseDate(t: string, clock: ChatClock, problems: string[]): ParsedDate | undefined {
  // daqui a N dias / semanas
  const dq = /\bdaqui a (\w+) (dia|dias|semana|semanas)\b/.exec(t);
  if (dq) {
    const n = numberFromToken(dq[1]!);
    if (n !== null) return { value: addDays(clock.today, dq[2]!.startsWith("semana") ? n * 7 : n), kind: "daqui-a" };
  }
  if (/\bdepois de amanha\b/.test(t)) return { value: addDays(clock.today, 2), kind: "relativa" };
  if (/\bamanha\b/.test(t)) return { value: addDays(clock.today, 1), kind: "relativa" };
  if (/\bhoje\b/.test(t)) return { value: clock.today, kind: "relativa" };
  if (/\bontem\b/.test(t)) return { value: addDays(clock.today, -1), kind: "relativa" };

  // 15/11, 15/11/2026
  const slash = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/.exec(t);
  if (slash) {
    const year = slash[3] ? (slash[3].length === 2 ? 2000 + Number(slash[3]) : Number(slash[3])) : undefined;
    const r = resolveDayOfMonth(clock, Number(slash[1]), Number(slash[2]), year);
    if (typeof r === "string") {
      problems.push(r);
      return undefined;
    }
    return r;
  }

  // 15 de novembro (de 2026) | dia 15 de novembro
  const named = new RegExp(`\\b(\\d{1,2}) de (${MONTH_RE})(?: de (\\d{4}))?\\b`).exec(t);
  if (named) {
    const r = resolveDayOfMonth(clock, Number(named[1]), MONTHS[named[2]!]!, named[3] ? Number(named[3]) : undefined);
    if (typeof r === "string") {
      problems.push(r);
      return undefined;
    }
    return r;
  }

  // dia 15
  const dia = /\bdia (\d{1,2})\b/.exec(t);
  if (dia) {
    const r = resolveDayOfMonth(clock, Number(dia[1]));
    if (typeof r === "string") {
      problems.push(r);
      return undefined;
    }
    return r;
  }

  // dia da semana
  const wd = /\b(domingo|segunda|terca|quarta|quinta|sexta|sabado)(?: feira)?\b/.exec(t);
  if (wd) {
    const target = WEEKDAYS[wd[1]!]!;
    const todayWd = weekdayOf(clock.today);
    const diff = (target - todayWd + 7) % 7;
    if (diff === 0) {
      return { value: addDays(clock.today, 7), candidates: [clock.today, addDays(clock.today, 7)], kind: "dia-da-semana" };
    }
    return { value: addDays(clock.today, diff), kind: "dia-da-semana" };
  }
  return undefined;
}

type DayPart = "manha" | "tarde" | "noite" | "madrugada";

function detectDayPart(t: string): DayPart | undefined {
  if (/\b(da|de|pela) manha\b/.test(t) || /\bmanha\b/.test(t)) return "manha";
  if (/\b(da|de|pela) tarde\b/.test(t) || /\btarde\b/.test(t)) return "tarde";
  if (/\b(da|de|pela) noite\b/.test(t) || /\bnoite\b/.test(t)) return "noite";
  if (/\bmadrugada\b/.test(t)) return "madrugada";
  return undefined;
}

function applyDayPart(hour: number, part: DayPart | undefined): number {
  if (!part) return hour;
  if (part === "tarde") return hour < 12 ? hour + 12 : hour;
  if (part === "noite") return hour === 12 ? 0 : hour < 12 ? hour + 12 : hour;
  return hour; // manhã e madrugada: como foi dito
}

const MINUTE_WORDS: Record<string, number> = { meia: 30, quinze: 15, "quarenta e cinco": 45, "dez": 10, "vinte": 20, "vinte e cinco": 25, "trinta": 30, "quarenta": 40, "cinquenta": 50 };

function minutesFromSuffix(s: string | undefined): number | null {
  if (!s) return 0;
  if (/^\d{1,2}$/.test(s)) return Number(s);
  return MINUTE_WORDS[s] ?? null;
}

function buildTime(hour: number, minute: number, hasPeriod: boolean, explicitH: boolean, problems: string[]): ParsedTime | undefined {
  if (hour > 23 || minute > 59) {
    problems.push(`Horário inválido: ${pad(hour)}:${pad(minute)}.`);
    return undefined;
  }
  // 1 a 6 sem período e sem "13+" é ambíguo (02:00 ou 14:00); 7 a 12 vale como foi dito; "0h" é meia-noite
  if (!hasPeriod && hour >= 1 && hour <= 6) {
    return { value: `${pad(hour)}:${pad(minute)}`, candidates: [`${pad(hour)}:${pad(minute)}`, `${pad(hour + 12)}:${pad(minute)}`] };
  }
  void explicitH;
  return { value: `${pad(hour)}:${pad(minute)}` };
}

function parseTime(t: string, clock: ChatClock, part: DayPart | undefined, problems: string[]): { time?: ParsedTime; endTime?: string; date?: ParsedDate } {
  // daqui a N horas / minutos  → também define a data
  const dq = /\bdaqui a (\w+) (hora|horas|minuto|minutos)\b/.exec(t);
  if (dq) {
    const n = numberFromToken(dq[1]!);
    if (n !== null) {
      const delta = dq[2]!.startsWith("hora") ? n * 60 : n;
      const r = addMinutesToLocal(clock.today, `${pad(Math.floor(clock.nowMinutes / 60))}:${pad(clock.nowMinutes % 60)}`, delta);
      return { time: { value: r.time }, date: { value: r.date, kind: "daqui-a" } };
    }
  }

  if (/\bmeio dia\b/.test(t)) return { time: { value: "12:00" } };
  if (/\bmeia noite\b/.test(t)) return { time: { value: "00:00" } };

  // intervalo: "das 14 as 16", "de 14h as 16h30", "das 9 ate 11"
  const range = /\b(?:das|de)\s+(\d{1,2})(?:\s*h\s*(\d{2})?|:(\d{2}))?\s*(?:horas)?\s+(?:as|ate|a)\s+(\d{1,2})(?:\s*h\s*(\d{2})?|:(\d{2}))?/.exec(t);
  if (range) {
    const h1 = Number(range[1]);
    const m1 = Number(range[2] ?? range[3] ?? 0);
    const h2 = Number(range[4]);
    const m2 = Number(range[5] ?? range[6] ?? 0);
    const start = buildTime(applyDayPart(h1, part), m1, !!part || h1 >= 7, true, problems);
    const endHour = part ? applyDayPart(h2, part) : h2 < h1 && h2 < 12 ? h2 + 12 : h2;
    const end = buildTime(endHour, m2, true, true, problems);
    if (start && end) return { time: start, endTime: end.value };
    return {};
  }

  // 14:30
  const colon = /\b(\d{1,2}):(\d{2})\b/.exec(t);
  if (colon) {
    const h = applyDayPart(Number(colon[1]), part);
    const time = buildTime(h, Number(colon[2]), !!part || Number(colon[1]) >= 7, true, problems);
    return time ? { time } : {};
  }

  // 14h | 14h30 | 14 horas
  const hm = /\b(\d{1,2})\s*(?:h|horas?)\s*(\d{2})?\b/.exec(t);
  if (hm) {
    const raw = Number(hm[1]);
    const h = applyDayPart(raw, part);
    const time = buildTime(h, Number(hm[2] ?? 0), !!part || raw >= 7, true, problems);
    return time ? { time } : {};
  }

  // "as 2", "as 14 e meia", "as 2 e 30", "as 9 e quinze"
  const as = /\bas (\d{1,2})(?: e (meia|quinze|quarenta e cinco|\d{1,2}))?\b(?!\s*\/)/.exec(t);
  if (as) {
    const raw = Number(as[1]);
    const minute = minutesFromSuffix(as[2]);
    if (minute === null) return {};
    const h = applyDayPart(raw, part);
    const time = buildTime(h, minute, !!part || raw >= 7, false, problems);
    return time ? { time } : {};
  }
  return {};
}

/**
 * Lê data e hora de uma frase. `clock` = agora em São Paulo.
 * Nunca lança erro; problemas viram `problems` (texto para o usuário).
 */
export function parseDateTimePt(text: string, clock: ChatClock): ParsedDateTime {
  // o ditado por voz devolve "às dez horas"; vira "às 10 horas" só onde é data/hora
  const t = spokenNumbersToDigits(norm(text).replace(/-/g, " "));
  const problems: string[] = [];
  const result: ParsedDateTime = { problems };

  const part = detectDayPart(t);
  const time = parseTime(t, clock, part, problems);
  const date = time.date ?? parseDate(t, clock, problems);

  if (date) result.date = date;
  if (time.time) result.time = time.time;
  if (time.endTime) result.endTime = time.endTime;
  if (part && !time.time) result.dayPart = part;
  return result;
}
