import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { CompanySettings, UserPreferences } from "@/types/settings";

const DEFAULT_COMPANY_SETTINGS: Omit<CompanySettings, "company_id" | "created_at" | "updated_at" | "updated_by"> = {
  timezone: "America/Sao_Paulo",
  locale: "pt-BR",
  currency: "BRL",
  week_starts_on: 1,
  notifications_enabled: true,
  email_notifications_enabled: true,
  operational_preferences: {},
};

export async function getCompanySettings(companyId: string): Promise<CompanySettings> {
  const supabase = createClient();
  const { data } = await supabase
    .from("company_settings")
    .select("*")
    .eq("company_id", companyId)
    .maybeSingle();

  if (data) return data as CompanySettings;

  return {
    company_id: companyId,
    ...DEFAULT_COMPANY_SETTINGS,
    created_at: "",
    updated_at: "",
    updated_by: null,
  };
}

export async function getUserPreferences(): Promise<UserPreferences | null> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("user_preferences")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  return data ? (data as UserPreferences) : null;
}

export async function listRecentAuditLogs(companyId: string) {
  const supabase = createClient();
  const { data } = await supabase
    .from("audit_logs")
    .select("id, actor_user_id, entity_type, entity_id, action, metadata, created_at")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(50);

  return data ?? [];
}
