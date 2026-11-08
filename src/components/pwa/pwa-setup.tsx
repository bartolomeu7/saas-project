"use client";

import { useEffect } from "react";
import { startInstallListener } from "@/lib/pwa/install";

/**
 * Prepara o aplicativo instalável na área logada: registra o service worker (só a tela "Sem conexão", ver public/sw.js) e
 * começa a escutar o pedido de instalação do navegador. Não renderiza nada.
 */
export function PwaSetup() {
  useEffect(() => {
    startInstallListener();
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      // sem service worker o sistema funciona igual; só some a tela "Sem conexão"
    });
  }, []);

  return null;
}
