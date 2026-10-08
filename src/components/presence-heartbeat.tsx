"use client";

import { useEffect } from "react";

const INTERVAL_MS = 60_000;

/**
 * Envia um "estou aqui" ao servidor enquanto a aba está visível. O servidor
 * (touch_presence) só grava se o último registro tiver mais de 30 s, então
 * abas extras e reinícios de intervalo não geram escrita desnecessária. Falhas
 * são ignoradas: presença nunca pode atrapalhar o uso do produto.
 */
export function PresenceHeartbeat() {
  useEffect(() => {
    let cancelled = false;

    async function ping() {
      if (cancelled || document.visibilityState !== "visible") return;
      try {
        await fetch("/api/presence", { method: "POST", credentials: "same-origin", keepalive: true });
      } catch {
        // sem rede / sessão expirada: tenta de novo no próximo ciclo
      }
    }

    void ping();
    const timer = window.setInterval(ping, INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void ping();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return null;
}
