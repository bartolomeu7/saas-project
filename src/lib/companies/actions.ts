"use server";

import { redirect } from "next/navigation";
import { createSessionClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { AUTH_BACKEND_MESSAGES, AuthBackendError } from "@/lib/auth/token-claims";
import { ACCOUNT_BLOCKED_MESSAGE, AccountInactiveError } from "@/lib/auth/account-status";
import { createCompanySchema } from "@/lib/validations/company";
import type { ActionResult } from "@/lib/auth/actions";

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
