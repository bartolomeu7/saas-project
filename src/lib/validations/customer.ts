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

const MAX_PREFERENCE_ENTRIES = 10;
const MAX_PREFERENCE_KEY_LENGTH = 60;
const MAX_PREFERENCE_VALUE_LENGTH = 200;

/**
 * O formulário envia as preferências como um único campo JSON (produzido
 * pelo componente client-side a partir de uma lista dinâmica de pares
 * chave/valor) — evita criar uma coluna por preferência. Validado aqui
 * antes de gravar em customers.preferences (jsonb).
 */
const preferencesSchema = z
  .string()
  .optional()
  .or(z.literal(""))
  .transform((value): Record<string, string> | null => {
    if (!value) return {};
    try {
      const parsed = JSON.parse(value);
      return parsed;
    } catch {
      return null;
    }
  })
  .refine((value) => value !== null, {
    message: "Preferências inválidas.",
  })
  .refine(
    (value) =>
      value !== null &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.keys(value).length <= MAX_PREFERENCE_ENTRIES &&
      Object.entries(value).every(
        ([key, val]) =>
          typeof key === "string" &&
          key.trim().length > 0 &&
          key.length <= MAX_PREFERENCE_KEY_LENGTH &&
          typeof val === "string" &&
          val.length <= MAX_PREFERENCE_VALUE_LENGTH
      ),
    {
      message: `Preferências devem ter no máximo ${MAX_PREFERENCE_ENTRIES} itens, com chave de até ${MAX_PREFERENCE_KEY_LENGTH} caracteres e valor de até ${MAX_PREFERENCE_VALUE_LENGTH}.`,
    }
  );

const birthDateSchema = z
  .string()
  .optional()
  .or(z.literal(""))
  .transform((value) => (value ? value : null))
  .refine((value) => value === null || !Number.isNaN(Date.parse(value)), {
    message: "Data de nascimento inválida.",
  })
  .refine((value) => value === null || new Date(value) <= new Date(), {
    message: "Data de nascimento não pode ser no futuro.",
  });

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
  birthDate: birthDateSchema,
  preferences: preferencesSchema,
  status: z.enum(["active", "inactive"]).default("active"),
});
export type CustomerInput = z.infer<typeof customerSchema>;
