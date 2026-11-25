import { z } from "zod";
import { TICKET_MESSAGE_MAX, TICKET_MESSAGE_MIN, TICKET_REASONS } from "../../types/billing.ts";

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

/** Chamado sobre uma ordem de pagamento. O banco (open_payment_ticket) repete todas as regras. */
export const paymentTicketSchema = z.object({
  paymentId: z.string().uuid("Ordem de pagamento inválida."),
  reason: z.enum(TICKET_REASONS, { errorMap: () => ({ message: "Escolha o assunto do chamado." }) }),
  message: z
    .string()
    .trim()
    .min(TICKET_MESSAGE_MIN, `Descreva o problema com pelo menos ${TICKET_MESSAGE_MIN} caracteres.`)
    .max(TICKET_MESSAGE_MAX, `Use no máximo ${TICKET_MESSAGE_MAX} caracteres.`),
});
