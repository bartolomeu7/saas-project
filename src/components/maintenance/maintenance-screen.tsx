"use client";

import { useEffect } from "react";
import { Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDurationPt, minutesUntil, type MaintenanceState } from "@/lib/maintenance-gate";
import { useMaintenanceState } from "@/components/maintenance/use-maintenance-state";

const timeFormatter = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
const dateTimeFormatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * Tela cheia de manutenção: mensagem do administrador, previsão de volta com contagem regressiva e contato.
 * Atualiza sozinha: quando a manutenção termina, leva o cliente de volta ao sistema.
 */
export function MaintenanceScreen({ initial }: { initial: MaintenanceState }) {
  const { state, now, refresh } = useMaintenanceState(initial, 20_000);
  const active = state.active && state.active.level !== "notice" ? state.active : null;

  useEffect(() => {
    if (!active) {
      // terminou (ou nunca estava em manutenção): volta ao sistema
      const timer = window.setTimeout(() => window.location.replace("/app"), 800);
      return () => window.clearTimeout(timer);
    }
  }, [active]);

  if (!active) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <p role="status" className="text-center text-sm text-muted-foreground">
          O sistema está disponível. Abrindo…
        </p>
      </main>
    );
  }

  const remaining = minutesUntil(active.expectedEndAt, now);
  const overdue = remaining <= 0;
  const readOnly = active.level === "read_only";

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/15 text-primary">
          <Wrench className="h-6 w-6" aria-hidden="true" />
        </span>
        <h1 className="mt-5 text-2xl font-semibold tracking-tight">{active.title}</h1>
        <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">{active.message}</p>

        <div className="mt-6 rounded-xl border border-border bg-background/60 p-4" role="status" aria-live="polite">
          {overdue ? (
            <>
              <p className="text-sm font-medium">Estamos finalizando.</p>
              <p className="mt-1 text-xs text-muted-foreground">Passou um pouco do previsto. Obrigado pela paciência: você volta ao sistema automaticamente.</p>
            </>
          ) : (
            <>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Previsão de volta</p>
              <p className="mt-1 text-lg font-semibold">às {timeFormatter.format(new Date(active.expectedEndAt))}</p>
              <p className="mt-1 text-sm text-muted-foreground">faltam cerca de {formatDurationPt(remaining)}</p>
            </>
          )}
        </div>

        {readOnly && (
          <p className="mt-4 text-xs text-muted-foreground">Você pode consultar seus dados, mas as gravações estão pausadas até o fim da manutenção.</p>
        )}
        <p className="mt-4 text-xs text-muted-foreground">Seus dados estão seguros. Iniciada em {active.startedAt ? dateTimeFormatter.format(new Date(active.startedAt)) : "agora"}.</p>
        {active.contactText && <p className="mt-2 text-xs text-muted-foreground">Precisa de ajuda? {active.contactText}</p>}

        <Button type="button" variant="outline" size="sm" className="mt-6" onClick={() => void refresh()}>
          Verificar agora
        </Button>
      </div>
    </main>
  );
}
