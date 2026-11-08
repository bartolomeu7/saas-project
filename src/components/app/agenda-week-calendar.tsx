"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AppointmentStatusForm, CompleteAppointmentForm, RescheduleForm } from "@/components/app/agenda-action-forms";
import {
  AGENDA_VISUAL_LABELS,
  appointmentVisualState,
  dayKeyOf,
  matchesSearch,
  shortDateLabel,
  timeLabel,
  weekdayShort,
  type AgendaVisualState,
} from "@/lib/agenda/week-view";
import { professionalDotClass, STATE_STYLES } from "@/components/app/agenda-visual";
import { TimeGrid, type TimeGridColumn } from "@/components/app/agenda-time-grid";
import { MonthGrid } from "@/components/app/agenda-month-grid";
import type { Appointment } from "@/types/appointment";
import { cn } from "@/lib/utils";

const LEGEND_ORDER: AgendaVisualState[] = ["done", "pending", "upcoming", "cancelled"];

function localInputValue(value: string): string {
  const formatter = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "short",
  });
  return formatter.format(new Date(value)).replace(" ", "T").slice(0, 16);
}

function formatMoney(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export interface AgendaProfessional {
  id: string;
  display_name: string;
  color: string;
}

interface AgendaWeekCalendarProps {
  /**
   * "hours": semana em grade de horas, atendimentos do tamanho da duração (semana atual).
   * "days": lista por dia (semana passada e próxima).
   * "day": um dia só, em grade de horas, uma coluna por profissional.
   * "month": o mês inteiro, semanas de domingo a sábado.
   */
  mode: "hours" | "days" | "day" | "month";
  days: string[];
  appointments: Appointment[];
  todayDate: string;
  nowIso: string;
  weekKey: string;
  professionalId?: string;
  /** Profissionais ativos (colunas da visão "Dia"). */
  professionals?: AgendaProfessional[];
  /** Dia mostrado na visão "Dia" (YYYY-MM-DD) ou qualquer dia do mês na visão "Mês". */
  dayDate?: string;
}

export function AgendaWeekCalendar({
  mode,
  days,
  appointments,
  todayDate,
  nowIso,
  weekKey,
  professionalId,
  professionals = [],
  dayDate,
}: AgendaWeekCalendarProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const now = useMemo(() => new Date(nowIso), [nowIso]);

  // A busca filtra o que já está na tela (semana, dia ou mês escolhido): cliente, serviço, profissional e observação.
  const visible = useMemo(() => (query.trim() ? appointments.filter((row) => matchesSearch(row, query)) : appointments), [appointments, query]);

  const byDay = useMemo(() => {
    const map = new Map<string, Appointment[]>();
    for (const day of days) map.set(day, []);
    for (const appointment of visible) {
      const list = map.get(dayKeyOf(appointment.starts_at));
      if (list) list.push(appointment);
    }
    return map;
  }, [visible, days]);

  const selected = appointments.find((row) => row.id === selectedId) ?? null;

  const weekColumns = useMemo<TimeGridColumn[]>(
    () =>
      days.map((day) => ({
        key: day,
        date: day,
        title: weekdayShort(day),
        subtitle: shortDateLabel(day),
        href: dayHref(day),
        items: byDay.get(day) ?? [],
      })),
    // dayHref depende só de weekKey e professionalId
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [days, byDay, weekKey, professionalId]
  );

  const professionalColumns = useMemo<TimeGridColumn[]>(() => {
    const date = dayDate ?? todayDate;
    const shownProfessionals = professionalId ? professionals.filter((person) => person.id === professionalId) : professionals;
    const known = new Set(shownProfessionals.map((person) => person.id));
    const columns: TimeGridColumn[] = shownProfessionals.map((person) => ({
      key: person.id,
      date,
      title: person.display_name,
      dotClass: professionalDotClass(person.color),
      items: visible.filter((row) => row.professional_id === person.id),
    }));
    const unassigned = visible.filter((row) => !row.professional_id || !known.has(row.professional_id));
    // "Sem profissional" aparece quando há atendimento sem profissional (ou de profissional que não está na lista) ou quando não há nenhum profissional.
    if (unassigned.length || columns.length === 0) {
      columns.push({ key: "sem-profissional", date, title: columns.length === 0 ? "Atendimentos" : "Sem profissional", items: unassigned });
    }
    return columns;
  }, [visible, professionals, professionalId, dayDate, todayDate]);

  function dayHref(day: string) {
    const params = new URLSearchParams({ date: day, semana: weekKey });
    if (professionalId) params.set("professional", professionalId);
    return `/app/agenda?${params.toString()}#atendimentos-do-dia`;
  }

  /** Abre aquele dia na visão Dia (usado pelo mês). */
  function dayViewHref(day: string) {
    const params = new URLSearchParams({ date: day, visao: "dia" });
    if (professionalId) params.set("professional", professionalId);
    return `/app/agenda?${params.toString()}`;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="relative block min-w-[220px] flex-1 sm:max-w-sm">
          <span className="sr-only">Buscar nesta visão</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar cliente, serviço ou profissional…"
            className="h-9 w-full rounded-md border bg-background px-3 text-sm"
          />
        </label>
        {query.trim() ? (
          <p className="text-xs text-muted-foreground" role="status">
            {visible.length} de {appointments.length} atendimento{appointments.length === 1 ? "" : "s"} nesta visão
          </p>
        ) : null}
      </div>

      <ul aria-label="Legenda de cores" className="flex flex-wrap gap-2 text-xs">
        {LEGEND_ORDER.map((state) => (
          <li key={state} className="flex items-center gap-2 rounded-full border px-3 py-1">
            <span aria-hidden className={cn("inline-block h-3 w-3 rounded-sm border", STATE_STYLES[state].split(" ").slice(0, 2).join(" "))} />
            {AGENDA_VISUAL_LABELS[state]}
          </li>
        ))}
      </ul>

      {mode === "month" ? (
        <MonthGrid days={days} monthDate={dayDate ?? todayDate} todayDate={todayDate} byDay={byDay} now={now} dayHref={dayViewHref} onSelect={setSelectedId} />
      ) : mode === "day" ? (
        <TimeGrid columns={professionalColumns} todayDate={todayDate} now={now} onSelect={setSelectedId} minColumnWidth={170} hideTodayBadge />
      ) : mode === "hours" ? (
        <>
          <div className="hidden md:block">
            <TimeGrid columns={weekColumns} todayDate={todayDate} now={now} onSelect={setSelectedId} minColumnWidth={118} showProfessional />
          </div>
          <div className="md:hidden">
            <DayList days={days} byDay={byDay} todayDate={todayDate} now={now} dayHref={dayHref} onSelect={setSelectedId} />
          </div>
        </>
      ) : (
        <DayList days={days} byDay={byDay} todayDate={todayDate} now={now} dayHref={dayHref} onSelect={setSelectedId} />
      )}

      <Dialog open={selected !== null} onOpenChange={(open) => { if (!open) setSelectedId(null); }}>
        <DialogContent>
          {selected ? <AppointmentDetails appointment={selected} now={now} /> : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface ViewProps {
  days: string[];
  byDay: Map<string, Appointment[]>;
  todayDate: string;
  now: Date;
  dayHref: (day: string) => string;
  onSelect: (id: string) => void;
}

function AppointmentChip({
  appointment,
  now,
  onSelect,
  showTime = true,
}: {
  appointment: Appointment;
  now: Date;
  onSelect: (id: string) => void;
  showTime?: boolean;
}) {
  const state = appointmentVisualState(appointment, now);
  return (
    <button
      type="button"
      onClick={() => onSelect(appointment.id)}
      data-state={state}
      className={cn(
        "w-full rounded-md border px-2 py-1.5 text-left text-xs leading-tight transition hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-ring",
        STATE_STYLES[state]
      )}
    >
      <span className="font-semibold">{showTime ? timeLabel(appointment.starts_at) + " " : ""}</span>
      <span>{appointment.service_name ?? "Serviço"}</span>
      {appointment.customer_name ? <span className="block opacity-80">{appointment.customer_name}</span> : null}
    </button>
  );
}

function DayList({ days, byDay, todayDate, now, dayHref, onSelect }: ViewProps) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {days.map((day) => {
        const items = byDay.get(day) ?? [];
        return (
          <section
            key={day}
            className={cn("rounded-lg border bg-card/40 p-3", day === todayDate && "border-primary/60")}
          >
            <Link href={dayHref(day)} className="mb-2 flex items-baseline justify-between text-sm hover:underline">
              <span className="font-semibold">
                {weekdayShort(day)} {shortDateLabel(day)}
                {day === todayDate ? <span className="ml-2 text-[10px] uppercase text-primary">Hoje</span> : null}
              </span>
              <span className="text-xs text-muted-foreground">
                {items.length ? `${items.length} ${items.length === 1 ? "serviço" : "serviços"}` : "Livre"}
              </span>
            </Link>
            <div className="flex flex-col gap-1.5">
              {items.map((appointment) => (
                <AppointmentChip key={appointment.id} appointment={appointment} now={now} onSelect={onSelect} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function AppointmentDetails({ appointment, now }: { appointment: Appointment; now: Date }) {
  const state = appointmentVisualState(appointment, now);
  const open = appointment.status === "scheduled" || appointment.status === "confirmed";
  const date = dayKeyOf(appointment.starts_at);

  return (
    <>
      <DialogHeader>
        <DialogTitle>{appointment.service_name ?? "Serviço"}</DialogTitle>
        <DialogDescription>
          {weekdayShort(date)} {shortDateLabel(date)} · {timeLabel(appointment.starts_at)} às {timeLabel(appointment.ends_at)} ({appointment.duration_minutes} min)
        </DialogDescription>
      </DialogHeader>

      <span className={cn("inline-flex w-fit rounded-full border px-3 py-1 text-xs font-medium", STATE_STYLES[state])}>
        {AGENDA_VISUAL_LABELS[state]}
      </span>

      <dl className="grid gap-2 text-sm">
        <div><dt className="text-xs text-muted-foreground">Cliente</dt><dd>{appointment.customer_name ?? "Sem cliente"}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Profissional</dt><dd>{appointment.professional_name ?? "Sem profissional"}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Valor</dt><dd>{formatMoney(Number(appointment.price ?? 0))}</dd></div>
        {appointment.notes ? <div><dt className="text-xs text-muted-foreground">Observações</dt><dd>{appointment.notes}</dd></div> : null}
        {appointment.cancellation_reason ? <div><dt className="text-xs text-muted-foreground">Motivo do cancelamento</dt><dd>{appointment.cancellation_reason}</dd></div> : null}
        {appointment.sale_id ? (
          <div>
            <dt className="text-xs text-muted-foreground">Venda</dt>
            <dd>
              <Link href={`/app/vendas/${appointment.sale_id}`} className="text-primary underline-offset-2 hover:underline">
                Ver a venda deste atendimento
              </Link>
            </dd>
          </div>
        ) : null}
      </dl>

      {open ? (
        <div className="flex flex-col gap-3 border-t pt-4">
          <div className="rounded-lg border bg-muted/30 p-3">
            <p className="mb-2 text-sm font-medium">Concluir e cobrar</p>
            <CompleteAppointmentForm appointment={appointment} />
          </div>
          <div className="flex flex-wrap gap-2">
            {appointment.status === "scheduled" ? (
              <AppointmentStatusForm appointmentId={appointment.id} status="confirmed" label="Confirmar" />
            ) : null}
            <AppointmentStatusForm appointmentId={appointment.id} status="no_show" label="Não compareceu" destructive />
            <AppointmentStatusForm appointmentId={appointment.id} status="cancelled" label="Cancelar" destructive />
          </div>
          <details>
            <summary className="cursor-pointer text-sm font-medium">Reagendar</summary>
            <div className="mt-2">
              <RescheduleForm appointment={appointment} defaultValue={localInputValue(appointment.starts_at)} />
            </div>
          </details>
        </div>
      ) : null}
    </>
  );
}
