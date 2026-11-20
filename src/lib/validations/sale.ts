import { z } from "zod";
import { boundedMoney, boundedQuantity, cleanText, requiredText } from "./common";

const positiveQuantity = boundedQuantity("a quantidade").refine((value) => value > 0, "A quantidade deve ser maior que zero.");

const nonNegativeMoney = (label: string) => boundedMoney(label);

export const addSaleItemSchema = z
  .object({
    itemType: z.enum(["product", "service"]),
    productId: z.string().trim().optional().or(z.literal("")),
    serviceId: z.string().trim().optional().or(z.literal("")),
    quantity: positiveQuantity,
    discountAmount: nonNegativeMoney("o desconto do item").default(0),
  })
  .refine(
    (data) =>
      data.itemType === "product" ? !!data.productId : !!data.serviceId,
    { message: "Selecione um produto ou serviço válido." }
  );
export type AddSaleItemInput = z.infer<typeof addSaleItemSchema>;

export const updateSaleItemSchema = z.object({
  quantity: positiveQuantity,
  discountAmount: nonNegativeMoney("o desconto do item").default(0),
});
export type UpdateSaleItemInput = z.infer<typeof updateSaleItemSchema>;

export const updateDraftSaleSchema = z.object({
  customerId: z
    .string()
    .trim()
    .optional()
    .or(z.literal(""))
    .transform((value) => (value ? value : null)),
  discountAmount: nonNegativeMoney("o desconto da venda").optional(),
});
export type UpdateDraftSaleInput = z.infer<typeof updateDraftSaleSchema>;

export const SALE_PAYMENT_METHODS = ["cash", "pix", "debit", "credit", "other"] as const;

export const addSalePaymentSchema = z.object({
  method: z.enum(SALE_PAYMENT_METHODS),
  amount: boundedMoney("o valor do pagamento").refine((value) => value > 0, "O valor do pagamento deve ser maior que zero."),
  notes: z
    .string()
    .nullish()
    .transform((value) => cleanText(value ?? "").trim())
    .pipe(z.string().max(200, "Máximo de 200 caracteres."))
    .transform((value) => (value ? value : null)),
});
export type AddSalePaymentInput = z.infer<typeof addSalePaymentSchema>;

export const cancelSaleSchema = z.object({
  reason: requiredText("Informe o motivo do cancelamento.", 300, "Motivo muito longo."),
});
export type CancelSaleInput = z.infer<typeof cancelSaleSchema>;
