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

/** Similaridade simples 0..1 entre o texto digitado e um nome (fração dos tokens do nome presentes no texto). */
export function nameCoverage(text: string, name: string): number {
  const nameTokens = tokens(name);
  if (nameTokens.length === 0) return 0;
  const textTokens = new Set(tokens(text));
  const hit = nameTokens.filter((t) => textTokens.has(t) || [...textTokens].some((x) => x.length >= 4 && t.startsWith(x))).length;
  return hit / nameTokens.length;
}
