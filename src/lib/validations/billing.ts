import { z } from "zod";

export const createPaymentSchema = z.object({
  planId: z.string().uuid("Plano inválido."),
});
export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;
