import { MetricCard } from "@/components/app/metric-card";
import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentCompany } from "@/lib/companies/queries";
import {
  getAgendaStats,
  listAgendaCustomers,
  listAgendaProfessionals,
  listAgendaServices,
  listAppointments,
} from "@/lib/agenda/queries";
import {
  AppointmentForm,
  AppointmentStatusForm,
  RescheduleForm,
} from "@/components/app/agenda-action-forms";
import { APPOINTMENT_STATUS_LABELS } from "@/types/appointment";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Agenda" };

function isoTodaySaoPaulo() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

function shiftDate(dateValue: string, amount: number) {
  const [year = 1970, month = 1, day = 1] = dateValue.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function dateLabel(dateValue: string) {
  const parts = dateValue.split("-").map(Number);
  const year = parts[0] ?? 1970;
  const month = parts[1] ?? 1;
  const day = parts[2] ?? 1;
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}

function localInputValue(value: string) {
  const formatter = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "short",
  });
  return formatter.format(new Date(value)).replace(" ", "T").slice(0, 16);
}

function statusBadge(status: string) {
  const base = "inline-flex rounded-full border px-2 py-1 text-xs";
  if (status === "confirmed") return base + " border-emerald-500/30 bg-emerald-500/10";
  if (status === "completed") return base + " border-sky-500/30 bg-sky-500/10";
  if (status === "cancelled") return base + " text-muted-foreground";
  return base;
}

export default async function AgendaPage({
  searchParams,
}: {
  searchParams?: { date?: string | string[]; professional?: string | string[] };
}) {
  const current = (await getCurrentCompany())!;
  const rawDate = searchParams?.date;
  const rawProfessional = searchParams?.professional;
  const requestedDate = Array.isArray(rawDate) ? rawDate[0] : rawDate;
  const professional = Array.isArray(rawProfessional) ? rawProfessional[0] : rawProfessional;
  const date = requestedDate && /^\d{4}-\d{2}-\d{2}$/.test(requestedDate) ? requestedDate : isoTodaySaoPaulo();

  const [appointments, professionals, customers, services, stats] = await Promise.all([
    listAppointments(current.company.id, date, professional),
    listAgendaProfessionals(current.company.id),
    listAgendaCustomers(current.company.id),
    listAgendaServices(current.company.id),
    getAgendaStats(current.company.id, date),
  ]);

  return (
    <div className="prime-module-page prime-module-page--agenda flex flex-col gap-6 px-4 py-6 sm:px-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-primary">Operação</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Agenda</h1>
          <p className="mt-1 text-sm text-muted-foreground capitalize">{dateLabel(date)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={"/app/agenda?date=" + shiftDate(date, -1)} className="inline-flex h-9 items-center rounded-md border px-3 text-sm hover:bg-muted">← Dia anterior</Link>
          <Link href="/app/agenda" className="inline-flex h-9 items-center rounded-md border px-3 text-sm hover:bg-muted">Hoje</Link>
          <Link href={"/app/agenda?date=" + shiftDate(date, 1)} className="inline-flex h-9 items-center rounded-md border px-3 text-sm hover:bg-muted">Próximo dia →</Link>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <MetricCard label="Total" value={stats.total} />
        <MetricCard label="Agendados" value={stats.scheduled} />
        <MetricCard label="Confirmados" value={stats.confirmed} />
        <MetricCard label="Concluídos" value={stats.completed} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[360px_1fr]">
        <section className="rounded-xl border bg-card p-5">
          <div className="mb-5">
            <h2 className="font-semibold">Novo agendamento</h2>
            <p className="mt-1 text-sm text-muted-foreground">O sistema bloqueia conflito de profissional, bloqueios e disponibilidade configurada.</p>
          </div>
          {services.length ? (
            <AppointmentForm
              date={date}
              customers={customers}
              services={services as { id: string; name: string; duration_minutes: number; sale_price: number }[]}
              professionals={professionals as { id: string; display_name: string; color: string }[]}
            />
          ) : (
            <div className="rounded-lg border border-dashed p-5 text-center">
              <p className="font-medium">Nenhum serviço ativo</p>
              <p className="mt-1 text-sm text-muted-foreground">Cadastre pelo menos um serviço para começar a usar a agenda.</p>
              <Link href="/app/servicos/novo" className="mt-4 inline-flex h-9 items-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground">Novo serviço</Link>
            </div>
          )}
        </section>

        <section className="rounded-xl border bg-card">
          <div className="flex flex-col gap-3 border-b px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-semibold">Atendimentos do dia</h2>
              <p className="text-sm text-muted-foreground">Selecione um profissional para focar a agenda.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href={"/app/agenda?date=" + date} className={cn("rounded-full border px-3 py-1.5 text-xs", !professional && "bg-primary text-primary-foreground")}>Todos</Link>
              {professionals.map((person) => (
                <Link
                  key={person.id}
                  href={"/app/agenda?date=" + date + "&professional=" + person.id}
                  className={cn("rounded-full border px-3 py-1.5 text-xs", professional === person.id && "bg-primary text-primary-foreground")}
                >
                  {person.display_name}
                </Link>
              ))}
            </div>
          </div>

          <div className="divide-y">
            {appointments.map((appointment) => (
              <div key={appointment.id} className="prime-agenda-row p-5">
                <div className="grid gap-4 lg:grid-cols-[110px_1fr_auto]">
                  <div>
                    <p className="text-lg font-semibold">
                      {new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(appointment.starts_at))}
                    </p>
                    <p className="text-xs text-muted-foreground">{appointment.duration_minutes} min</p>
                  </div>

                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-medium">{appointment.service_name ?? "Serviço"}</h3>
                      <span className={statusBadge(appointment.status)}>{APPOINTMENT_STATUS_LABELS[appointment.status]}</span>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {appointment.customer_name ?? "Sem cliente"} • {appointment.professional_name ?? "Sem profissional"}
                    </p>
                    {appointment.notes ? <p className="mt-2 text-sm">{appointment.notes}</p> : null}
                  </div>

                  <div className="flex flex-wrap gap-2 lg:justify-end">
                    {appointment.status === "scheduled" ? <AppointmentStatusForm appointmentId={appointment.id} status="confirmed" label="Confirmar" /> : null}
                    {appointment.status === "confirmed" ? <AppointmentStatusForm appointmentId={appointment.id} status="completed" label="Concluir" /> : null}
                    {appointment.status === "scheduled" || appointment.status === "confirmed" ? (
                      <AppointmentStatusForm appointmentId={appointment.id} status="cancelled" label="Cancelar" destructive />
                    ) : null}
                    {appointment.status === "confirmed" || appointment.status === "scheduled" ? (
                      <details className="w-full lg:w-auto">
                        <summary className="cursor-pointer rounded-md border px-3 py-2 text-sm font-medium">Reagendar</summary>
                        <div className="mt-2 min-w-[280px] rounded-lg border bg-card p-3">
                          <RescheduleForm appointment={appointment} defaultValue={localInputValue(appointment.starts_at)} />
                        </div>
                      </details>
                    ) : null}
                  </div>
                </div>
              </div>
            ))}

            {!appointments.length ? (
              <div className="p-12 text-center">
                <p className="font-medium">Agenda livre neste dia</p>
                <p className="mt-1 text-sm text-muted-foreground">Nenhum atendimento encontrado para os filtros atuais.</p>
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}
