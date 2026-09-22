import type { Database } from "@/types/supabase";

export type CompanyRole = Database["public"]["Enums"]["company_role"];

export interface TeamMember {
  member_id: string;
  user_id: string;
  role: CompanyRole;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
  professional_id: string | null;
  display_name: string | null;
  phone: string | null;
  specialty: string | null;
  color: string | null;
  notes: string | null;
  professional_active: boolean | null;
}

export interface ProfessionalProfile {
  id: string;
  company_id: string;
  company_member_id: string;
  display_name: string;
  phone: string | null;
  specialty: string | null;
  color: string;
  notes: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProfessionalService {
  id: string;
  professional_id: string;
  service_id: string;
  duration_override_minutes: number | null;
  price_override: number | null;
  service_name?: string;
  service_duration_minutes?: number;
  service_price?: number;
}

export interface ProfessionalAvailability {
  id: string;
  professional_id: string;
  weekday: number;
  start_time: string;
  end_time: string;
  active: boolean;
}

export interface ProfessionalBlock {
  id: string;
  company_id: string;
  professional_id: string;
  starts_at: string;
  ends_at: string;
  reason: string | null;
  created_by: string | null;
  created_at: string;
}
