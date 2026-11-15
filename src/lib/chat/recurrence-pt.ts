import * as rruleNs from "rrule";
import { norm } from "./text.ts";
import { isNumberWord, wordsToNumber } from "./numbers-pt.ts";

/**
 * Chat AI — recorrência em português ("toda terça por 8 semanas", "todo dia 5 por 3 meses", "a cada 15 dias, 4 vezes", "quinzenal").
 * Regras puras (sem IA, sem rede). A expansão das datas usa a biblioteca rrule (padrão iCalendar). Máximo de 12 datas por pedido.
 */

// rrule é CommonJS com build ESM: no Next (webpack) vale o export nomeado; no Node (testes) ele vem em `default`. Funciona nos dois.
type RRuleCtor = typeof import("rrule").RRule;
const ns = rruleNs as unknown as { RRule?: RRuleCtor; default?: { RRule?: RRuleCtor } };
const RRule = (ns.RRule ?? ns.default?.RRule) as RRuleCtor;

export const MAX_OCCURRENCES = 12;

export interface Recurrence {
  freq: "daily" | "weekly" | "monthly";
  interval: number;
  /** dia da semana citado ("toda terça"): 0=domingo … 6=sábado */
  weekday?: number;
  /** dia do mês citado ("todo dia 5") */
  monthday?: number;
  /** quanto tempo/quantas vezes a pessoa pediu (ainda sem converter) */
  limit?: { n: number; unit: "vezes" | "semanas" | "meses" | "dias" };
  /** data final citada ("até 20/12"), já em YYYY-MM-DD quando o motor conseguiu ler */
  until?: string;
}

const WEEKDAYS: Record<string, number> = { domingo: 0, segunda: 1, terca: 2, quarta: 3, quinta: 4, sexta: 5, sabado: 6 };

/** "oito semanas" → "8 semanas" (só antes de unidades de tempo/vezes). */
function digitizeBeforeUnits(t: string): string {
  const words = t.split(" ").filter(Boolean);
  const out: string[] = [];
  let i = 0;
  while (i < words.length) {
    if (isNumberWord(words[i]!) && words[i] !== "mil") {
      let j = i;
      while (j + 1 < words.length && (isNumberWord(words[j + 1]!) || (words[j + 1] === "e" && j + 2 < words.length && isNumberWord(words[j + 2]!)))) j += 1;
      const value = wordsToNumber(words.slice(i, j + 1));
      const next = words[j + 1] ?? "";
      if (value !== null && /^(vezes|vez|semanas?|meses|mes|dias?|em)$/.test(next)) {
        out.push(String(value));
        i = j + 1;
        continue;
      }
    }
    out.push(words[i]!);
    i += 1;
  }
  return out.join(" ");
}

const UNIT: Record<string, "dias" | "semanas" | "meses"> = { dia: "dias", dias: "dias", semana: "semanas", semanas: "semanas", mes: "meses", meses: "meses" };

/** Entende o ritmo e (se houver) o limite. null se a frase não pede repetição. */
export function parseRecurrence(text: string): Recurrence | null {
  const t = digitizeBeforeUnits(norm(text).replace(/[,;]/g, " ").replace(/\s+/g, " "));
  let rec: Recurrence | null = null;

  let m = /\bde (\d+) em \1 (dias?|semanas?|meses|mes)\b/.exec(t);
  if (m) rec = { freq: UNIT[m[2]!] === "dias" ? "daily" : UNIT[m[2]!] === "semanas" ? "weekly" : "monthly", interval: Math.max(1, Number(m[1])) };
  if (!rec && (m = /\ba cada (\d+) (dias?|semanas?|meses|mes)\b/.exec(t))) rec = { freq: UNIT[m[2]!] === "dias" ? "daily" : UNIT[m[2]!] === "semanas" ? "weekly" : "monthly", interval: Math.max(1, Number(m[1])) };
  if (!rec && /\bquinzena(l|lmente)\b/.test(t)) rec = { freq: "weekly", interval: 2 };
  if (!rec && (m = /\b(?:toda|todas as|todos os|cada)\s+(semana|segunda|terca|quarta|quinta|sexta|sabado|domingo)s?\b/.exec(t))) {
    rec = { freq: "weekly", interval: 1, ...(m[1] !== "semana" ? { weekday: WEEKDAYS[m[1]!]! } : {}) };
  }
  if (!rec && /\bsemanal(mente)?\b/.test(t)) rec = { freq: "weekly", interval: 1 };
  if (!rec && (m = /\btodo dia (\d{1,2})\b/.exec(t))) rec = { freq: "monthly", interval: 1, monthday: Math.min(31, Math.max(1, Number(m[1]))) };
  if (!rec && /\b(mensal(mente)?|todo mes|todos os meses)\b/.test(t)) rec = { freq: "monthly", interval: 1 };
  if (!rec && /\b(todos os dias|todo dia|diari(o|amente))\b/.test(t)) rec = { freq: "daily", interval: 1 };
  if (!rec) return null;

  const lim = /\b(?:por|durante)\s+(\d+)\s+(vezes|vez|semanas?|meses|mes|dias?)\b/.exec(t) ?? /\b(\d+)\s+(vezes|vez)\b/.exec(t);
  if (lim) {
    const raw = lim[2]!;
    const n = Number(lim[1]);
    if (n >= 1) rec.limit = { n, unit: raw.startsWith("vez") ? "vezes" : UNIT[raw]! };
  }
  return rec;
}

/** Texto curto para o resumo: "toda terça", "a cada 15 dias", "todo dia 5". */
export function describeRecurrence(rec: Recurrence): string {
  const names = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
  if (rec.freq === "weekly") {
    if (rec.interval === 2) return "a cada 2 semanas";
    if (rec.interval > 2) return `a cada ${rec.interval} semanas`;
    return rec.weekday !== undefined ? `toda ${names[rec.weekday]}` : "toda semana";
  }
  if (rec.freq === "monthly") return rec.interval > 1 ? `a cada ${rec.interval} meses` : rec.monthday ? `todo dia ${rec.monthday}` : "todo mês";
  return rec.interval > 1 ? `a cada ${rec.interval} dias` : "todo dia";
}

const ymdParts = (d: string) => d.split("-").map(Number) as [number, number, number];
const utc = (d: string) => {
  const [y, m, day] = ymdParts(d);
  return new Date(Date.UTC(y, m - 1, day, 12));
};
const fmt = (date: Date) => date.toISOString().slice(0, 10);

export function addMonthsYmd(d: string, months: number): string {
  const [y, m, day] = ymdParts(d);
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  const last = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  return `${ny}-${String(nm).padStart(2, "0")}-${String(Math.min(day, last)).padStart(2, "0")}`;
}

const DAY = 86_400_000;
/** start + n dias, menos 1: "por 1 semana" começando segunda termina no domingo (7 dias no total). */
const endAfterDays = (start: string, n: number) => fmt(new Date(utc(start).getTime() + (n - 1) * DAY));
const endAfterMonths = (start: string, n: number) => fmt(new Date(utc(addMonthsYmd(start, n)).getTime() - DAY));

/** Transforma o limite pedido em "quantas vezes" ou "até que dia" (o último dia incluído). */
export function resolveLimit(start: string, rec: Recurrence): { count?: number; until?: string } {
  if (rec.until) return { until: rec.until };
  if (!rec.limit) return {};
  const { n, unit } = rec.limit;
  if (unit === "vezes") return { count: n };
  if (rec.freq === "weekly") {
    if (unit === "semanas") return { count: Math.ceil(n / rec.interval) };
    if (unit === "meses") return { until: endAfterMonths(start, n) };
    return { until: endAfterDays(start, n) };
  }
  if (rec.freq === "monthly") {
    if (unit === "meses") return { count: Math.ceil(n / rec.interval) };
    return { until: endAfterDays(start, unit === "semanas" ? n * 7 : n) };
  }
  // daily
  if (unit === "dias") return { count: Math.ceil(n / rec.interval) };
  if (unit === "semanas") return { until: endAfterDays(start, n * 7) };
  return { until: endAfterMonths(start, n) };
}

/** Datas da série (a primeira é sempre `start`), no máximo MAX_OCCURRENCES. Sem limite informado devolve só a primeira. */
export function expandRecurrence(start: string, rec: Recurrence): { dates: string[]; capped: boolean } {
  const lim = resolveLimit(start, rec);
  if (lim.count === undefined && lim.until === undefined) return { dates: [start], capped: false };
  const wanted = lim.count !== undefined ? Math.max(1, lim.count) : MAX_OCCURRENCES + 1;
  const dtstart = utc(start);
  const rule = new RRule({
    freq: rec.freq === "daily" ? RRule.DAILY : rec.freq === "weekly" ? RRule.WEEKLY : RRule.MONTHLY,
    interval: Math.max(1, rec.interval),
    dtstart,
    count: Math.min(wanted, MAX_OCCURRENCES + 1),
    ...(lim.until ? { until: utc(lim.until) } : {}),
    ...(rec.freq === "weekly" ? { byweekday: [(dtstart.getUTCDay() + 6) % 7] } : {}),
    ...(rec.freq === "monthly" ? { bymonthday: rec.monthday ?? dtstart.getUTCDate() } : {}),
  });
  const all = rule.all().map(fmt);
  const dates = all[0] === start ? all : [start, ...all.filter((d) => d > start)];
  const unique = [...new Set(dates)];
  const capped = unique.length > MAX_OCCURRENCES || (lim.count !== undefined && lim.count > MAX_OCCURRENCES);
  return { dates: unique.slice(0, MAX_OCCURRENCES), capped };
}

/** Resposta curta a "por quantas vezes?": "8", "8 vezes", "por 3 meses", "oito". null se não for um número. */
export function parseLimitAnswer(text: string): Recurrence["limit"] | null {
  const t = digitizeBeforeUnits(norm(text).replace(/[,;.!?]/g, " ").replace(/\s+/g, " ").trim());
  const m = /^(?:por |durante |mais )?(\d{1,3})(?: (vezes|vez|semanas?|meses|mes|dias?))?$/.exec(t);
  if (m) {
    const n = Number(m[1]);
    if (n < 1) return null;
    const raw = m[2];
    return { n, unit: !raw || raw.startsWith("vez") ? "vezes" : UNIT[raw]! };
  }
  const n = wordsToNumber(t.split(" "));
  return n !== null && n >= 1 && n <= 999 ? { n, unit: "vezes" } : null;
}
