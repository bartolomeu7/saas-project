import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/supabase";

export async function getPlatformOverview() {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("get_platform_admin_overview").maybeSingle();
  if (error || !data) return null;
  return data;
}

export async function listPlatformCompanies() {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("list_platform_admin_companies");
  if (error) return [];
  return data ?? [];
}

export type PlatformCompany =
  Database["public"]["Functions"]["list_platform_admin_companies"]["Returns"][number];
