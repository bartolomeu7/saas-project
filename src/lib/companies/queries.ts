import "server-only";

import { createClient } from "@/lib/supabase/server";
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
export async function getCurrentCompany(): Promise<CurrentCompany | null> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const { data: membership, error: membershipError } = await supabase
    .from("company_members")
    .select("company_id, role")
    .eq("user_id", user.id)
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
}
