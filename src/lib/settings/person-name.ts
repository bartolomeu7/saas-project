import { cleanText, collapseSpaces } from "../validations/common.ts";

/**
 * Nome de pessoa (conta e perfil): sem caracteres de controle/inversão invisíveis (U+202E, U+200B...), espaços repetidos
 * juntados e pontas aparadas. Função pura para o formulário do navegador, a cópia para o perfil e os testes.
 */
export function cleanPersonName(value: string | null | undefined): string {
  return collapseSpaces(cleanText(value ?? "")).trim();
}

/** Mensagem de erro para nome/sobrenome digitados, ou null se estão bons (sobrenome é opcional). */
export function personNameError(first: string, last: string): string | null {
  const f = cleanPersonName(first);
  const l = cleanPersonName(last);
  if (!f) return "Informe pelo menos o primeiro nome.";
  if (!/\p{L}/u.test(f)) return "O nome precisa ter letras.";
  if (l && !/\p{L}/u.test(l)) return "O sobrenome precisa ter letras.";
  if (f.length > 80 || l.length > 80) return "Nome ou sobrenome muito longo (máximo 80 caracteres cada).";
  return null;
}
