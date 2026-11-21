import { z } from "zod";
import { requiredText } from "./common.ts";

export const BUSINESS_TYPES = [
  "bakery",
  "car_wash",
  "automotive_detailing",
  "grocery",
  "restaurant",
  "snack_bar",
  "beauty_salon",
  "workshop",
  "service_provider",
  "other",
] as const;

/**
 * Nome da empresa: sem caracteres invisíveis/de inversão (U+202E etc.), espaços repetidos juntados e, no mínimo, 2 caracteres
 * com pelo menos uma letra ("12345" aparecia no menu e em todas as telas como nome da empresa).
 */
export const createCompanySchema = z.object({
  name: requiredText("Informe o nome da empresa.", 160, "Nome muito longo (máximo 160 caracteres).").refine(
    (value) => value.length >= 2 && /\p{L}/u.test(value),
    "Informe o nome da empresa (pelo menos 2 caracteres, com letras)."
  ),
  businessType: z.enum(BUSINESS_TYPES, {
    errorMap: () => ({ message: "Selecione um segmento válido." }),
  }),
});
export type CreateCompanyInput = z.infer<typeof createCompanySchema>;
