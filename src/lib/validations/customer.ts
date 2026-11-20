import { z } from "zod";
import { documentError, phoneError } from "@/lib/validations/document";
import { cleanText, requiredText } from "@/lib/validations/common";

export const BRAZIL_UFS = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"] as const;

/**
 * Todos os campos de texto opcionais aceitam string vazia (do formulário
 * HTML) e a normalizam para null, para bater com o tipo do banco.
 */
const optionalText = (max: number) =>
  z
    .string()
    .optional()
    .transform((value) => cleanText(value ?? "").trim())
    .pipe(z.string().max(max, `Máximo de ${max} caracteres.`))
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
  })
  .refine((value) => value === null || value >= "1900-01-01", {
    message: "Data de nascimento muito antiga (use 1900 ou depois).",
  });

export const customerSchema = z.object({
  name: requiredText("Informe o nome do cliente (pelo menos 2 letras).", 160, "Nome muito longo.").refine(
    (value) => value.length >= 2,
    "Informe o nome do cliente (pelo menos 2 letras)."
  ),
  document: optionalText(32).refine((value) => documentError(value) === null, {
    message: "Documento inválido: confira o CPF ou CNPJ.",
  }),
  phone: optionalText(32).refine((value) => phoneError(value) === null, { message: "Telefone inválido: use de 8 a 15 números." }),
  whatsapp: optionalText(32).refine((value) => phoneError(value) === null, { message: "WhatsApp inválido: use de 8 a 15 números." }),
  email: z
    .string()
    .trim()
    .max(160)
    .optional()
    .or(z.literal(""))
    .transform((value) => (value ? value.toLowerCase() : null))
    .refine((value) => value === null || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value), {
      message: "Informe um e-mail válido.",
    }),
  address: optionalText(200),
  addressNumber: optionalText(20).refine((value) => value === null || !value.startsWith("-"), {
    message: "Número do endereço inválido.",
  }),
  complement: optionalText(100),
  neighborhood: optionalText(100),
  city: optionalText(100),
  state: optionalText(2)
    .transform((value) => (value ? value.toUpperCase() : null))
    .refine((value) => value === null || (BRAZIL_UFS as readonly string[]).includes(value), { message: "UF inválida (use a sigla, ex.: SP)." }),
  postalCode: optionalText(16).refine((value) => value === null || value.replace(/\D/g, "").length === 8, {
    message: "CEP inválido: use 8 números.",
  }),
  notes: optionalText(2000),
  birthDate: birthDateSchema,
  preferences: preferencesSchema,
  status: z.enum(["active", "inactive"]).default("active"),
});
export type CustomerInput = z.infer<typeof customerSchema>;
