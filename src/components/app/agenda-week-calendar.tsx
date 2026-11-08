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
  hourOf,
  hourRangeFor,
  shortDateLabel,
  timeLabel,
  weekdayShort,
  type AgendaVisualState,
} from "@/lib/agenda/week-view";
import type { Appointment } from "@/types/appointment";
import { cn } from "@/lib/utils";

/**
 * Cores pedidas pelo dono: verde = concluído, branco = pendente (horário passou e não foi concluído),
 * azul = agendado por vir. Cancelado fica cinza apagado e "não compareceu" vermelho suave.
 */
const STATE_STYLES: Record<AgendaVisualState, string> = {
  done: "border-emerald-500/60 bg-emerald-500/25 text-emerald-950 dark:text-emerald-50",
  pending: "border-zinc-300 bg-white text-zinc-900",
  upcoming: "border-sky-500/60 bg-sky-500/25 text-sky-950 dark:text-sky-50",
  cancelled: "border-border bg-muted/40 text-muted-foreground line-through opacity-70",
  no_show: "border-rose-500/50 bg-rose-500/15 text-rose-950 dark:text-rose-100",
};

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

interface AgendaWeekCalendarProps {
  /** "hours": grade por hora (semana atual). "days": lista por dia (semana passada e próxima). */
  mode: "hours" | "days";
  days: string[];
  appointments: Appointment[];
  todayDate: string;
  nowIso: string;
  weekKey: string;
  professionalId?: string;
}

export function AgendaWeekCalendar({
  mode,
  days,
  appointments,
  todayDate,
  nowIso,
  weekKey,
  professionalId,
}: AgendaWeekCalendarProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const now = useMemo(() => new Date(nowIso), [nowIso]);

  const byDay = useMemo(() => {
    const map = new Map<string, Appointment[]>();
    for (const day of days) map.set(day, []);
    for (const appointment of appointments) {
      const list = map.get(dayKeyOf(appointment.starts_at));
      if (list) list.push(appointment);
    }
    return map;
  }, [appointments, days]);

  const selected = appointments.find((row) => row.id === selectedId) ?? null;

  function dayHref(day: string) {
    const params = new URLSearchParams({ date: day, semana: weekKey });
    if (professionalId) params.set("professional", professionalId);
    return `/app/agenda?${params.toString()}#atendimentos-do-dia`;
  }

  return (
    <div className="flex flex-col gap-4">
      <ul aria-label="Legenda de cores" className="flex flex-wrap gap-2 text-xs">
        {LEGEND_ORDER.map((state) => (
          <li key={state} className="flex items-center gap-2 rounded-full border px-3 py-1">
            <span aria-hidden className={cn("inline-block h-3 w-3 rounded-sm border", STATE_STYLES[state].split(" ").slice(0, 2).join(" "))} />
            {AGENDA_VISUAL_LABELS[state]}
          </li>
        ))}
      </ul>

      {mode === "hours" ? (
        <>
          <div className="hidden md:block">
            <HourGrid
              days={days}
              byDay={byDay}
              todayDate={todayDate}
              now={now}
              dayHref={dayHref}
              onSelect={setSelectedId}
            />
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

function HourGrid({ days, byDay, todayDate, now, dayHref, onSelect }: ViewProps) {
  const all = days.flatMap((day) => byDay.get(day) ?? []);
  const { first, last } = hourRangeFor(all.map((row) => row.starts_at));
  const hours = Array.from({ length: last - first + 1 }, (_, index) => first + index);

  return (
    <div className="overflow-x-auto rounded-lg border">
      <div className="grid min-w-[880px] grid-cols-[56px_repeat(7,minmax(0,1fr))]">
        <div className="border-b bg-muted/30" />
        {days.map((day) => (
          <Link
            key={day}
            href={dayHref(day)}
            className={cn(
              "border-b border-l bg-muted/30 px-2 py-2 text-center text-xs hover:bg-muted/60",
              day === todayDate && "bg-primary/15 font-semibold"
            )}
          >
            <span className="block uppercase">{weekdayShort(day)}</span>
            <span className="block text-sm">{shortDateLabel(day)}</span>
            {day === todayDate ? <span className="block text-[10px] uppercase text-primary">Hoje</span> : null}
          </Link>
        ))}

        {hours.map((hour) => (
          <HourRow key={hour} hour={hour} days={days} byDay={byDay} todayDate={todayDate} now={now} onSelect={onSelect} />
        ))}
      </div>
    </div>
  );
}

function HourRow({
  hour,
  days,
  byDay,
  todayDate,
  now,
  onSelect,
}: {
  hour: number;
  days: string[];
  byDay: Map<string, Appointment[]>;
  todayDate: string;
  now: Date;
  onSelect: (id: string) => void;
}) {
  return (
    <>
      <div className="border-b px-2 py-2 text-right text-xs text-muted-foreground">
        {String(hour).padStart(2, "0")}h
      </div>
      {days.map((day) => {
        const items = (byDay.get(day) ?? []).filter((row) => hourOf(row.starts_at) === hour);
        return (
          <div
            key={day}
            className={cn("flex min-h-[52px] flex-col gap-1 border-b border-l p-1", day === todayDate && "bg-primary/5")}
          >
            {items.map((appointment) => (
              <AppointmentChip key={appointment.id} appointment={appointment} now={now} onSelect={onSelect} />
            ))}
          </div>
        );
      })}
    </>
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
