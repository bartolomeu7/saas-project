"use client";

import { useSyncExternalStore } from "react";
import { normalizeTheme, resolveTheme, THEME_STORAGE_KEY, type ResolvedTheme, type ThemePreference } from "@/lib/settings/theme";

/** Evento interno: a tela de Aparência avisa o ThemeSync na mesma aba (o evento "storage" só chega nas OUTRAS abas). */
export const THEME_CHANGE_EVENT = "prime-theme-change";

export function readStoredTheme(): ThemePreference {
  try {
    return normalizeTheme(window.localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return normalizeTheme(null);
  }
}

export function storeTheme(preference: ThemePreference): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // storage bloqueado (janela privada): vale só até recarregar
  }
  window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
}

/** Aplica o tema no <html>: classe `dark` (Tailwind) e `color-scheme` (barras de rolagem, campos nativos). */
export function applyTheme(preference: ThemePreference): ResolvedTheme {
  const systemPrefersLight = window.matchMedia("(prefers-color-scheme: light)").matches;
  const resolved = resolveTheme(preference, systemPrefersLight);
  const root = document.documentElement;
  root.classList.toggle("dark", resolved === "dark");
  root.style.colorScheme = resolved;
  return resolved;
}

function subscribeToHtmlClass(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
}

/** Tema que está de fato aplicado no <html> (para componentes que não leem as variáveis CSS, como o Sonner). */
export function useAppliedTheme(): ResolvedTheme {
  return useSyncExternalStore(
    subscribeToHtmlClass,
    () => (document.documentElement.classList.contains("dark") ? "dark" : "light"),
    () => "dark"
  );
}
