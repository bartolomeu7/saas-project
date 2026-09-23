export type ThemePreference = "light" | "dark" | "system";
export type DensityPreference = "comfortable" | "compact";

export interface CompanySettings {
  company_id: string;
  timezone: string;
  locale: string;
  currency: string;
  week_starts_on: number;
  notifications_enabled: boolean;
  email_notifications_enabled: boolean;
  operational_preferences: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
}

export interface UserPreferences {
  user_id: string;
  theme: ThemePreference;
  density: DensityPreference;
  locale: string;
  timezone: string;
  notifications_enabled: boolean;
  email_notifications_enabled: boolean;
  created_at: string;
  updated_at: string;
}
