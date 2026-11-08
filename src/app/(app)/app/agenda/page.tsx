import { CalendarCheck, CalendarClock, CalendarDays, CheckCircle2 } from "lucide-react";
import { MetricCard } from "@/components/app/metric-card";
import { PageHeader } from "@/components/app/page-header";
import { buttonVariants } from "@/components/ui/button";
import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentCompany } from "@/lib/companies/queries";
import {
  getAgendaStats,
  listAgendaCustomers,
  listAgendaProfessionals,
  listAgendaServices,
  listAppointments,
  listAppointmentsBetween,
} from "@/lib/agenda/queries";
import {
  AppointmentForm,
  AppointmentStatusForm,
  CompleteAppointmentForm,
  RescheduleForm,
} from "@/components/app/agenda-action-forms";
import { AgendaWeekCalendar } from "@/components/app/agenda-week-calendar";
import {
  AGENDA_WEEK_KEYS,
  AGENDA_WEEK_LABELS,
  getWeekBounds,
  resolveWeekKey,
  shortDateLabel,
  type AgendaWeekKey,
} from "@/lib/agenda/week-view";
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
  searchParams: searchParamsPromise,
}: {
  searchParams: Promise<{ date?: string | string[]; professional?: string | string[]; semana?: string | string[]; visao?: string | string[] }>;
}) {
  const searchParams = await searchParamsPromise;
  const current = (await getCurrentCompany())!;
  const rawDate = searchParams?.date;
  const rawProfessional = searchParams?.professional;
  const rawWeek = searchParams?.semana;
  const rawView = searchParams?.visao;
  const requestedDate = Array.isArray(rawDate) ? rawDate[0] : rawDate;
  const professional = Array.isArray(rawProfessional) ? rawProfessional[0] : rawProfessional;
  const date = requestedDate && /^\d{4}-\d{2}-\d{2}$/.test(requestedDate) ? requestedDate : isoTodaySaoPaulo();
  const weekKey = resolveWeekKey(Array.isArray(rawWeek) ? rawWeek[0] : rawWeek);
  // "Dia": o dia escolhido em grade de horas, uma coluna por profissional. "Semana" (padrão): as 3 semanas.
  const view: "semana" | "dia" = (Array.isArray(rawView) ? rawView[0] : rawView) === "dia" ? "dia" : "semana";
  const today = isoTodaySaoPaulo();
  const week = getWeekBounds(weekKey, today);

  // Mantém semana, dia e profissional escolhidos ao navegar.
  function agendaHref(next: { date?: string; semana?: AgendaWeekKey; professional?: string | null; visao?: "semana" | "dia" }) {
    const params = new URLSearchParams();
    params.set("date", next.date ?? date);
    const semana = next.semana ?? weekKey;
    if (semana !== "atual") params.set("semana", semana);
    const visao = next.visao ?? view;
    if (visao === "dia") params.set("visao", "dia");
    const person = next.professional === undefined ? professional : next.professional;
    if (person) params.set("professional", person);
    return "/app/agenda?" + params.toString();
  }

  const [appointments, calendarAppointments, professionals, customers, services, stats] = await Promise.all([
    listAppointments(current.company.id, date, professional),
    // A visão "Dia" usa a lista do próprio dia; só a visão "Semana" precisa dos atendimentos da semana inteira.
    view === "semana" ? listAppointmentsBetween(current.company.id, week.fromIso, week.toIso, professional) : Promise.resolve([]),
    listAgendaProfessionals(current.company.id),
    listAgendaCustomers(current.company.id),
    listAgendaServices(current.company.id),
    getAgendaStats(current.company.id, date),
  ]);

  return (
    <div className="prime-module-page prime-module-page--agenda flex flex-col gap-6 px-4 py-6 sm:px-6">
      <PageHeader
        eyebrow="Operação"
        title="Agenda"
        description={<span className="capitalize">{dateLabel(date)}</span>}
        className="xl:items-end"
        actions={
          <nav aria-label="Navegar entre os dias" className="flex flex-wrap gap-2">
            <Link href={agendaHref({ date: shiftDate(date, -1) })} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>← Dia anterior</Link>
            <Link href="/app/agenda" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>Hoje</Link>
            <Link href={agendaHref({ date: shiftDate(date, 1) })} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>Próximo dia →</Link>
          </nav>
        }
      />

      <section aria-labelledby="agenda-semanas" className="rounded-xl border border-border bg-card/40">
        <div className="flex flex-col gap-3 border-b px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 id="agenda-semanas" className="font-semibold">{view === "dia" ? "Agenda do dia" : "Agenda da semana"}</h2>
            <p className="text-sm text-muted-foreground">
              {view === "dia" ? <span className="capitalize">{dateLabel(date)}</span> : <>{shortDateLabel(week.start)} a {shortDateLabel(week.end)}</>}
              {" "}· clique em um serviço para concluir, reagendar ou cancelar.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <nav aria-label="Escolher a visão" className="flex gap-1 rounded-full border p-0.5">
              {(["semana", "dia"] as const).map((option) => (
                <Link
                  key={option}
                  href={agendaHref({ visao: option })}
                  aria-current={option === view ? "true" : undefined}
                  className={cn("rounded-full px-3 py-1 text-xs", option === view && "bg-primary text-primary-foreground")}
                >
                  {option === "semana" ? "Semana" : "Dia"}
                </Link>
              ))}
            </nav>
            {view === "semana" ? (
              <nav aria-label="Escolher a semana" className="flex flex-wrap gap-2">
                {AGENDA_WEEK_KEYS.map((key) => (
                  <Link
                    key={key}
                    href={agendaHref({ semana: key })}
                    aria-current={key === weekKey ? "true" : undefined}
                    className={cn("rounded-full border px-3 py-1.5 text-xs", key === weekKey && "bg-primary text-primary-foreground")}
                  >
                    {AGENDA_WEEK_LABELS[key]}
                  </Link>
                ))}
              </nav>
            ) : null}
          </div>
        </div>
        <div className="p-4 sm:p-5">
          <AgendaWeekCalendar
            mode={view === "dia" ? "day" : weekKey === "atual" ? "hours" : "days"}
            days={week.days}
            appointments={view === "dia" ? appointments : calendarAppointments}
            professionals={professionals as { id: string; display_name: string; color: string }[]}
            dayDate={date}
            todayDate={today}
            nowIso={new Date().toISOString()}
            weekKey={weekKey}
            professionalId={professional}
          />
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-4">
        <MetricCard label="Total" value={stats.total} icon={CalendarDays} />
        <MetricCard label="Agendados" value={stats.scheduled} icon={CalendarClock} />
        <MetricCard label="Confirmados" value={stats.confirmed} icon={CalendarCheck} />
        <MetricCard label="Concluídos" value={stats.completed} icon={CheckCircle2} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[360px_1fr]">
        <section className="rounded-xl border border-border bg-card/40 p-5">
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

        <section id="atendimentos-do-dia" className="scroll-mt-20 rounded-xl border border-border bg-card/40">
          <div className="flex flex-col gap-3 border-b px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-semibold">Atendimentos do dia</h2>
              <p className="text-sm text-muted-foreground">Selecione um profissional para focar a agenda.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href={agendaHref({ professional: null })} aria-current={!professional ? "true" : undefined} className={cn("rounded-full border px-3 py-1.5 text-xs", !professional && "bg-primary text-primary-foreground")}>Todos</Link>
              {professionals.map((person) => (
                <Link
                  key={person.id}
                  aria-current={professional === person.id ? "true" : undefined}
                  href={agendaHref({ professional: person.id })}
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
                    {appointment.status === "scheduled" || appointment.status === "confirmed" ? (
                      <details className="w-full lg:w-auto">
                        <summary className="cursor-pointer rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground">Concluir</summary>
                        <div className="mt-2 min-w-[280px] rounded-lg border bg-card p-3">
                          <CompleteAppointmentForm appointment={appointment} />
                        </div>
                      </details>
                    ) : null}
                    {appointment.sale_id ? (
                      <Link href={`/app/vendas/${appointment.sale_id}`} className="rounded-md border px-3 py-2 text-sm font-medium">Ver venda</Link>
                    ) : null}
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
