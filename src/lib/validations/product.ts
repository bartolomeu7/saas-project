import { z } from "zod";
import { boundedMoney, boundedQuantity, collapseSpaces, optionalCleanText, requiredText } from "./common";

export const PRODUCT_UNITS = ["un", "kg", "g", "l", "ml", "m", "cx", "pct", "kit"] as const;

export const productSchema = z.object({
  name: requiredText("Informe o nome do produto.", 160, "Nome muito longo."),
  categoryId: z
    .string()
    .trim()
    .optional()
    .or(z.literal(""))
    .transform((value) => (value ? value : null)),
  // SKU em maiúsculas e sem espaços repetidos: "t3-base" e "T3-BASE" são o mesmo código (o índice único do banco diferencia a caixa).
  sku: optionalCleanText(64).transform((value) => (value ? collapseSpaces(value).toUpperCase() : value)),
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
  // vazio não é zero: sem isso um envio sem valor zerava o estoque
  newQuantity: z.preprocess((value) => (String(value ?? "").trim() === "" ? Number.NaN : value), boundedQuantity("o novo estoque")),
  reason: requiredText("Informe o motivo do ajuste.", 200, "Motivo muito longo."),
});
export type StockAdjustmentInput = z.infer<typeof stockAdjustmentSchema>;
