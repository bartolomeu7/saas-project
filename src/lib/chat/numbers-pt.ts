import { norm } from "./text.ts";

/**
 * Chat AI — números e dinheiro em português do Brasil.
 * Entende "150", "1.234,56", "R$ 1.234,56", "cento e cinquenta reais", "mil e duzentos", "2 mil", "dois mil e quinhentos".
 * Regra de ouro: um número SEM palavra de moeda não é dinheiro ("limpa-baú de 50 litros" → 50 não é valor).
 */

const UNITS: Record<string, number> = {
  zero: 0, um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10,
  onze: 11, doze: 12, treze: 13, catorze: 14, quatorze: 14, quinze: 15, dezesseis: 16, dezessete: 17, dezoito: 18, dezenove: 19,
};
const TENS: Record<string, number> = { vinte: 20, trinta: 30, quarenta: 40, cinquenta: 50, sessenta: 60, setenta: 70, oitenta: 80, noventa: 90 };
const HUNDREDS: Record<string, number> = {
  cem: 100, cento: 100, duzentos: 200, duzentas: 200, trezentos: 300, trezentas: 300, quatrocentos: 400, quatrocentas: 400,
  quinhentos: 500, quinhentas: 500, seiscentos: 600, seiscentas: 600, setecentos: 700, setecentas: 700, oitocentos: 800,
  oitocentas: 800, novecentos: 900, novecentas: 900,
};

const isNumberWord = (w: string) => w in UNITS || w in TENS || w in HUNDREDS || w === "mil" || w === "milhao" || w === "milhoes";

/** "cento e cinquenta" → 150; null se a sequência não formar número. */
export function wordsToNumber(words: string[]): number | null {
  let total = 0;
  let current = 0;
  let seen = false;
  for (const raw of words) {
    const w = norm(raw);
    if (w === "e") continue;
    if (w in UNITS) current += UNITS[w]!;
    else if (w in TENS) current += TENS[w]!;
    else if (w in HUNDREDS) current += HUNDREDS[w]!;
    else if (w === "mil") {
      total += (current || 1) * 1000;
      current = 0;
    } else if (w === "milhao" || w === "milhoes") {
      total += (current || 1) * 1_000_000;
      current = 0;
    } else return null;
    seen = true;
  }
  return seen ? total + current : null;
}

export interface FoundNumber {
  value: number;
  /** índice da primeira e da última palavra usadas (na lista de palavras do texto normalizado) */
  from: number;
  to: number;
}

/** Procura sequências de números por extenso no texto ("mil e duzentos"). */
export function findNumberWords(text: string): FoundNumber[] {
  const words = norm(text).split(/[^a-z0-9,.$]+/).filter(Boolean);
  const found: FoundNumber[] = [];
  let i = 0;
  while (i < words.length) {
    if (!isNumberWord(words[i]!)) {
      i += 1;
      continue;
    }
    let j = i;
    // "e" só liga se a próxima palavra também for número
    while (j + 1 < words.length && (isNumberWord(words[j + 1]!) || (words[j + 1] === "e" && j + 2 < words.length && isNumberWord(words[j + 2]!)))) j += 1;
    const slice = words.slice(i, j + 1);
    const value = wordsToNumber(slice);
    if (value !== null) found.push({ value, from: i, to: j });
    i = j + 1;
  }
  return found;
}

/** "1.234,56" | "1234,56" | "1234.56" | "50" → número (null se não for). */
export function parseDecimalPt(raw: string): number | null {
  const value = raw.trim();
  if (!/^\d[\d.,]*$/.test(value)) return null;
  const normalized = value.includes(",") ? value.replace(/\./g, "").replace(",", ".") : /^\d{1,3}(\.\d{3})+$/.test(value) ? value.replace(/\./g, "") : value;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

/** Maior valor aceito pelo banco (numeric(12,2)). */
export const MAX_MONEY = 9_999_999_999.99;

export interface FoundMoney {
  value: number;
  raw: string;
}

const CURRENCY_WORDS = "(?:reais|real|conto|contos|pila|pilas)";

/**
 * Valor em dinheiro citado na frase. Só reconhece quando há marca de moeda ("R$", "reais", "conto")
 * ou número seguido de "mil". Devolve o primeiro encontrado; null se não houver.
 */
export function extractMoney(text: string, options: { bareOk?: boolean } = {}): FoundMoney | null {
  const t = norm(text);

  // R$ 1.234,56
  const rs = /r\$\s*(\d[\d.,]*)/.exec(t);
  if (rs) {
    const value = parseDecimalPt(rs[1]!.replace(/[.,]$/, ""));
    if (value !== null) return { value, raw: rs[0] };
  }

  // 1.234,56 reais | 150 reais | 2 mil reais
  const withWord = new RegExp(`(\\d[\\d.,]*)\\s*(mil)?\\s*${CURRENCY_WORDS}\\b`).exec(t);
  if (withWord) {
    const base = parseDecimalPt(withWord[1]!.replace(/[.,]$/, ""));
    if (base !== null) return { value: withWord[2] ? base * 1000 : base, raw: withWord[0] };
  }

  // "2 mil" / "1,5 mil" sem a palavra reais
  const mil = /(\d[\d.,]*)\s*mil\b/.exec(t);
  if (mil) {
    const base = parseDecimalPt(mil[1]!.replace(/[.,]$/, ""));
    if (base !== null) return { value: base * 1000, raw: mil[0] };
  }

  // por extenso + moeda: "cento e cinquenta reais", "mil e duzentos reais"
  const words = t.split(/[^a-z0-9,.$]+/).filter(Boolean);
  for (const f of findNumberWords(t)) {
    const next = words[f.to + 1];
    if (next && new RegExp(`^${CURRENCY_WORDS}$`).test(next)) return { value: f.value, raw: words.slice(f.from, f.to + 2).join(" ") };
  }
  // Intenções de dinheiro ("paguei 1.234,56 de aluguel", "recebi 150 no pix"): sem marca de moeda,
  // aceita o ÚNICO número da frase. Com mais de um número, não adivinha (a Cláudia pergunta).
  if (options.bareOk) {
    const digits = t.match(/\d[\d.,]*\d|\d/g) ?? [];
    const candidates = digits.map((d) => ({ raw: d, value: parseDecimalPt(d) })).filter((c): c is { raw: string; value: number } => c.value !== null);
    if (candidates.length === 1) return { value: candidates[0]!.value, raw: candidates[0]!.raw };
  }
  return null;
}

/** Resposta curta a "qual o valor?": aceita número puro, "R$ 80", "oitenta reais", "oitenta". */
export function parseAnswerMoney(text: string): number | null {
  const explicit = extractMoney(text);
  if (explicit) return explicit.value;
  const t = norm(text).replace(/^r\$\s*/, "").trim();
  const bare = parseDecimalPt(t);
  if (bare !== null) return bare;
  const nums = findNumberWords(t);
  if (nums.length === 1) return nums[0]!.value;
  return null;
}

/** Valor dentro dos limites do banco e maior que zero? */
export function moneyProblem(value: number): string | null {
  if (!(value > 0)) return "O valor precisa ser maior que zero.";
  if (value > MAX_MONEY) return "Esse valor é alto demais para o cadastro.";
  return null;
}

const MONTH_WORDS = "janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro";
const TIME_AFTER = new RegExp(`^(?:horas?|h\\b|da manha|da tarde|da noite|de manha|de tarde|de noite|e meia|de (?:${MONTH_WORDS}))`);
const SPOKEN_PREV = new Set(["as", "das", "ate", "dia"]);

/**
 * Fala vira dígito SÓ onde o número é data ou hora ("às dez horas" → "as 10 horas", "dia quinze" → "dia 15",
 * "vinte e cinco de novembro" → "25 de novembro", "às quatorze e trinta" → "as 14 e 30"). Números por extenso fora desse
 * contexto ficam como estão (nomes e outras palavras não são alterados). O ditado por voz costuma devolver números por extenso.
 */
export function spokenNumbersToDigits(text: string): string {
  const words = norm(text).split(" ").filter(Boolean);
  const out: string[] = [];
  let i = 0;
  while (i < words.length) {
    const w = words[i]!;
    if (!isNumberWord(w) || w === "mil" || w === "milhao" || w === "milhoes") {
      out.push(w);
      i += 1;
      continue;
    }
    const run = [w];
    let j = i;
    while (j + 1 < words.length) {
      const next = words[j + 1]!;
      if (isNumberWord(next) && next !== "mil" && next !== "milhao" && next !== "milhoes") {
        // "vinte cinco" não existe na fala; só junta centenas/dezenas+unidade pelo "e" (abaixo)
        break;
      }
      if (next === "e" && j + 2 < words.length && isNumberWord(words[j + 2]!)) {
        const left = wordsToNumber(run.filter((x) => x !== "e")) ?? 0;
        const right = words[j + 2]!;
        const rightUnit = UNITS[right] ?? 0;
        const joinable = left >= 100 || (left >= 20 && left % 10 === 0 && rightUnit >= 1 && rightUnit <= 9);
        if (joinable) {
          run.push("e", right);
          j += 2;
          continue;
        }
      }
      break;
    }
    const value = wordsToNumber(run);
    const prev = words[i - 1];
    const after = words.slice(j + 1, j + 4).join(" ");
    const prevOut = out[out.length - 1];
    const prevOut2 = out[out.length - 2];
    const isArticle = run.length === 1 && (w === "um" || w === "uma");
    const cue =
      (prev !== undefined && SPOKEN_PREV.has(prev)) ||
      TIME_AFTER.test(after) ||
      (prev === "e" && prevOut === "e" && prevOut2 !== undefined && /^\d+$/.test(prevOut2));
    const articleOk = !isArticle || prev === "as" || /^(?:horas?|da )/.test(after);
    if (value !== null && cue && articleOk) out.push(String(value));
    else out.push(...run);
    i = j + 1;
  }
  return out.join(" ");
}
