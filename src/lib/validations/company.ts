import { z } from "zod";

const BUSINESS_TYPES = [
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

export const createCompanySchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Informe o nome da empresa.")
    .max(160, "Nome muito longo."),
  businessType: z.enum(BUSINESS_TYPES, {
    errorMap: () => ({ message: "Selecione um segmento válido." }),
  }),
});
export type CreateCompanyInput = z.infer<typeof createCompanySchema>;
