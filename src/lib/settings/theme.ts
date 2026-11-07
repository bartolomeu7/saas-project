/**
 * Preferência de tema (escuro / claro / automático) da área logada (/app e /admin).
 *
 * Função pura + constantes (sem React) para poder ser testada em Node. A preferência fica SÓ no aparelho
 * (localStorage): não vai para o servidor e não muda a aparência das páginas públicas, que seguem na identidade escura
 * fixa do Prime Ges. O padrão continua sendo o tema escuro.
 */

export const THEME_STORAGE_KEY = "prime-theme";

export const THEME_PREFERENCES = ["dark", "light", "system"] as const;
export type ThemePreference = (typeof THEME_PREFERENCES)[number];
export type ResolvedTheme = "dark" | "light";

export const DEFAULT_THEME: ThemePreference = "dark";

/** Qualquer valor desconhecido (storage adulterado, versão antiga) vira o padrão. */
export function normalizeTheme(value: unknown): ThemePreference {
  return typeof value === "string" && (THEME_PREFERENCES as readonly string[]).includes(value)
    ? (value as ThemePreference)
    : DEFAULT_THEME;
}

export function resolveTheme(preference: ThemePreference, systemPrefersLight: boolean): ResolvedTheme {
  if (preference === "system") return systemPrefersLight ? "light" : "dark";
  return preference;
}

/**
 * Script que roda ANTES da primeira pintura da área logada para não piscar o tema escuro em quem escolheu o claro.
 * Mesma regra de normalizeTheme/resolveTheme, escrita em ES5 e sem dependências. Qualquer falha (storage bloqueado)
 * deixa o tema escuro padrão.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var p=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});if(p!=="light"&&p!=="system"){return;}var l=p==="light"||window.matchMedia("(prefers-color-scheme: light)").matches;if(l){var r=document.documentElement;r.classList.remove("dark");r.style.colorScheme="light";}}catch(e){}})();`;
