import type { EvoPayTransactionStatus } from "@/lib/evopay/client";
import type { SubscriptionPaymentStatus } from "@/types/billing";

/**
 * Mapeia o status real da EvoPay para o enum interno
 * (subscription_payment_status). Nenhum valor inventado — os 6 valores
 * abaixo são exatamente os documentados pela EvoPay.
 *
 * WAITING_FOR_REFUND mapeia para "paid": o pagamento foi efetivamente
 * recebido e o acesso já foi concedido — o estorno em si (REFUNDED)
 * ainda não terminou. Não existe fluxo de estorno automático nesta fase
 * (ver regra "não implementar fluxo financeiro completo de reembolso").
 */
export function mapEvoPayStatus(status: EvoPayTransactionStatus): SubscriptionPaymentStatus {
  switch (status) {
    case "COMPLETED":
      return "paid";
    case "PENDING":
      return "pending";
    case "EXPIRED":
      return "expired";
    case "CANCELED":
      return "cancelled";
    case "REFUNDED":
      return "refunded";
    case "WAITING_FOR_REFUND":
      return "paid";
    default:
      return "pending";
  }
}
