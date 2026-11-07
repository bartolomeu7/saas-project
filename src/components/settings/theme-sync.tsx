"use client";

import { useEffect } from "react";
import { applyTheme, readStoredTheme, THEME_CHANGE_EVENT } from "@/lib/settings/theme-client";
import { THEME_STORAGE_KEY } from "@/lib/settings/theme";

/**
 * Mantém o tema da área logada (/app e /admin) em dia com a escolha da pessoa e DEVOLVE o tema escuro padrão ao sair
 * dela (navegação para o site público não herda o tema claro). A primeira pintura é resolvida antes, pelo script
 * THEME_INIT_SCRIPT no layout; aqui ficam as mudanças depois do carregamento (troca na tela de Aparência, outra aba,
 * mudança do tema do sistema no modo automático).
 */
export function ThemeSync() {
  useEffect(() => {
    const sync = () => applyTheme(readStoredTheme());
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === THEME_STORAGE_KEY) sync();
    };
    const media = window.matchMedia("(prefers-color-scheme: light)");

    sync();
    window.addEventListener(THEME_CHANGE_EVENT, sync);
    window.addEventListener("storage", onStorage);
    media.addEventListener("change", sync);

    return () => {
      window.removeEventListener(THEME_CHANGE_EVENT, sync);
      window.removeEventListener("storage", onStorage);
      media.removeEventListener("change", sync);
      document.documentElement.classList.add("dark");
      document.documentElement.style.colorScheme = "dark";
    };
  }, []);

  return null;
}
