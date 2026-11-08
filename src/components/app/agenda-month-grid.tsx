"use client";

import Link from "next/link";
import { appointmentVisualState, timeLabel, weekdayShort, type AgendaVisualState } from "@/lib/agenda/week-view";
import { STATE_STYLES } from "@/components/app/agenda-visual";
import type { Appointment } from "@/types/appointment";
import { cn } from "@/lib/utils";

const DOT_STYLES: Record<AgendaVisualState, string> = {
  done: "bg-emerald-400",
  pending: "bg-white",
  upcoming: "bg-sky-400",
  cancelled: "bg-muted-foreground/50",
  no_show: "bg-rose-400",
};

/** Quantos atendimentos aparecem escritos na célula (no computador); o resto vira "+N mais". */
const VISIBLE_CHIPS = 3;

interface MonthGridProps {
  days: string[];
  /** Qualquer dia do mês exibido (os dias de fora do mês aparecem apagados). */
  monthDate: string;
  todayDate: string;
  byDay: Map<string, Appointment[]>;
  now: Date;
  /** Endereço da visão Dia daquele dia. */
  dayHref: (day: string) => string;
  onSelect: (id: string) => void;
}

/** Visão de mês: semanas inteiras (domingo a sábado). Clicar no número do dia abre o dia; clicar num serviço abre o painel. */
export function MonthGrid({ days, monthDate, todayDate, byDay, now, dayHref, onSelect }: MonthGridProps) {
  const monthPrefix = monthDate.slice(0, 7);
  const weekHeader = days.slice(0, 7);

  return (
    <div className="overflow-hidden rounded-lg border">
      <div className="grid grid-cols-7 border-b bg-card">
        {weekHeader.map((day) => (
          <div key={day} className="px-2 py-2 text-center text-xs uppercase text-muted-foreground">
            {weekdayShort(day)}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {days.map((day) => {
          const items = byDay.get(day) ?? [];
          const inMonth = day.startsWith(monthPrefix);
          const isToday = day === todayDate;
          const hidden = Math.max(0, items.length - VISIBLE_CHIPS);
          return (
            <div
              key={day}
              className={cn(
                "min-h-[72px] border-b border-l p-1 md:min-h-[104px] md:p-1.5",
                !inMonth && "bg-muted/20 text-muted-foreground",
                isToday && "bg-primary/10"
              )}
            >
              <Link
                href={dayHref(day)}
                aria-label={`Abrir o dia ${Number(day.slice(8))}${items.length ? `, ${items.length} atendimento${items.length === 1 ? "" : "s"}` : ""}`}
                className="flex items-center justify-between text-xs hover:underline"
              >
                <span className={cn("inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 font-semibold", isToday && "bg-primary text-primary-foreground")}>
                  {Number(day.slice(8))}
                </span>
                {items.length ? <span className="text-[10px] text-muted-foreground">{items.length}</span> : null}
              </Link>

              <div className="mt-1 hidden flex-col gap-1 md:flex">
                {items.slice(0, VISIBLE_CHIPS).map((appointment) => {
                  const state = appointmentVisualState(appointment, now);
                  return (
                    <button
                      key={appointment.id}
                      type="button"
                      onClick={() => onSelect(appointment.id)}
                      data-state={state}
                      className={cn(
                        "w-full truncate rounded border px-1 py-0.5 text-left text-[11px] leading-tight transition hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-ring",
                        STATE_STYLES[state]
                      )}
                    >
                      <strong>{timeLabel(appointment.starts_at)}</strong> {appointment.service_name ?? "Serviço"}
                    </button>
                  );
                })}
                {hidden > 0 ? (
                  <Link href={dayHref(day)} className="px-1 text-[11px] text-primary hover:underline">
                    +{hidden} mais
                  </Link>
                ) : null}
              </div>

              {items.length ? (
                <Link href={dayHref(day)} className="mt-1 flex flex-wrap gap-1 md:hidden" aria-hidden tabIndex={-1}>
                  {items.slice(0, 6).map((appointment) => (
                    <span key={appointment.id} className={cn("h-2 w-2 rounded-full", DOT_STYLES[appointmentVisualState(appointment, now)])} />
                  ))}
                </Link>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
