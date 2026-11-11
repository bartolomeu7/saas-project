/**
 * Chat AI — utilidades de texto. Funções puras (sem banco, sem rede, sem React): rodam no servidor e nos testes.
 */

/** minúsculas, sem acento, espaços colapsados. "Lúcio  Silva" → "lucio silva". */
export function norm(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Palavras "de ligação" que não ajudam a identificar nada (comparação de nomes). */
const STOPWORDS = new Set([
  "de", "da", "do", "das", "dos", "e", "o", "a", "os", "as", "um", "uma", "pra", "pro", "para", "com", "no", "na", "em",
]);

/** Tokens significativos (sem acento, sem palavras de ligação, 2+ caracteres). */
export function tokens(input: string): string[] {
  return norm(input)
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t));
}

/** Texto cabe no limite? (proteção de custo/abuso; a rota usa o mesmo número). */
export const MAX_MESSAGE_LENGTH = 1000;

/** Remove caracteres de controle e corta no limite. Nunca lança erro. */
export function sanitizeUserText(input: string): string {
  return input.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ").trim().slice(0, MAX_MESSAGE_LENGTH);
}

/** Distância de edição (inserir/apagar/trocar), com corte cedo: devolve > max quando passa do limite. */
export function editDistance(a: string, b: string, max = 2): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const cur = [i];
    let best = cur[0]!;
    for (let j = 1; j <= b.length; j += 1) {
      cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
      best = Math.min(best, cur[j]!);
    }
    if (best > max) return max + 1;
    prev = cur;
  }
  return prev[b.length]!;
}

/**
 * Palavras "iguais" para quem digita rápido: idênticas, ou com 1 erro (palavras de 5+ letras) / 2 erros (9+ letras),
 * com a mesma primeira letra. "polimeto" ≈ "polimento", "viniscius" ≈ "vinicius". Palavras curtas nunca são aproximadas.
 */
export function fuzzyEq(a: string, b: string): boolean {
  if (a === b) return true;
  const len = Math.min(a.length, b.length);
  if (len < 5 || a[0] !== b[0]) return false;
  const limit = len >= 9 ? 2 : 1;
  return editDistance(a, b, limit) <= limit;
}

/** A palavra do texto corresponde a esta palavra do nome? (igual, prefixo de 4+ letras, ou quase igual) */
export function tokenMatches(textToken: string, nameToken: string): boolean {
  return textToken === nameToken || (textToken.length >= 4 && nameToken.startsWith(textToken)) || fuzzyEq(textToken, nameToken);
}

/** Similaridade simples 0..1 entre o texto digitado e um nome (fração dos tokens do nome presentes no texto). */
export function nameCoverage(text: string, name: string): number {
  const nameTokens = tokens(name);
  if (nameTokens.length === 0) return 0;
  const textTokens = [...new Set(tokens(text))];
  const hit = nameTokens.filter((t) => textTokens.some((x) => tokenMatches(x, t))).length;
  return hit / nameTokens.length;
}

/** Cliente combina com o que foi dito? Todas as palavras ditas existem no nome (ordem livre), com tolerância de digitação. */
export function customerMatches(customerName: string, wanted: string[]): boolean {
  const have = tokens(customerName);
  return wanted.length > 0 && wanted.every((w) => have.some((h) => h === w || (w.length >= 3 && h.startsWith(w)) || fuzzyEq(w, h)));
}
