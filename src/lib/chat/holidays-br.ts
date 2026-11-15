/**
 * Chat AI — feriados nacionais do Brasil (tabela própria, pura, sem biblioteca).
 * Fixos + os que dependem da Páscoa (Sexta-feira Santa, Carnaval, Corpus Christi). Feriados estaduais e municipais NÃO entram aqui:
 * dependem da cidade da empresa e ganham cadastro próprio do dono (precisa de tabela no banco).
 * Datas em "YYYY-MM-DD".
 */

export interface Holiday {
  date: string;
  name: string;
  /** "feriado" = nacional; "facultativo" = ponto facultativo nacional (Carnaval, Corpus Christi) */
  kind: "feriado" | "facultativo";
}

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher, calendário gregoriano). */
export function easterSunday(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return ymd(year, month, day);
}

const shift = (date: string, days: number): string => {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
};

/** Feriados e pontos facultativos nacionais do ano, em ordem de data. */
export function holidaysBr(year: number): Holiday[] {
  const easter = easterSunday(year);
  const list: Holiday[] = [
    { date: ymd(year, 1, 1), name: "Confraternização Universal", kind: "feriado" },
    { date: shift(easter, -48), name: "Carnaval (segunda-feira)", kind: "facultativo" },
    { date: shift(easter, -47), name: "Carnaval (terça-feira)", kind: "facultativo" },
    { date: shift(easter, -2), name: "Sexta-feira Santa", kind: "feriado" },
    { date: ymd(year, 4, 21), name: "Tiradentes", kind: "feriado" },
    { date: ymd(year, 5, 1), name: "Dia do Trabalho", kind: "feriado" },
    { date: shift(easter, 60), name: "Corpus Christi", kind: "facultativo" },
    { date: ymd(year, 9, 7), name: "Independência do Brasil", kind: "feriado" },
    { date: ymd(year, 10, 12), name: "Nossa Senhora Aparecida", kind: "feriado" },
    { date: ymd(year, 11, 2), name: "Finados", kind: "feriado" },
    { date: ymd(year, 11, 15), name: "Proclamação da República", kind: "feriado" },
  ];
  // Consciência Negra virou feriado NACIONAL em 2024 (Lei 14.759/2023)
  if (year >= 2024) list.push({ date: ymd(year, 11, 20), name: "Dia da Consciência Negra", kind: "feriado" });
  list.push({ date: ymd(year, 12, 25), name: "Natal", kind: "feriado" });
  return list.sort((x, y) => x.date.localeCompare(y.date));
}

/** O feriado/ponto facultativo nacional desse dia, ou null. */
export function holidayOn(date: string): Holiday | null {
  const year = Number(date.slice(0, 4));
  if (!Number.isInteger(year)) return null;
  return holidaysBr(year).find((h) => h.date === date) ?? null;
}

/** Aviso em português para mostrar no resumo, ou null. */
export function holidayWarning(date: string, weekdayLabel: string): string | null {
  const h = holidayOn(date);
  if (!h) return null;
  return h.kind === "feriado"
    ? `${weekdayLabel} é feriado nacional (${h.name}). Confirme se a empresa atende nesse dia.`
    : `${weekdayLabel} é ponto facultativo (${h.name}). Confirme se a empresa atende nesse dia.`;
}
