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

const nonNegativeQuantity = (label: string) =>
  z.coerce
    .number({ invalid_type_error: `Informe uma quantidade válida para ${label}.` })
    .min(0, `${label} não pode ser negativo.`);

export const PRODUCT_UNITS = ["un", "kg", "g", "l", "ml", "m", "cx", "pct", "kit"] as const;

export const productSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Informe o nome do produto.")
    .max(160, "Nome muito longo."),
  categoryId: z
    .string()
    .trim()
    .optional()
    .or(z.literal(""))
    .transform((value) => (value ? value : null)),
  sku: optionalText(64),
  barcode: optionalText(64),
  description: optionalText(2000),
  unit: z.enum(PRODUCT_UNITS).default("un"),
  costPrice: nonNegativeMoney("o preço de custo"),
  salePrice: nonNegativeMoney("o preço de venda"),
  stockQuantity: nonNegativeQuantity("o estoque atual"),
  minimumStock: nonNegativeQuantity("o estoque mínimo"),
  status: z.enum(["active", "inactive"]).default("active"),
});
export type ProductInput = z.infer<typeof productSchema>;

export const productCategorySchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Informe o nome da categoria.")
    .max(120, "Nome muito longo."),
  description: optionalText(500),
  status: z.enum(["active", "inactive"]).default("active"),
});
export type ProductCategoryInput = z.infer<typeof productCategorySchema>;

export const stockAdjustmentSchema = z.object({
  newQuantity: nonNegativeQuantity("o novo estoque"),
  reason: z
    .string()
    .trim()
    .min(1, "Informe o motivo do ajuste.")
    .max(200, "Motivo muito longo."),
});
export type StockAdjustmentInput = z.infer<typeof stockAdjustmentSchema>;
