/**
 * RH — regras de calendário de pagamento, SEM dependências (sem React nem alias `@/`) para serem testadas em Node.
 * Datas são sempre "AAAA-MM-DD" (data-calendário em São Paulo); nunca `new Date("AAAA-MM-DD")` com fuso local.
 */

export type PayFrequency = "daily" | "weekly" | "biweekly" | "monthly";

export interface PaySchedule {
  pay_frequency: PayFrequency;
  /** 0 = domingo … 6 = sábado (semanal). */
  pay_weekday: number | null;
  /** Mensal: 1–31; quinzenal: 1–15 (paga nesse dia e 15 dias depois). */
  pay_day_of_month: number | null;
}

export const WEEKDAY_NAMES = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"] as const;

export const FREQUENCY_LABELS: Record<PayFrequency, string> = {
  daily: "Diário",
  weekly: "Semanal",
  biweekly: "Quinzenal",
  monthly: "Mensal",
};

function parse(date: string): { y: number; m: number; d: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) throw new Error(`Data inválida: ${date}`);
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
}

function format(y: number, m: number, d: number): string {
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function addDays(date: string, days: number): string {
  const { y, m, d } = parse(date);
  const next = new Date(Date.UTC(y, m - 1, d + days));
  return format(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate());
}

/** 0 = domingo … 6 = sábado. */
export function weekdayOf(date: string): number {
  const { y, m, d } = parse(date);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Diferença em dias (b − a). */
export function diffDays(a: string, b: string): number {
  const pa = parse(a);
  const pb = parse(b);
  return Math.round((Date.UTC(pb.y, pb.m - 1, pb.d) - Date.UTC(pa.y, pa.m - 1, pa.d)) / 86_400_000);
}

/** Dia do mês pedido, ajustado ao último dia quando o mês é mais curto (dia 31 em fevereiro → 28/29). */
function clampedDay(year: number, month: number, day: number): number {
  return Math.min(day, daysInMonth(year, month));
}

/** Datas de pagamento de um mês (1 para semanal/mensal-diário não se aplica; usado para mensal e quinzenal). */
function monthPaydays(schedule: PaySchedule, year: number, month: number): number[] {
  const day = schedule.pay_day_of_month ?? 1;
  if (schedule.pay_frequency === "monthly") return [clampedDay(year, month, day)];
  // quinzenal: dia X e X+15 (limitado ao fim do mês)
  const first = clampedDay(year, month, day);
  const second = clampedDay(year, month, day + 15);
  return first === second ? [first] : [first, second];
}

/** Próximo dia de pagamento em ou depois de `from`. */
export function nextPayday(schedule: PaySchedule, from: string): string {
  switch (schedule.pay_frequency) {
    case "daily":
      return from;
    case "weekly": {
      const target = schedule.pay_weekday ?? 5;
      const delta = (target - weekdayOf(from) + 7) % 7;
      return addDays(from, delta);
    }
    case "monthly":
    case "biweekly": {
      const { y, m } = parse(from);
      for (let offset = 0; offset < 3; offset += 1) {
        const month0 = m - 1 + offset;
        const year = y + Math.floor(month0 / 12);
        const month = (month0 % 12) + 1;
        for (const day of monthPaydays(schedule, year, month)) {
          const candidate = format(year, month, day);
          if (candidate >= from) return candidate;
        }
      }
      return from;
    }
  }
}

/** Texto curto para a tela: "Toda sexta-feira", "Todo dia 5", "Dias 5 e 20", "Todo dia trabalhado". */
export function paydayLabel(schedule: PaySchedule): string {
  switch (schedule.pay_frequency) {
    case "daily":
      return "No dia, ao fim do trabalho";
    case "weekly": {
      const weekday = schedule.pay_weekday ?? 5;
      return `${weekday === 0 || weekday === 6 ? "Todo" : "Toda"} ${WEEKDAY_NAMES[weekday]}`;
    }
    case "monthly":
      return `Todo dia ${schedule.pay_day_of_month ?? 1}`;
    case "biweekly": {
      const first = schedule.pay_day_of_month ?? 1;
      return `Dias ${first} e ${first + 15}`;
    }
  }
}

/**
 * Sugestão de período para fechar: começa no dia seguinte ao último período fechado (ou no primeiro dia ainda sem
 * pagamento com presença marcada, ou 6 dias atrás) e termina hoje. A pessoa pode ajustar as datas.
 */
export function suggestPeriod(input: { lastClosedEnd: string | null; earliestUnsettled: string | null; today: string }): { start: string; end: string } {
  const { lastClosedEnd, earliestUnsettled, today } = input;
  let start: string;
  if (lastClosedEnd) start = addDays(lastClosedEnd, 1);
  else if (earliestUnsettled) start = earliestUnsettled;
  else start = addDays(today, -6);
  if (start > today) start = today;
  return { start, end: today };
}

/** Situação do pagamento em relação a hoje, para destacar atrasos. */
export function dueState(dueOn: string, today: string): "overdue" | "today" | "upcoming" {
  if (dueOn < today) return "overdue";
  if (dueOn === today) return "today";
  return "upcoming";
}

/** O aniversário (mês/dia) cai neste mês? */
export function hasBirthdayInMonth(birthDate: string | null, today: string): boolean {
  if (!birthDate) return false;
  return parse(birthDate).m === parse(today).m;
}

/** Dias inteiros e meios dias já formatados: 2.5 → "2,5". */
export function formatDays(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(".", ",");
}
