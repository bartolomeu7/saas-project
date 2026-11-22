import { z } from "zod";

export const BILLING_METHODS = ["pix", "card"] as const;
export type BillingMethod = (typeof BILLING_METHODS)[number];

export const createPaymentSchema = z.object({
  planId: z.string().uuid("Plano inválido."),
  /** Forma de pagamento; sem o campo vale Pix (compatível com a tela antiga). */
  method: z.enum(BILLING_METHODS).optional().default("pix"),
});
export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;

export const payCardSchema = z.object({
  paymentId: z.string().uuid("Pagamento inválido."),
  token: z.string().min(10).max(2100),
});
export type PayCardInput = z.infer<typeof payCardSchema>;
