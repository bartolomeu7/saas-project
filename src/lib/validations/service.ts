import { z } from "zod";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Máximo de ${max} caracteres.`)
    .optional()
    .or(z.literal(""))
    .transform((value) => (value ? value : null));

const nonNegativeMoney = (label: string) =>
  z.coerce
    .number({ invalid_type_error: `Informe um valor válido para ${label}.` })
    .min(0, `${label} não pode ser negativo.`);

const nonNegativeMinutes = z.coerce
  .number({ invalid_type_error: "Informe uma duração válida." })
  .int("A duração deve ser um número inteiro de minutos.")
  .min(0, "A duração não pode ser negativa.");

export const serviceSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Informe o nome do serviço.")
    .max(160, "Nome muito longo."),
  categoryId: z
    .string()
    .trim()
    .optional()
    .or(z.literal(""))
    .transform((value) => (value ? value : null)),
  description: optionalText(2000),
  costPrice: nonNegativeMoney("o preço de custo"),
  salePrice: nonNegativeMoney("o preço de venda"),
  durationMinutes: nonNegativeMinutes,
  status: z.enum(["active", "inactive"]).default("active"),
});
export type ServiceInput = z.infer<typeof serviceSchema>;

export const serviceCategorySchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Informe o nome da categoria.")
    .max(120, "Nome muito longo."),
  description: optionalText(500),
  status: z.enum(["active", "inactive"]).default("active"),
});
export type ServiceCategoryInput = z.infer<typeof serviceCategorySchema>;
