"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { EMPTY_MAINTENANCE_STATE, type MaintenanceState } from "@/lib/maintenance-gate";

/**
 * Mantém o estado da manutenção em dia no navegador (consulta `/api/maintenance/status`) e uma hora "do servidor":
 * a contagem regressiva usa o relógio do banco (diferença medida na leitura), não o do aparelho, que pode estar errado.
 */
export function useMaintenanceState(initial: MaintenanceState, intervalMs: number) {
  const [state, setState] = useState<MaintenanceState>(initial);
  const [initialOffset] = useState(() => (initial.serverNow ? Date.parse(initial.serverNow) - Date.now() : 0));
  const offsetRef = useRef(initialOffset);
  const [now, setNow] = useState(() => Date.now() + initialOffset);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/maintenance/status", { cache: "no-store" });
      if (!response.ok) return;
      const next = (await response.json()) as MaintenanceState;
      if (next.serverNow) offsetRef.current = Date.parse(next.serverNow) - Date.now();
      setState(next ?? EMPTY_MAINTENANCE_STATE);
    } catch {
      // sem rede: mantém o que já está na tela
    }
  }, []);

  useEffect(() => {
    const poll = window.setInterval(refresh, intervalMs);
    const tick = window.setInterval(() => setNow(Date.now() + offsetRef.current), 1000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(poll);
      window.clearInterval(tick);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh, intervalMs]);

  return { state, now, refresh };
}
