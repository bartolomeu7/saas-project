import { z } from "zod";

/**
 * Todos os campos de texto opcionais aceitam string vazia (do formulário
 * HTML) e a normalizam para null, para bater com o tipo do banco.
 */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Máximo de ${max} caracteres.`)
    .optional()
    .or(z.literal(""))
    .transform((value) => (value ? value : null));

export const customerSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Informe o nome do cliente.")
    .max(160, "Nome muito longo."),
  document: optionalText(32),
  phone: optionalText(32),
  whatsapp: optionalText(32),
  email: z
    .string()
    .trim()
    .max(160)
    .optional()
    .or(z.literal(""))
    .transform((value) => (value ? value : null))
    .refine((value) => value === null || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value), {
      message: "Informe um e-mail válido.",
    }),
  address: optionalText(200),
  addressNumber: optionalText(20),
  complement: optionalText(100),
  neighborhood: optionalText(100),
  city: optionalText(100),
  state: optionalText(2),
  postalCode: optionalText(16),
  notes: optionalText(2000),
  status: z.enum(["active", "inactive"]).default("active"),
});
export type CustomerInput = z.infer<typeof customerSchema>;
