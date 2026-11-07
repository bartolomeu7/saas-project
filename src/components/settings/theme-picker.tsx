"use client";

import { useEffect, useState } from "react";
import { Check, Monitor, Moon, Sun, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ThemePreference } from "@/lib/settings/theme";
import { readStoredTheme, storeTheme } from "@/lib/settings/theme-client";

const OPTIONS: { value: ThemePreference; label: string; description: string; icon: LucideIcon }[] = [
  { value: "dark", label: "Escuro", description: "O visual padrão do Prime Ges.", icon: Moon },
  { value: "light", label: "Claro", description: "Fundo claro, bom para ambientes bem iluminados.", icon: Sun },
  { value: "system", label: "Automático", description: "Acompanha o tema do seu aparelho.", icon: Monitor },
];

/** Escolha do tema da área logada. Fica salvo só neste aparelho (não muda o site público). */
export function ThemePicker() {
  const [selected, setSelected] = useState<ThemePreference>("dark");

  useEffect(() => {
    setSelected(readStoredTheme());
  }, []);

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="sr-only">Tema da aplicação</legend>
      <div className="grid gap-3 sm:grid-cols-3">
        {OPTIONS.map((option) => {
          const active = selected === option.value;
          return (
            <label
              key={option.value}
              className={cn(
                "relative flex cursor-pointer flex-col gap-2 rounded-xl border p-4 transition-colors focus-within:ring-2 focus-within:ring-ring",
                active ? "border-primary bg-primary/10" : "border-border bg-card/60 hover:border-primary/40"
              )}
            >
              <input
                type="radio"
                name="tema"
                value={option.value}
                checked={active}
                onChange={() => {
                  setSelected(option.value);
                  storeTheme(option.value);
                }}
                className="sr-only"
              />
              <span className="flex items-center gap-2">
                <option.icon className="h-4 w-4 text-primary-text" strokeWidth={1.75} aria-hidden="true" />
                <span className="font-medium text-foreground">{option.label}</span>
                {active && <Check className="ml-auto h-4 w-4 text-primary-text" aria-hidden="true" />}
              </span>
              <span className="text-sm text-muted-foreground">{option.description}</span>
            </label>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">A escolha vale só neste aparelho e navegador.</p>
    </fieldset>
  );
}
