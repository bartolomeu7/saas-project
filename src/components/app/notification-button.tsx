"use client";

import { useState } from "react";
import { Bell } from "lucide-react";

/**
 * Sem sistema de notificações real ainda — o botão é funcional (abre/
 * fecha) mas honesto sobre não ter nada para mostrar, em vez de simular
 * notificações falsas.
 */
export function NotificationButton() {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        aria-label="Notificações"
        aria-expanded={open}
      >
        <Bell className="h-[18px] w-[18px]" strokeWidth={1.75} />
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-30"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <div className="absolute right-0 top-full z-40 mt-2 w-64 rounded-lg border border-border bg-card p-4 shadow-card">
            <p className="text-sm font-medium text-foreground">Notificações</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Nenhuma notificação por enquanto.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
