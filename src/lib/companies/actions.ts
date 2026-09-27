"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createClerkSupabaseClient } from "@/lib/supabase/clerk-client";
import { isClerkEnabled } from "@/lib/clerk/config";
import { getCurrentUser } from "@/lib/auth/session";
import { createCompanySchema } from "@/lib/validations/company";
import type { ActionResult } from "@/lib/auth/actions";

/**
 * Cria a empresa do usuário autenticado e o torna owner, através da
 * função de banco `create_company_with_owner` (security definer).
 *
 * Nenhum user_id, role ou company_id é aceito do formulário — a função
 * do banco resolve tudo a partir da sessão autenticada (auth.uid()).
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

  // Fase 5B-APP: create_company_with_owner ainda resolve auth.uid()
  // internamente (RPC não migrada — fora do escopo desta fase). Com Clerk,
  // essa chamada falha com 22P02, esperado até a Migration F.
  const supabase = isClerkEnabled ? createClerkSupabaseClient() : createClient();

  const user = await getCurrentUser();

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
