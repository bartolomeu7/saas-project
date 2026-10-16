"use server";

import { redirect } from "next/navigation";
import { createSessionClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { AUTH_BACKEND_MESSAGES, AuthBackendError } from "@/lib/auth/token-claims";
import { ACCOUNT_BLOCKED_MESSAGE, AccountInactiveError } from "@/lib/auth/account-status";
import { createCompanySchema } from "@/lib/validations/company";
import type { ActionResult } from "@/lib/auth/actions";
import { revalidatePath } from "next/cache";
import {
  authorizeTrialSignup,
  TRIAL_ALREADY_USED_MESSAGE,
  TRIAL_IP_LIMIT_MESSAGE,
  TRIAL_UNAVAILABLE_MESSAGE,
} from "@/lib/security/trial-signup";

/**
 * Cria a empresa do usuário autenticado e o torna owner, através da
 * função de banco `create_company_with_owner` (security definer).
 *
 * Nenhum user_id, role ou company_id é aceito do formulário — a função
 * do banco resolve tudo a partir da sessão autenticada
 * (public.current_profile_user_id(), derivado do JWT do Clerk).
 */
export async function createCompanyAction(
  _prevState: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const parsed = createCompanySchema.safeParse({
    name: formData.get("name"),
    businessType: formData.get("businessType"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const supabase = await createSessionClient();

  let user;
  try {
    user = await getCurrentUser();
  } catch (error) {
    // Conta inativa/suspensa não conclui o onboarding nem cria empresa.
    if (error instanceof AccountInactiveError) {
      return { error: ACCOUNT_BLOCKED_MESSAGE, code: "ACCOUNT_BLOCKED" };
    }
    // Falha do Supabase ao resolver a identidade não é sessão expirada.
    if (error instanceof AuthBackendError) {
      return { error: AUTH_BACKEND_MESSAGES[error.code], code: error.code };
    }
    throw error;
  }

  if (!user) {
    return { error: "Sessão expirada. Faça login novamente." };
  }

  // Antifraude do teste grátis (no servidor, antes de conceder): registra de forma atômica se esta conexão ainda pode
  // receber o teste. Negado/indisponível NÃO impede a criação da empresa — só a concessão do teste (o usuário pode
  // assinar um plano ou falar com o suporte). O banco só concede o teste com esta autorização.
  await authorizeTrialSignup(user.id);

  const { error } = await supabase.rpc("create_company_with_owner", {
    p_name: parsed.data.name,
    p_business_type: parsed.data.businessType,
  });

  if (error) {
    return {
      error: "Não foi possível criar a empresa. Tente novamente.",
    };
  }

  redirect("/app");
}

/**
 * Pedido de teste grátis por quem JÁ tem empresa mas ainda não recebeu o teste (negado antes por limite de conexão, ou a
 * autorização estava indisponível). Repete a MESMA regra do cadastro: o servidor autoriza (IP confiável -> HMAC, janela,
 * limite, auditoria) e só então o banco concede, uma única vez, à empresa do dono (claim_free_trial). Nada vem do cliente.
 */
export async function requestFreeTrialAction(): Promise<ActionResult> {
  let user;
  try {
    user = await getCurrentUser();
  } catch (error) {
    if (error instanceof AccountInactiveError) return { error: ACCOUNT_BLOCKED_MESSAGE, code: "ACCOUNT_BLOCKED" };
    if (error instanceof AuthBackendError) return { error: AUTH_BACKEND_MESSAGES[error.code], code: error.code };
    throw error;
  }
  if (!user) return { error: "Sessão expirada. Faça login novamente." };

  const authorization = await authorizeTrialSignup(user.id);
  if (!authorization.allowed) {
    if (authorization.reason === "ip_limit") return { error: TRIAL_IP_LIMIT_MESSAGE, code: "TRIAL_IP_LIMIT" };
    if (authorization.reason === "trial_already_used") return { error: TRIAL_ALREADY_USED_MESSAGE, code: "TRIAL_ALREADY_USED" };
    return { error: TRIAL_UNAVAILABLE_MESSAGE, code: "TRIAL_UNAVAILABLE" };
  }

  const supabase = (await createSessionClient()) as unknown as {
    rpc(fn: "claim_free_trial"): Promise<{ data: { granted?: boolean; reason?: string } | null; error: { message: string } | null }>;
  };
  const { data, error } = await supabase.rpc("claim_free_trial");
  if (error || !data) {
    console.error("[trial] claim_free_trial() falhou:", error?.message ?? "sem resposta");
    return { error: TRIAL_UNAVAILABLE_MESSAGE, code: "TRIAL_UNAVAILABLE" };
  }
  if (data.granted === true) {
    revalidatePath("/app", "layout");
    return { success: "Teste grátis liberado. Aproveite!" };
  }
  switch (data.reason) {
    case "already_used":
      return { error: TRIAL_ALREADY_USED_MESSAGE, code: "TRIAL_ALREADY_USED" };
    case "has_subscription":
      return { error: "Sua empresa já possui uma assinatura; o teste grátis não se aplica.", code: "TRIAL_HAS_SUBSCRIPTION" };
    case "no_company":
      return { error: "Somente o proprietário da empresa pode solicitar o teste grátis.", code: "TRIAL_NOT_OWNER" };
    default:
      return { error: TRIAL_UNAVAILABLE_MESSAGE, code: "TRIAL_UNAVAILABLE" };
  }
}
