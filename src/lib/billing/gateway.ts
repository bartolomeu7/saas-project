import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { cardCheckoutConfig } from "@/lib/syncpay/client";
import { MIN_WEBHOOK_TOKEN_LENGTH } from "@/lib/misticpay/webhook";
import { isPaymentGateway, type PaymentGateway } from "@/types/billing";

/** Padrão quando nada foi escolhido (ou o banco não respondeu): a SyncPay está pausada até a conta liberar o Pix pela API. */
export const DEFAULT_GATEWAY: PaymentGateway = "misticpay";

/**
 * Gateway que recebe as NOVAS cobranças. Fonte: `platform_settings.payment_gateway`, alterada pelo super administrador em
 * /admin/integrations (get_active_payment_gateway). Cobranças já criadas seguem no gateway em que nasceram (cada webhook
 * continua ativo independentemente da escolha). Se o banco falhar, usa o padrão — nunca bloqueia o checkout por isso.
 */
export async function getActiveGateway(): Promise<PaymentGateway> {
  try {
    const { data, error } = await createAdminClient().rpc("get_active_payment_gateway");
    if (!error && isPaymentGateway(data)) return data;
  } catch {
    // sem service role neste ambiente: cai no padrão
  }
  return DEFAULT_GATEWAY;
}

/** O gateway tem tudo o que precisa neste ambiente para cobrar (credenciais e, na MisticPay, o token do webhook)? */
export function gatewayConfigured(gateway: PaymentGateway, env: Record<string, string | undefined> = process.env): boolean {
  if (gateway === "syncpay") return Boolean(env.SYNCPAY_CLIENT_ID?.trim() && env.SYNCPAY_CLIENT_SECRET?.trim());
  return Boolean(env.MISTICPAY_CLIENT_ID?.trim() && env.MISTICPAY_CLIENT_SECRET?.trim() && (env.MISTICPAY_WEBHOOK_TOKEN?.trim().length ?? 0) >= MIN_WEBHOOK_TOKEN_LENGTH);
}

/** Cartão só existe na SyncPay: oferecido quando ela é a ativa e a liberação de cartão está configurada. */
export async function cardAvailable(): Promise<boolean> {
  return (await getActiveGateway()) === "syncpay" && cardCheckoutConfig().enabled;
}
