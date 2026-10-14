import "server-only";

import { cache } from "react";
import { createSessionClient } from "@/lib/supabase/server";
import type {
  ProfessionalAvailability,
  ProfessionalBlock,
  ProfessionalProfile,
  ProfessionalService,
  TeamMember,
} from "@/types/team";

export const listCompanyTeam = cache(async function listCompanyTeam(): Promise<TeamMember[]> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase.rpc("list_company_team");
  if (error) return [];
  return (data ?? []) as TeamMember[];
});

export interface SeatUsage {
  additionalUsed: number;
  additionalMax: number;
  totalUsed: number;
  totalAllowed: number;
  overLimit: boolean;
  atLimit: boolean;
}

/** Uso de vagas da empresa do usuário (get_company_seat_usage): proprietário + adicionais, com aviso de excesso. */
export const getSeatUsage = cache(async function getSeatUsage(): Promise<SeatUsage | null> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase.rpc("get_company_seat_usage");
  if (error || !data || typeof data !== "object" || Array.isArray(data)) return null;
  const d = data as Record<string, number | boolean>;
  return {
    additionalUsed: Number(d.additional_used ?? 0),
    additionalMax: Number(d.additional_max ?? 0),
    totalUsed: Number(d.total_used ?? 1),
    totalAllowed: Number(d.total_allowed ?? 1),
    overLimit: d.over_limit === true,
    atLimit: d.at_limit === true,
  };
});

export async function getProfessionalWorkspace(
  companyId: string,
  professionalId: string
): Promise<{
  professional: ProfessionalProfile | null;
  services: ProfessionalService[];
  availability: ProfessionalAvailability[];
  blocks: ProfessionalBlock[];
}> {
  const supabase = await createSessionClient();

  const [professionalResult, serviceResult, availabilityResult, blockResult] =
    await Promise.all([
      supabase
        .from("professional_profiles")
        .select("*")
        .eq("company_id", companyId)
        .eq("id", professionalId)
        .maybeSingle(),
      supabase
        .from("professional_services")
        .select("*, services(name, duration_minutes, sale_price)")
        .eq("professional_id", professionalId)
        .order("created_at"),
      supabase
        .from("professional_availability")
        .select("*")
        .eq("professional_id", professionalId)
        .order("weekday")
        .order("start_time"),
      supabase
        .from("professional_blocks")
        .select("*")
        .eq("company_id", companyId)
        .eq("professional_id", professionalId)
        .order("starts_at", { ascending: true })
        .limit(50),
    ]);

  const services = (serviceResult.data ?? []).map((row) => {
    const relation = row.services as
      | { name: string; duration_minutes: number; sale_price: number }
      | null;
    return {
      id: row.id,
      professional_id: row.professional_id,
      service_id: row.service_id,
      duration_override_minutes: row.duration_override_minutes,
      price_override: row.price_override,
      service_name: relation?.name,
      service_duration_minutes: relation?.duration_minutes,
      service_price: relation?.sale_price,
    } as ProfessionalService;
  });

  return {
    professional: (professionalResult.data ?? null) as ProfessionalProfile | null,
    services,
    availability: (availabilityResult.data ?? []) as ProfessionalAvailability[],
    blocks: (blockResult.data ?? []) as ProfessionalBlock[],
  };
}

export async function listProfessionalServices(companyId: string) {
  const supabase = await createSessionClient();
  const { data } = await supabase
    .from("services")
    .select("id,name,duration_minutes,sale_price")
    .eq("company_id", companyId)
    .eq("status", "active")
    .order("name");

  return data ?? [];
}
