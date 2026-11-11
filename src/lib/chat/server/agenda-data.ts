import "server-only";

import { createSessionClient } from "@/lib/supabase/server";
import { norm, tokens } from "../text.ts";
import type { AgendaCatalog, Candidate, ProfessionalSchedule } from "../agenda-agendar.ts";
import type { DayAppointment } from "../agenda-turn.ts";
import { customersByPhone, scanCustomers, searchCustomers, type CustomerRow } from "../customer-search.ts";
import { parseLocalDateTimeSaoPaulo, endOfDaySaoPauloFromDateString } from "@/lib/timezone";

/**
 * Chat AI — leitura dos dados da Agenda para o motor. Usa a SESSÃO do usuário (RLS): só enxerga a própria empresa.
 * Tudo aqui é só leitura; o banco continua sendo a autoridade na hora de gravar (create_appointment revalida tudo).
 */

type Db = any;

/** instante → "YYYY-MM-DDTHH:mm" em São Paulo */
export function toLocalSaoPaulo(iso: string): string {
  return new Date(iso).toLocaleString("sv-SE", { timeZone: "America/Sao_Paulo" }).slice(0, 16).replace(" ", "T");
}

export async function loadAgendaCatalog(companyId: string): Promise<AgendaCatalog> {
  const supabase: Db = await createSessionClient();
  const [servicesRes, prosRes] = await Promise.all([
    supabase.from("services").select("id,name,duration_minutes,sale_price").eq("company_id", companyId).eq("status", "active").order("name"),
    supabase.from("professional_profiles").select("id,display_name,active").eq("company_id", companyId).order("display_name"),
  ]);
  const pros = (prosRes.data ?? []) as { id: string; display_name: string; active: boolean }[];
  const links = pros.length
    ? ((await supabase.from("professional_services").select("professional_id,service_id,duration_override_minutes,price_override").in("professional_id", pros.map((p) => p.id))).data ?? [])
    : [];
  return {
    services: ((servicesRes.data ?? []) as { id: string; name: string; duration_minutes: number | null; sale_price: number | string }[]).map((s) => ({
      id: s.id,
      name: s.name,
      durationMinutes: s.duration_minutes,
      price: Number(s.sale_price),
    })),
    professionals: pros.map((p) => {
      const mine = (links as { professional_id: string; service_id: string; duration_override_minutes: number | null; price_override: number | string | null }[]).filter((l) => l.professional_id === p.id);
      return {
        id: p.id,
        name: p.display_name,
        active: p.active,
        serviceIds: mine.map((l) => l.service_id),
        overrides: Object.fromEntries(mine.map((l) => [l.service_id, { durationMinutes: l.duration_override_minutes, price: l.price_override === null ? null : Number(l.price_override) }])),
      };
    }),
  };
}

/**
 * Portas de busca de cliente de UMA empresa. A lista é lida do banco no máximo uma vez por status (com a sessão do usuário,
 * então só enxerga a própria empresa) e reaproveitada nas várias buscas do mesmo turno.
 */
export function makeCustomerPorts(companyId: string) {
  const cache = new Map<string, Promise<CustomerRow[]>>();
  const load = (status: "active" | "inactive") => {
    let hit = cache.get(status);
    if (!hit) {
      hit = (async () => {
        const supabase: Db = await createSessionClient();
        const { data } = await supabase.from("customers").select("id,name,phone").eq("company_id", companyId).eq("status", status).order("name").limit(500);
        return (data ?? []) as CustomerRow[];
      })();
      cache.set(status, hit);
    }
    return hit;
  };
  return {
    findCustomers: async (text: string): Promise<Candidate[]> => searchCustomers(await load("active"), text),
    findInactiveCustomers: async (text: string): Promise<Candidate[]> => searchCustomers(await load("inactive"), text),
    findCustomersInText: async (text: string): Promise<Candidate[]> => scanCustomers(await load("active"), text),
    findCustomersByPhone: async (digits: string): Promise<Candidate[]> => customersByPhone(await load("active"), digits),
  };
}

/** Clientes ativos que combinam com o nome dito (até 5, com o final do telefone para distinguir). */
export const findCustomers = (companyId: string, text: string): Promise<Candidate[]> => makeCustomerPorts(companyId).findCustomers(text);

/** Agendamentos do dia (todos os profissionais), só para leitura/consulta. Horário local de São Paulo. */
export async function loadDayAppointments(companyId: string, date: string): Promise<DayAppointment[]> {
  const dayStart = parseLocalDateTimeSaoPaulo(`${date}T00:00`);
  const dayEnd = endOfDaySaoPauloFromDateString(date);
  if (!dayStart || !dayEnd) return [];
  const supabase: Db = await createSessionClient();
  const { data } = await supabase
    .from("appointments")
    .select("starts_at,ends_at,status,customer_id,service_id,professional_id")
    .eq("company_id", companyId)
    .gte("starts_at", dayStart.toISOString())
    .lt("starts_at", dayEnd.toISOString())
    .order("starts_at")
    .limit(60);
  const rows = (data ?? []) as { starts_at: string; ends_at: string; status: string; customer_id: string; service_id: string; professional_id: string }[];
  if (rows.length === 0) return [];
  const uniq = (xs: string[]) => [...new Set(xs)];
  const [cus, svc, pro] = await Promise.all([
    supabase.from("customers").select("id,name").in("id", uniq(rows.map((r) => r.customer_id))),
    supabase.from("services").select("id,name").in("id", uniq(rows.map((r) => r.service_id))),
    supabase.from("professional_profiles").select("id,display_name").in("id", uniq(rows.map((r) => r.professional_id))),
  ]);
  const nameOf = (list: { id: string; name?: string; display_name?: string }[] | null) => new Map((list ?? []).map((x) => [x.id, x.name ?? x.display_name ?? "—"]));
  const cm = nameOf(cus.data);
  const sm = nameOf(svc.data);
  const pm = nameOf(pro.data);
  return rows.map((r) => ({
    start: toLocalSaoPaulo(r.starts_at).slice(11, 16),
    end: toLocalSaoPaulo(r.ends_at).slice(11, 16),
    customer: cm.get(r.customer_id) ?? "—",
    service: sm.get(r.service_id) ?? "—",
    professional: pm.get(r.professional_id) ?? "—",
    status: r.status,
  }));
}

/** Clientes inativos com esse nome (só para avisar; nunca entram no agendamento). */
export const findInactiveCustomers = (companyId: string, text: string): Promise<Candidate[]> => makeCustomerPorts(companyId).findInactiveCustomers(text);

/** Expediente, bloqueios e agendamentos do profissional no dia (horário local de São Paulo). */
export async function loadSchedule(companyId: string, professionalId: string, date: string): Promise<ProfessionalSchedule | null> {
  const dayStart = parseLocalDateTimeSaoPaulo(`${date}T00:00`);
  const dayEnd = endOfDaySaoPauloFromDateString(date);
  if (!dayStart || !dayEnd) return null;
  const supabase: Db = await createSessionClient();
  const [avail, blocks, busy] = await Promise.all([
    supabase.from("professional_availability").select("weekday,start_time,end_time").eq("professional_id", professionalId).eq("active", true),
    supabase.from("professional_blocks").select("starts_at,ends_at,reason").eq("company_id", companyId).eq("professional_id", professionalId).lt("starts_at", dayEnd.toISOString()).gt("ends_at", dayStart.toISOString()),
    supabase
      .from("appointments")
      .select("starts_at,ends_at,status")
      .eq("company_id", companyId)
      .eq("professional_id", professionalId)
      .in("status", ["scheduled", "confirmed"])
      .lt("starts_at", dayEnd.toISOString())
      .gt("ends_at", dayStart.toISOString()),
  ]);
  if (avail.error || blocks.error || busy.error) return null;
  return {
    availability: ((avail.data ?? []) as { weekday: number; start_time: string; end_time: string }[]).map((r) => ({ weekday: r.weekday, start: r.start_time.slice(0, 5), end: r.end_time.slice(0, 5) })),
    blocks: ((blocks.data ?? []) as { starts_at: string; ends_at: string; reason: string | null }[]).map((b) => ({ start: toLocalSaoPaulo(b.starts_at), end: toLocalSaoPaulo(b.ends_at), reason: b.reason ?? undefined })),
    busy: ((busy.data ?? []) as { starts_at: string; ends_at: string }[]).map((a) => ({ start: toLocalSaoPaulo(a.starts_at), end: toLocalSaoPaulo(a.ends_at) })),
  };
}
