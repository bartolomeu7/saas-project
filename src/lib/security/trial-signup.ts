import "server-only";

import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { antifraudSecret, hashClientIp, readIpEnv, resolveClientIp } from "@/lib/security/client-ip";

export interface TrialAuthorization {
  allowed: boolean;
  reason: "ok" | "ip_unknown" | "ip_limit" | "trial_already_used" | "unavailable";
}

/**
 * Passo OBRIGATÓRIO antes de create_company_with_owner: registra, no servidor e de forma atômica, se este cadastro
 * pode receber o teste grátis. O banco só concede o teste com essa autorização (a RPC create_company_with_owner,
 * chamada direto pelo cliente, cria a empresa SEM teste). Falha de infraestrutura => `unavailable` (sem teste, e o
 * usuário segue para assinar ou falar com o suporte); nunca concede teste "no escuro".
 *
 * O IP é lido aqui (server-only), transformado em HMAC e descartado: nada de IP em claro, em log ou em banco.
 */
export async function authorizeTrialSignup(userId: string): Promise<TrialAuthorization> {
  try {
    const secret = antifraudSecret();
    const ip = resolveClientIp(await headers(), readIpEnv());
    // sem segredo configurado não há como gerar o identificador: trata como conexão desconhecida (registrada, não punida)
    const ipHash = ip && secret ? hashClientIp(ip, secret) : null;

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
    console.error("[trial-signup] erro inesperado:", error instanceof Error ? error.message : "desconhecido");
    return { allowed: false, reason: "unavailable" };
  }
}
