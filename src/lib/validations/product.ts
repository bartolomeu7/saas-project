import { z } from "zod";
import { boundedMoney, boundedQuantity, optionalCleanText, requiredText } from "./common";

export const PRODUCT_UNITS = ["un", "kg", "g", "l", "ml", "m", "cx", "pct", "kit"] as const;

export const productSchema = z.object({
  name: requiredText("Informe o nome do produto.", 160, "Nome muito longo."),
  categoryId: z
    .string()
    .trim()
    .optional()
    .or(z.literal(""))
    .transform((value) => (value ? value : null)),
  sku: optionalCleanText(64),
  barcode: optionalCleanText(64),
  description: optionalCleanText(2000),
  unit: z.enum(PRODUCT_UNITS).default("un"),
  costPrice: boundedMoney("o preço de custo"),
  salePrice: boundedMoney("o preço de venda"),
  stockQuantity: boundedQuantity("o estoque atual"),
  minimumStock: boundedQuantity("o estoque mínimo"),
  status: z.enum(["active", "inactive"]).default("active"),
});
export type ProductInput = z.infer<typeof productSchema>;

export const productCategorySchema = z.object({
  name: requiredText("Informe o nome da categoria.", 120, "Nome muito longo."),
  description: optionalCleanText(500),
  status: z.enum(["active", "inactive"]).default("active"),
});
export type ProductCategoryInput = z.infer<typeof productCategorySchema>;

export const stockAdjustmentSchema = z.object({
  newQuantity: boundedQuantity("o novo estoque"),
  reason: requiredText("Informe o motivo do ajuste.", 200, "Motivo muito longo."),
});
export type StockAdjustmentInput = z.infer<typeof stockAdjustmentSchema>;
