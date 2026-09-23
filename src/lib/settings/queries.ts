import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { CompanySettings, UserPreferences } from "@/types/settings";

export async function getCompanySettings(): Promise<CompanySettings | null> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("ensure_company_settings");
  if (error || !data) return null;
  return data as unknown as CompanySettings;
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
