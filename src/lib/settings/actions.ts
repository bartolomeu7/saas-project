"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentCompany } from "@/lib/companies/queries";
import type { ActionResult } from "@/lib/auth/actions";

const VALID_THEMES = new Set(["light", "dark", "system"]);
const VALID_DENSITIES = new Set(["comfortable", "compact");
const VALID_WEEKDAYS = new Set(["0", "1", "2", "3", "4", "5", "6"]);

export async function updateCompanySettingsAction(
  _prevState: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const current = await getCurrentCompany();
  if (!current || (current.role !== "owner" && current.role !== "admin")) {
    return { error: "Você não tem permissão para alterar as configurações da empresa." };
  }

  const timezone = String(formData.get("timezone") ?? "").trim();
  const weekStartsOn = String(formData.get("weekStartsOn") ?? "1");
  if (!timezone || !VALID_WEEKDAYS.has(weekStartsOn)) {
    return { error: "Revise o fuso horário e o início da semana." };
  }

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão expirada. Faça login novamente." };

  const { error } = await supabase.from("company_settings").upsert(
    {
      company_id: current.company.id,
      timezone,
      locale: "pt-BR",
      currency: "BRL",
      week_starts_on: Number(weekStartsOn),
      notifications_enabled: formData.get("notificationsEnabled") === "on",
      email_notifications_enabled: formData.get("emailNotificationsEnabled") === "on",
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "company_id" }
  );

  if (error) return { error: "Não foi possível salvar as configurações da empresa." };

  await supabase.from("audit_logs").insert({
    company_id: current.company.id,
    actor_user_id: user.id,
    entity_type: "company_settings",
    entity_id: current.company.id,
    action: "updated",
    metadata: { timezone, week_starts_on: Number(weekStartsOn) },
  });

  revalidatePath("/app/configuracoes");
  return { success: "Configurações da empresa salvas." };
}

export async function updateUserPreferencesAction(
  _prevState: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const theme = String(formData.get("theme") ?? "system");
  const density = String(formData.get("density") ?? "comfortable");
  const timezone = String(formData.get("timezone") ?? "").trim();

  if (!VALID_THEMES.has(theme) || !VALID_DENSITIES.has(density) || !timezone) {
    return { error: "Preferências inválidas." };
  }

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão expirada. Faça login novamente." };

  const { error } = await supabase.from("user_preferences").upsert(
    {
      user_id: user.id,
      theme: theme as "light" | "dark" | "system",
      density: density as "comfortable" | "compact",
      locale: "pt-BR",
      timezone,
      notifications_enabled: formData.get("notificationsEnabled") === "on",
      email_notifications_enabled: formData.get("emailNotificationsEnabled") === "on",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );

  if (error) return { error: "Não foi possível salvar suas preferências." };

  revalidatePath("/app/configuracoes");
  return { success: "Preferências salvas." };
}
