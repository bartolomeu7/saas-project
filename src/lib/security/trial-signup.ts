import "server-only";

import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { describeAntifraudConfig, hashClientIp, readIpEnv, resolveAntifraudSecret, resolveClientIp } from "@/lib/security/client-ip";

export interface TrialAuthorization {
  allowed: boolean;
  reason: "ok" | "ip_unknown" | "ip_limit" | "trial_already_used" | "unavailable";
}

/** Mensagens exibidas ao usuário (texto exigido para o limite por conexão). */
export const TRIAL_IP_LIMIT_MESSAGE =
  "Você atingiu o limite de cadastros permitido para esta conexão. Aguarde o período de liberação ou entre em contato com o suporte se acreditar que isso ocorreu por engano.";
export const TRIAL_UNAVAILABLE_MESSAGE =
  "Não foi possível liberar o teste grátis agora. Você pode tentar novamente em instantes, escolher um plano ou falar com o suporte.";
export const TRIAL_ALREADY_USED_MESSAGE = "O teste grátis já foi utilizado por esta conta.";

const warned = new Set<string>();
/** Registra uma vez por processo (sem segredo, sem IP, sem dados pessoais). */
function warnOnce(key: string, message: string) {
  if (warned.has(key)) return;
  warned.add(key);
  console.error(message);
}

/**
 * Passo OBRIGATÓRIO antes de conceder o teste grátis (onboarding e "solicitar teste"): registra, no servidor e de forma
 * atômica, se este usuário pode receber o teste. O banco só concede com essa autorização (create_company_with_owner e
 * claim_free_trial, chamados direto pelo cliente, não concedem nada sem ela).
 *
 * Falha SEGURA e LIMITADA: segredo antifraude ausente/fraco (em Production não há fallback) ou falha de infraestrutura
 * => `unavailable` = o TESTE não é concedido agora, mas a conta, a empresa e a compra de planos seguem funcionando.
 * O IP é lido aqui (server-only), vira HMAC e é descartado: nada de IP em claro, em log ou em banco.
 */
export async function authorizeTrialSignup(userId: string): Promise<TrialAuthorization> {
  try {
    const { secret, source } = resolveAntifraudSecret();
    if (!secret) {
      warnOnce(`secret:${source}`, `[trial-signup] ${describeAntifraudConfig().message}`);
      return { allowed: false, reason: "unavailable" };
    }
    if (source === "derived_from_clerk") {
      warnOnce("derived", "[trial-signup] ANTIFRAUD_HASH_SECRET ausente: usando segredo derivado do Clerk (aceito apenas fora de Production).");
    }

    const ip = resolveClientIp(await headers(), readIpEnv());
    // IP desconhecido (sem proxy confiável): registrado como ip_unknown, com teto próprio no banco — não é "livre".
    const ipHash = ip ? hashClientIp(ip, secret) : null;

    const admin = createAdminClient();
    const { data, error } = await (admin as unknown as {
      rpc(fn: "authorize_trial_signup", args: { p_user_id: string; p_ip_hash: string | null }): Promise<{
        data: { allowed?: boolean; reason?: string } | null;
        error: { message: string } | null;
      }>;
    }).rpc("authorize_trial_signup", { p_user_id: userId, p_ip_hash: ipHash });

    if (error || !data) {
      console.error("[trial-signup] authorize_trial_signup() falhou:", error?.message ?? "sem resposta");
      return { allowed: false, reason: "unavailable" };
    }
    const reason = (["ok", "ip_unknown", "ip_limit", "trial_already_used"] as const).find((r) => r === data.reason) ?? "unavailable";
    return { allowed: data.allowed === true, reason };
  } catch (error) {
    console.error("[trial-signup] erro inesperado:", error instanceof Error ? error.name : "desconhecido");
    return { allowed: false, reason: "unavailable" };
  }
}
