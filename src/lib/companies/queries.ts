import "server-only";

import { cache } from "react";
import { createSessionClient } from "@/lib/supabase/server";
import { getClerkInternalUserId } from "@/lib/auth/clerk-session";
import type { Company, CompanyRole, CurrentCompany } from "@/types/company";

/**
 * Retorna a empresa atual do usuário autenticado (a primeira encontrada
 * em company_members) junto com a role dele nessa empresa, ou null se o
 * usuário não tiver nenhuma empresa ainda (fluxo de onboarding) ou não
 * estiver autenticado.
 *
 * Protegido por RLS: só é possível ler os próprios vínculos
 * (company_members) e empresas às quais o usuário pertence.
 */
export const getCurrentCompany = cache(async function getCurrentCompany(): Promise<CurrentCompany | null> {
  const supabase = await createSessionClient();

  // Só o id interno: não precisa esperar a API do Clerk (e-mail) para achar a empresa.
  const userId = await getClerkInternalUserId();

  if (!userId) {
    return null;
  }

  const { data: membership, error: membershipError } = await supabase
    .from("company_members")
    .select("company_id, role")
    .eq("user_id", userId)
    // Determinístico mesmo se uma duplicidade histórica existir: sempre a
    // membership mais antiga (a "empresa original" do usuário), nunca uma
    // ordem dependente do plano de execução do banco. Ver migration 017.
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (membershipError || !membership) {
    return null;
  }

  const { data: company, error: companyError } = await supabase
    .from("companies")
    .select("*")
    .eq("id", membership.company_id)
    .single();

  if (companyError || !company) {
    return null;
  }

  return {
    company: company as Company,
    role: membership.role as CompanyRole,
  };
});
