import "server-only";

import { createClient } from "@/lib/supabase/server";
import { endOfDaySaoPaulo, startOfDaySaoPauloFromDateString } from "@/lib/timezone";
import type { Appointment } from "@/types/appointment";

export function dateRangeSaoPaulo(dateValue: string): { from: string; to: string } {
  const parsed = startOfDaySaoPauloFromDateString(dateValue);
  const start = parsed ?? new Date();
  const end = endOfDaySaoPaulo(start);
  return { from: start.toISOString(), to: end.toISOString() };
}

export async function listAppointments(
  companyId: string,
  dateValue: string,
  professionalId?: string
): Promise<Appointment[]> {
  const supabase = createClient();
  const { from, to } = dateRangeSaoPaulo(dateValue);

  let query = supabase
    .from("appointments")
    .select(
      "*, customers(name), services(name), professional_profiles(display_name,color)"
    )
    .eq("company_id", companyId)
    .gte("starts_at", from)
    .lte("starts_at", to)
    .order("starts_at", { ascending: true });

  if (professionalId) query = query.eq("professional_id", professionalId);

  const { data } = await query;

  return (data ?? []).map((row) => {
    const customer = row.customers as { name: string } | null;
    const service = row.services as { name: string } | null;
    const professional = row.professional_profiles as
      | { display_name: string; color: string }
      | null;

    return {
      ...(row as Appointment),
      customer_name: customer?.name ?? null,
      service_name: service?.name ?? null,
      professional_name: professional?.display_name ?? null,
      professional_color: professional?.color ?? null,
    };
  });
}

export async function listAgendaProfessionals(companyId: string) {
  const supabase = createClient();
  const { data } = await supabase
    .from("professional_profiles")
    .select("id,display_name,color")
    .eq("company_id", companyId)
    .eq("active", true)
    .order("display_name");

  return data ?? [];
}

export async function listAgendaCustomers(companyId: string) {
  const supabase = createClient();
  const { data } = await supabase
    .from("customers")
    .select("id,name,phone")
    .eq("company_id", companyId)
    .eq("status", "active")
    .order("name")
    .limit(500);

  return data ?? [];
}

export async function listAgendaServices(companyId: string) {
  const supabase = createClient();
  const { data } = await supabase
    .from("services")
    .select("id,name,duration_minutes,sale_price")
    .eq("company_id", companyId)
    .eq("status", "active")
    .order("name");

  return data ?? [];
}

export async function getAgendaStats(companyId: string, dateValue: string) {
  const rows = await listAppointments(companyId, dateValue);
  return {
    total: rows.length,
    scheduled: rows.filter((row) => row.status === "scheduled").length,
    confirmed: rows.filter((row) => row.status === "confirmed").length,
    completed: rows.filter((row) => row.status === "completed").length,
    cancelled: rows.filter((row) => row.status === "cancelled").length,
  };
}
