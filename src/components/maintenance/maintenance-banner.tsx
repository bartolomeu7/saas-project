"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Wrench, X } from "lucide-react";
import {
  formatDurationPt,
  MAINTENANCE_LEVEL_IMPACT,
  minutesUntil,
  type MaintenanceState,
  type MaintenanceWindowPublic,
} from "@/lib/maintenance-gate";
import { useMaintenanceState } from "@/components/maintenance/use-maintenance-state";

const dateTimeFormatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  weekday: "long",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});
const timeFormatter = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });

const DISMISS_MS = 4 * 60 * 60 * 1000;
/** Nos últimos 15 minutos o aviso volta mesmo que a pessoa o tenha dispensado. */
const FORCE_SHOW_MINUTES = 15;

function dismissKey(id: string) {
  return `prime-ges:manutencao-dispensada:${id}`;
}

function wasDismissed(id: string): boolean {
  try {
    const at = Number(window.localStorage.getItem(dismissKey(id)));
    return Number.isFinite(at) && at > 0 && Date.now() - at < DISMISS_MS;
  } catch {
    return false;
  }
}

/**
 * Faixa de aviso no topo do app: manutenção programada que se aproxima, manutenção em andamento em modo só leitura e,
 * para o super administrador, o lembrete de que o bloqueio está ativo. Atualiza sozinha a cada minuto.
 * Quando uma manutenção total começa com o app aberto, recarrega a página (o middleware mostra a tela de manutenção).
 */
export function MaintenanceBanner({ initial, isSuperAdmin }: { initial: MaintenanceState; isSuperAdmin: boolean }) {
  const { state, now } = useMaintenanceState(initial, 60_000);
  const [dismissed, setDismissed] = useState<Record<string, boolean>>({});

  const active = state.active;
  const upcoming = state.upcoming;

  useEffect(() => {
    if (active?.level === "blocked" && !isSuperAdmin) window.location.reload();
  }, [active?.id, active?.level, isSuperAdmin]);

  useEffect(() => {
    if (!upcoming) return;
    setDismissed((current) => ({ ...current, [upcoming.id]: wasDismissed(upcoming.id) }));
  }, [upcoming?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (active) {
    return <ActiveBar window={active} now={now} isSuperAdmin={isSuperAdmin} />;
  }
  if (!upcoming) return null;

  const minutesToStart = minutesUntil(upcoming.startsAt, now);
  if (minutesToStart <= 0) return null;
  const force = minutesToStart <= FORCE_SHOW_MINUTES;
  if (dismissed[upcoming.id] && !force) return null;

  const durationMinutes = Math.max(1, Math.round((Date.parse(upcoming.expectedEndAt) - Date.parse(upcoming.startsAt)) / 60000));
  const soon = minutesToStart <= 120;

  return (
    <div role="status" className={"flex items-start gap-3 border-b px-4 py-2.5 text-sm " + (soon ? "border-amber-500/40 bg-amber-500/15" : "border-amber-500/25 bg-amber-500/10")}>
      <Wrench className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="font-medium">
          Manutenção programada: {dateTimeFormatter.format(new Date(upcoming.startsAt))}, duração prevista de {formatDurationPt(durationMinutes)}
          {soon ? <span className="font-semibold"> — começa em {formatDurationPt(minutesToStart)}</span> : null}
        </p>
        <p className="text-xs text-muted-foreground">
          {upcoming.title}. {MAINTENANCE_LEVEL_IMPACT[upcoming.level]}
          {upcoming.contactText ? ` ${upcoming.contactText}` : ""}
        </p>
      </div>
      {!force && (
        <button
          type="button"
          onClick={() => {
            try {
              window.localStorage.setItem(dismissKey(upcoming.id), String(Date.now()));
            } catch {
              // sem armazenamento: só esconde nesta sessão
            }
            setDismissed((current) => ({ ...current, [upcoming.id]: true }));
          }}
          className="rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted"
          aria-label="Dispensar aviso de manutenção por 4 horas"
        >
          Entendi <X className="ml-1 inline h-3 w-3" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

function ActiveBar({ window: w, now, isSuperAdmin }: { window: MaintenanceWindowPublic; now: number; isSuperAdmin: boolean }) {
  const remaining = minutesUntil(w.expectedEndAt, now);
  const until = remaining > 0 ? `até ${timeFormatter.format(new Date(w.expectedEndAt))} (faltam ${formatDurationPt(remaining)})` : "finalizando";

  if (w.level === "blocked" && isSuperAdmin) {
    return (
      <div role="alert" className="flex items-start gap-3 border-b border-destructive/40 bg-destructive/15 px-4 py-2.5 text-sm">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
        <p className="min-w-0 flex-1">
          <span className="font-semibold">Manutenção ATIVA — os clientes estão bloqueados.</span> Você vê o sistema como administrador ({until}).{" "}
          <a href="/admin/maintenance" className="font-medium underline underline-offset-4">Gerenciar</a>
        </p>
      </div>
    );
  }

  if (w.level === "read_only") {
    return (
      <div role="status" className="flex items-start gap-3 border-b border-amber-500/40 bg-amber-500/15 px-4 py-2.5 text-sm">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
        <p className="min-w-0 flex-1">
          <span className="font-semibold">Sistema em modo somente leitura {until}.</span> Você pode consultar tudo, mas as gravações estão pausadas. {w.message}
          {isSuperAdmin ? (
            <>
              {" "}
              <a href="/admin/maintenance" className="font-medium underline underline-offset-4">Gerenciar</a>
            </>
          ) : null}
        </p>
      </div>
    );
  }

  // notice: só informa
  return (
    <div role="status" className="flex items-start gap-3 border-b border-sky-500/30 bg-sky-500/10 px-4 py-2.5 text-sm">
      <Wrench className="mt-0.5 h-4 w-4 shrink-0 text-sky-600 dark:text-sky-400" aria-hidden="true" />
      <p className="min-w-0 flex-1">
        <span className="font-semibold">{w.title}</span> {until}. {w.message}
      </p>
    </div>
  );
}
