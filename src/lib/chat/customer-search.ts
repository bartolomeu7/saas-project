import { customerMatches, fuzzyEq, norm, tokenMatches, tokens } from "./text.ts";

/**
 * Chat AI — busca de clientes (pura, usada pelo servidor e pelos testes). Sem banco: recebe a lista de clientes.
 * Tolerante a erro de digitação ("viniscius"), ordem livre das palavras e títulos ("dona Juliana", "Dr. João").
 */
export interface CustomerRow {
  id: string;
  name: string;
  phone?: string | null;
}

export interface CustomerHit {
  id: string;
  name: string;
  detail?: string;
}

const TITLE_WORDS = new Set(["dr", "dra", "doutor", "doutora", "dona", "dono", "seu", "sr", "sra", "senhor", "senhora", "cliente"]);

const toHit = (c: CustomerRow): CustomerHit => ({ id: c.id, name: c.name, detail: c.phone ? `final ${c.phone.replace(/\D/g, "").slice(-4)}` : undefined });

/** Palavras do que foi dito, sem títulos. */
export const spokenNameTokens = (text: string): string[] => tokens(text).filter((t) => !TITLE_WORDS.has(t));

/** Clientes que combinam com o nome dito: todas as palavras no nome (ordem livre). Se nada bate, tenta sem a última palavra ("João Pedro Santos Junior"). */
export function searchCustomers(list: CustomerRow[], text: string, limit = 5): CustomerHit[] {
  let wanted = spokenNameTokens(text);
  if (wanted.length === 0) return [];
  let rows = list.filter((c) => customerMatches(c.name, wanted));
  if (rows.length === 0 && wanted.length >= 3) {
    wanted = wanted.slice(0, -1);
    rows = list.filter((c) => customerMatches(c.name, wanted));
  }
  return rows
    .sort((a, b) => norm(a.name).length - norm(b.name).length)
    .slice(0, limit)
    .map(toHit);
}

/**
 * Clientes cujo nome aparece no texto sem gatilho ("corte do joão paulo amanhã 15h"): o primeiro nome e mais uma palavra
 * do nome precisam estar no texto (ou o nome inteiro, se tiver uma palavra só de 4+ letras).
 */
export function scanCustomers(list: CustomerRow[], text: string, limit = 5): CustomerHit[] {
  const said = tokens(text);
  if (said.length === 0) return [];
  const scored: { c: CustomerRow; hits: number }[] = [];
  for (const c of list) {
    const toks = tokens(c.name.replace(/\(.*?\)/g, " "));
    if (toks.length === 0) continue;
    const matched = toks.filter((tk) => said.some((x) => tokenMatches(x, tk) || fuzzyEq(x, tk)));
    if (toks.length === 1) {
      if (toks[0]!.length >= 4 && matched.length === 1) scored.push({ c, hits: 1 });
    } else if (matched.includes(toks[0]!) && matched.length >= 2) scored.push({ c, hits: matched.length });
  }
  const best = Math.max(0, ...scored.map((s) => s.hits));
  return scored
    .filter((s) => s.hits === best)
    .sort((a, b) => norm(a.c.name).length - norm(b.c.name).length)
    .slice(0, limit)
    .map((s) => toHit(s.c));
}

/** Pelo final (ou pelo número inteiro) do telefone. */
export function customersByPhone(list: CustomerRow[], digits: string, limit = 5): CustomerHit[] {
  const d = digits.replace(/\D/g, "");
  if (d.length < 4) return [];
  return list
    .filter((c) => {
      const p = (c.phone ?? "").replace(/\D/g, "");
      return p.length > 0 && (d.length >= 8 ? p.endsWith(d) || p.includes(d) : p.endsWith(d));
    })
    .slice(0, limit)
    .map(toHit);
}
