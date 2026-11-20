import { cleanText } from "@/lib/validations/common";

/**
 * Lê um campo de texto de formulário (Server Actions): remove caracteres de controle e de direção invisível,
 * apara as pontas e confere o tamanho. O limite do HTML (maxLength) só vale no navegador; aqui vale de verdade.
 */
export function readText(
  formData: FormData,
  name: string,
  max: number
): { value: string; tooLong: boolean } {
  const raw = formData.get(name);
  const value = typeof raw === "string" ? cleanText(raw).trim() : "";
  return { value, tooLong: value.length > max };
}

export const tooLongMessage = (label: string, max: number) => `${label}: máximo de ${max} caracteres.`;
