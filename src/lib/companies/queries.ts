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

export interface CompanyLogoMeta {
  contentType: string;
  sizeBytes: number;
  updatedAt: string;
}

/** Só os dados do logo (sem a imagem): para a tela saber se existe e para o cache do navegador. */
export async function getCompanyLogoMeta(companyId: string): Promise<CompanyLogoMeta | null> {
  const supabase = (await createSessionClient()) as any;
  const { data } = await supabase.from("company_logos").select("content_type, size_bytes, updated_at").eq("company_id", companyId).maybeSingle();
  if (!data) return null;
  return { contentType: String(data.content_type), sizeBytes: Number(data.size_bytes), updatedAt: String(data.updated_at) };
}

/** O logo com os bytes da imagem (rota do logo e, nas próximas fases, o PDF do orçamento). */
export async function loadCompanyLogo(companyId: string): Promise<{ contentType: string; bytes: Buffer; updatedAt: string } | null> {
  const supabase = (await createSessionClient()) as any;
  const { data } = await supabase.from("company_logos").select("content_type, data_base64, updated_at").eq("company_id", companyId).maybeSingle();
  if (!data) return null;
  return { contentType: String(data.content_type), bytes: Buffer.from(String(data.data_base64), "base64"), updatedAt: String(data.updated_at) };
}

export interface QuoteDefaults {
  validityDays: number;
  paymentTerms: string;
  footer: string;
}

export const DEFAULT_QUOTE_DEFAULTS: QuoteDefaults = { validityDays: 15, paymentTerms: "", footer: "" };

/** Padrões dos orçamentos da empresa (validade, condições, rodapé); sem nada salvo, valem os padrões do sistema (15 dias). */
export async function getQuoteDefaults(companyId: string): Promise<QuoteDefaults> {
  const supabase = (await createSessionClient()) as any;
  const { data } = await supabase.from("company_settings").select("operational_preferences").eq("company_id", companyId).maybeSingle();
  const quote = (data?.operational_preferences as { quote?: Record<string, unknown> } | null)?.quote;
  if (!quote || typeof quote !== "object") return DEFAULT_QUOTE_DEFAULTS;
  const days = Number(quote.validity_days);
  return {
    validityDays: Number.isInteger(days) && days >= 1 && days <= 365 ? days : DEFAULT_QUOTE_DEFAULTS.validityDays,
    paymentTerms: typeof quote.payment_terms === "string" ? quote.payment_terms : "",
    footer: typeof quote.footer === "string" ? quote.footer : "",
  };
}
