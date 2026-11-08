"use client";

import { useSyncExternalStore } from "react";

/**
 * Estado do "instalar aplicativo" (PWA).
 *
 * O navegador (Chrome/Edge no Android e no computador) dispara `beforeinstallprompt` uma única vez, logo cedo. O evento
 * é guardado aqui no nível do módulo para a tela de Configurações poder usá-lo depois. No iPhone/iPad não existe esse
 * evento: a instalação é manual (Compartilhar → Adicionar à Tela de Início), por isso só se mostra a instrução.
 */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

export type InstallState = {
  /** O navegador oferece a instalação com um clique (Android/Chrome/Edge). */
  canPrompt: boolean;
  /** Já está aberto como aplicativo instalado. */
  installed: boolean;
  /** iPhone ou iPad: instalação manual. */
  ios: boolean;
};

const SERVER_STATE: InstallState = { canPrompt: false, installed: false, ios: false };

let deferred: BeforeInstallPromptEvent | null = null;
let installedFlag = false;
let snapshot: InstallState = SERVER_STATE;
let started = false;
const listeners = new Set<() => void>();

function detect(): InstallState {
  const standalone =
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  const ua = navigator.userAgent;
  const ios = /iPad|iPhone|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
  return { canPrompt: deferred !== null, installed: installedFlag || standalone, ios };
}

function publish() {
  const next = detect();
  if (next.canPrompt === snapshot.canPrompt && next.installed === snapshot.installed && next.ios === snapshot.ios) return;
  snapshot = next;
  listeners.forEach((listener) => listener());
}

/** Começa a escutar o navegador. Seguro chamar várias vezes (só age na primeira). */
export function startInstallListener() {
  if (started || typeof window === "undefined") return;
  started = true;
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferred = event as BeforeInstallPromptEvent;
    publish();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    installedFlag = true;
    publish();
  });
  publish();
}

/** Abre a janela de instalação do navegador. Devolve se a pessoa aceitou. */
export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  const event = deferred;
  deferred = null;
  await event.prompt();
  const choice = await event.userChoice;
  if (choice.outcome === "accepted") installedFlag = true;
  publish();
  return choice.outcome === "accepted";
}

export function useInstallState(): InstallState {
  return useSyncExternalStore(
    (listener) => {
      startInstallListener();
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    () => snapshot,
    () => SERVER_STATE
  );
}
