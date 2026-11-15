import { norm } from "./text.ts";
import { isNumberWord, parseDecimalPt, wordsToNumber } from "./numbers-pt.ts";

/**
 * Chat AI — quantidade com unidade em português ("duas caixas", "meio quilo", "2,5 kg", "dois litros e meio").
 * Regras puras (sem IA, sem rede). As unidades são as do cadastro de produtos (enum `product_unit`).
 * Preparado para o módulo de ESTOQUE do chat (entrada/baixa por frase). O pacote Microsoft Recognizers só é usado nos TESTES,
 * como "juiz" para comparar resultados: não vai para o site.
 */

export type StockUnit = "un" | "kg" | "g" | "l" | "ml" | "m" | "cx" | "pct" | "kit";

const UNIT_WORDS: Record<string, StockUnit> = {
  un: "un", und: "un", unid: "un", unidade: "un", unidades: "un", peca: "un", pecas: "un", item: "un", itens: "un",
  kg: "kg", kilo: "kg", kilos: "kg", quilo: "kg", quilos: "kg", quilograma: "kg", quilogramas: "kg",
  g: "g", gr: "g", grama: "g", gramas: "g",
  l: "l", lt: "l", litro: "l", litros: "l",
  ml: "ml", mililitro: "ml", mililitros: "ml",
  m: "m", metro: "m", metros: "m",
  cx: "cx", caixa: "cx", caixas: "cx",
  pct: "pct", pacote: "pct", pacotes: "pct",
  kit: "kit", kits: "kit",
};

export interface FoundQuantity {
  value: number;
  unit: StockUnit;
  /** trecho (já sem acento) que originou a quantidade */
  raw: string;
}

const HALF = new Set(["meio", "meia"]);
const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** Todas as quantidades com unidade citadas na frase, na ordem em que aparecem. */
export function extractQuantities(text: string): FoundQuantity[] {
  const t = norm(text).replace(/(\d)([a-z]+)/g, "$1 $2"); // "2kg" → "2 kg"
  const words = t.split(/[^a-z0-9,.]+/).map((w) => w.replace(/[.,]+$/g, "")).filter(Boolean);
  const out: FoundQuantity[] = [];
  let i = 0;
  while (i < words.length) {
    let value: number | null = null;
    let j = i;
    const w = words[i]!;
    if (/^\d[\d.,]*$/.test(w)) {
      value = parseDecimalPt(w);
    } else if (HALF.has(w)) {
      value = 0.5;
    } else if (isNumberWord(w) && w !== "mil") {
      let k = i;
      while (k + 1 < words.length && (isNumberWord(words[k + 1]!) || (words[k + 1] === "e" && k + 2 < words.length && isNumberWord(words[k + 2]!)))) k += 1;
      value = wordsToNumber(words.slice(i, k + 1));
      j = k;
    }
    if (value === null) {
      i += 1;
      continue;
    }
    let next = j + 1;
    // "um e meio quilo", "dois e meia caixas": metade ANTES da unidade
    if (words[next] === "e" && HALF.has(words[next + 1] ?? "") && UNIT_WORDS[words[next + 2] ?? ""]) {
      value += 0.5;
      next += 2;
    }
    const unit = UNIT_WORDS[words[next] ?? ""];
    if (!unit) {
      i = j + 1;
      continue;
    }
    let end = next;
    // "dois litros e meio": metade DEPOIS da unidade
    if (words[end + 1] === "e" && HALF.has(words[end + 2] ?? "")) {
      value += 0.5;
      end += 2;
    }
    out.push({ value: round3(value), unit, raw: words.slice(i, end + 1).join(" ") });
    i = end + 1;
  }
  return out;
}

/** A primeira quantidade com unidade, ou null. */
export function extractQuantity(text: string): FoundQuantity | null {
  return extractQuantities(text)[0] ?? null;
}
