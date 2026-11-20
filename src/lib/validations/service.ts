import { z } from "zod";
import { boundedMoney, optionalCleanText, requiredText } from "./common";

const nonNegativeMinutes = z.coerce
  .number({ invalid_type_error: "Informe uma duração válida." })
  .int("A duração deve ser um número inteiro de minutos.")
  .min(0, "A duração não pode ser negativa.")
  .max(24 * 60, "A duração máxima é de 24 horas.");

export const serviceSchema = z.object({
  name: requiredText("Informe o nome do serviço.", 160, "Nome muito longo."),
  categoryId: z
    .string()
    .trim()
    .optional()
    .or(z.literal(""))
    .transform((value) => (value ? value : null)),
  description: optionalCleanText(2000),
  costPrice: boundedMoney("o preço de custo"),
  salePrice: boundedMoney("o preço de venda"),
  durationMinutes: nonNegativeMinutes,
  status: z.enum(["active", "inactive"]).default("active"),
});
export type ServiceInput = z.infer<typeof serviceSchema>;

export const serviceCategorySchema = z.object({
  name: requiredText("Informe o nome da categoria.", 120, "Nome muito longo."),
  description: optionalCleanText(500),
  status: z.enum(["active", "inactive"]).default("active"),
});
export type ServiceCategoryInput = z.infer<typeof serviceCategorySchema>;
