"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  appointmentVisualState,
  layoutTimeline,
  nowInSaoPaulo,
  timeLabel,
  timelineHourRange,
  timelinePercent,
} from "@/lib/agenda/week-view";
import { STATE_STYLES } from "@/components/app/agenda-visual";
import type { Appointment } from "@/types/appointment";
import { cn } from "@/lib/utils";

/** Altura de uma hora na grade (px). A altura de cada atendimento é proporcional à duração. */
const HOUR_PX = 64;
/** Altura mínima visual de um bloco (px), para sempre caber o horário. */
const MIN_BLOCK_PX = 26;

export interface TimeGridColumn {
  key: string;
  /** Dia (YYYY-MM-DD) que a coluna mostra; serve para a linha do "agora". */
  date: string;
  title: string;
  subtitle?: string;
  /** Bolinha de cor (classe Tailwind), ex.: cor do profissional. */
  dotClass?: string;
  /** Se informado, o cabeçalho vira link. */
  href?: string;
  items: Appointment[];
}

interface TimeGridProps {
  columns: TimeGridColumn[];
  todayDate: string;
  now: Date;
  onSelect: (id: string) => void;
  /** Largura mínima de cada coluna (px); abaixo disso a grade rola na horizontal. */
  minColumnWidth?: number;
  /** Mostra o nome do profissional dentro do bloco (útil quando as colunas são dias). */
  showProfessional?: boolean;
  /** Esconde o "Hoje" do cabeçalho (na visão do dia todas as colunas são o mesmo dia). */
  hideTodayBadge?: boolean;
}

/**
 * Grade de horas: eixo de horas à esquerda, uma coluna por dia (ou por profissional), cada atendimento do tamanho da sua
 * duração, atendimentos que se sobrepõem lado a lado e uma linha vermelha no horário de agora na coluna de hoje.
 */
export function TimeGrid({ columns, todayDate, now, onSelect, minColumnWidth = 120, showProfessional = false, hideTodayBadge = false }: TimeGridProps) {
  const range = useMemo(() => timelineHourRange(columns.flatMap((column) => column.items)), [columns]);
  const hours = Array.from({ length: range.last - range.first }, (_, index) => range.first + index);
  const heightPx = hours.length * HOUR_PX;
  const rangeMinutes = (range.last - range.first) * 60;
  const current = nowInSaoPaulo(now);

  return (
    <div className="overflow-x-auto rounded-lg border">
      <div
        className="grid"
        style={{ gridTemplateColumns: `52px repeat(${columns.length}, minmax(${minColumnWidth}px, 1fr))`, minWidth: 52 + columns.length * minColumnWidth }}
      >
        <div className="sticky left-0 z-20 border-b bg-card" />
        {columns.map((column) => (
          <ColumnHeader key={column.key} column={column} isToday={column.date === todayDate} showBadge={!hideTodayBadge} />
        ))}

        <div className="sticky left-0 z-10 border-r bg-card" style={{ height: heightPx }}>
          {hours.map((hour) => (
            <div key={hour} className="relative border-b text-right text-[11px] text-muted-foreground" style={{ height: HOUR_PX }}>
              <span className="absolute right-1.5 top-1">{String(hour).padStart(2, "0")}h</span>
            </div>
          ))}
        </div>

        {columns.map((column) => {
          const isToday = column.date === todayDate;
          const nowTop = isToday ? timelinePercent(current.minutes, range) : null;
          const blocks = layoutTimeline(column.items);
          return (
            <div
              key={column.key}
              className={cn("relative border-l", isToday && "bg-primary/5")}
              style={{ height: heightPx }}
            >
              {hours.map((hour) => (
                <div key={hour} className="border-b border-border/60" style={{ height: HOUR_PX }} aria-hidden />
              ))}

              {blocks.map(({ item, startMin, endMin, lane, lanes }) => {
                const topPercent = ((startMin - range.first * 60) / rangeMinutes) * 100;
                const heightPercent = ((endMin - startMin) / rangeMinutes) * 100;
                const state = appointmentVisualState(item, now);
                const compact = ((endMin - startMin) / 60) * HOUR_PX < 52;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onSelect(item.id)}
                    data-state={state}
                    aria-label={`${timeLabel(item.starts_at)} ${item.service_name ?? "Serviço"} ${item.customer_name ?? ""}`.trim()}
                    className={cn(
                      "absolute overflow-hidden rounded-md border px-1.5 py-1 text-left text-[11px] leading-tight transition hover:z-10 hover:brightness-110 focus:z-10 focus:outline-none focus:ring-2 focus:ring-ring",
                      STATE_STYLES[state]
                    )}
                    style={{
                      top: `${topPercent}%`,
                      height: `max(${heightPercent}%, ${MIN_BLOCK_PX}px)`,
                      left: `calc(${(lane / lanes) * 100}% + 2px)`,
                      width: `calc(${100 / lanes}% - 4px)`,
                    }}
                  >
                    {compact ? (
                      <span className="block truncate">
                        <strong>{timeLabel(item.starts_at)}</strong> {item.service_name ?? "Serviço"}
                        {item.customer_name ? ` · ${item.customer_name}` : ""}
                      </span>
                    ) : (
                      <>
                        <span className="block font-semibold">
                          {timeLabel(item.starts_at)}–{timeLabel(item.ends_at)}
                        </span>
                        <span className="block truncate">{item.service_name ?? "Serviço"}</span>
                        {item.customer_name ? <span className="block truncate opacity-80">{item.customer_name}</span> : null}
                        {showProfessional && item.professional_name ? (
                          <span className="block truncate text-[10px] opacity-70">{item.professional_name}</span>
                        ) : null}
                      </>
                    )}
                  </button>
                );
              })}

              {nowTop !== null ? (
                <div className="pointer-events-none absolute left-0 right-0 z-10" style={{ top: `${nowTop}%` }} aria-hidden>
                  <div className="relative border-t-2 border-rose-500">
                    <span className="absolute -left-1 -top-[5px] h-2 w-2 rounded-full bg-rose-500" />
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ColumnHeader({ column, isToday, showBadge }: { column: TimeGridColumn; isToday: boolean; showBadge: boolean }) {
  const content = (
    <>
      <span className="flex items-center justify-center gap-1.5 text-xs uppercase">
        {column.dotClass ? <span className={cn("inline-block h-2.5 w-2.5 rounded-full", column.dotClass)} aria-hidden /> : null}
        {column.title}
      </span>
      {column.subtitle ? <span className="block text-sm">{column.subtitle}</span> : null}
      {isToday && showBadge ? <span className="block text-[10px] uppercase text-primary">Hoje</span> : null}
    </>
  );
  const className = cn(
    "sticky top-0 z-10 border-b border-l bg-card px-2 py-2 text-center",
    isToday && "bg-primary/15 font-semibold"
  );
  return column.href ? (
    <Link href={column.href} className={cn(className, "hover:bg-muted/60")}>
      {content}
    </Link>
  ) : (
    <div className={className}>{content}</div>
  );
}
