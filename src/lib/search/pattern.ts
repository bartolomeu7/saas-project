/**
 * Busca tolerante para as listas e para a busca do balcão de vendas:
 *  - sem diferença entre maiúscula/minúscula e acentos ("jose" acha "José", "ÁLVARES" acha "Álvares");
 *  - número digitado sem pontuação acha o valor formatado ("39053344705" acha "390.533.447-05",
 *    "1133334444" acha "(11) 3333-4444").
 * Usa o operador de expressão regular do PostgREST (`imatch`), então não precisa de extensão nem migration no banco.
 */

/** Cada letra base vira uma classe com as variantes acentuadas (minúsculas e maiúsculas). */
const ACCENT_CLASSES: Record<string, string> = {
  a: "aàáâãäåāăą",
  e: "eèéêëēĕėęě",
  i: "iìíîïĩīĭįı",
  o: "oòóôõöøōŏő",
  u: "uùúûüũūŭůűų",
  c: "cçćĉċč",
  n: "nñńņň",
  y: "yýÿŷ",
};

const REGEX_SPECIAL = /[\\^$.|?*+()[\]{}]/g;

/** Remove o que tem significado especial no filtro `.or()` do PostgREST (vírgula, parênteses, aspas, barra invertida). */
export function sanitizeSearchTerm(raw: string): string {
  return raw.replace(/[,()"\\]/g, "").trim();
}

/** Expressão regular (Postgres, sem diferenciar maiúscula) que ignora acentos. Termo vazio → null. */
export function accentInsensitiveRegex(rawTerm: string): string | null {
  const term = sanitizeSearchTerm(rawTerm);
  if (!term) return null;
  // "é" digitado vira "e" e depois entra na classe com todas as variantes
  const base = term.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  return [...base]
    .map((ch) => {
      const cls = ACCENT_CLASSES[ch];
      if (cls) return `[${cls}${cls.toUpperCase()}]`;
      return ch.replace(REGEX_SPECIAL, "\\$&");
    })
    .join("");
}

/** Número com separadores quaisquer entre os dígitos: "113333" → `1\D*1\D*3\D*3\D*3\D*3`. Menos de 3 dígitos ou texto → null. */
export function digitsRegex(rawTerm: string): string | null {
  const digits = sanitizeSearchTerm(rawTerm).replace(/[\s().\-/+]/g, "");
  if (!/^\d{3,}$/.test(digits)) return null;
  return [...digits].join("\\D*");
}

/**
 * Filtro para `query.or(...)`: o termo é procurado (sem acento) em todas as colunas de `textColumns`; quando é um número,
 * também nas colunas de `digitColumns` ignorando a pontuação. Retorna null se não há o que buscar.
 */
export function buildSearchOr(rawTerm: string, textColumns: string[], digitColumns: string[] = []): string | null {
  const text = accentInsensitiveRegex(rawTerm);
  if (!text) return null;
  // as colunas de número também são buscadas como texto (ex.: "390.533" digitado com o ponto)
  const parts = [...textColumns, ...digitColumns].map((column) => `${column}.imatch.${text}`);
  const digits = digitColumns.length ? digitsRegex(rawTerm) : null;
  if (digits) for (const column of digitColumns) parts.push(`${column}.imatch.${digits}`);
  return parts.join(",");
}
