"use client";

import { useState } from "react";
import { LogOut } from "lucide-react";
import { signOutAction } from "@/lib/auth/actions";

function initialsFrom(name?: string | null, email?: string | null): string {
  if (name?.trim()) {
    const parts = name.trim().split(/\s+/);
    return ((parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "")).toUpperCase();
  }
  if (email) {
    return email[0]?.toUpperCase() ?? "?";
  }
  return "?";
}

export function UserMenu({
  name,
  email,
}: {
  name?: string | null;
  email?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const initials = initialsFrom(name, email);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-2 rounded-full transition-opacity hover:opacity-80"
        aria-label="Menu do usuário"
        aria-expanded={open}
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold text-primary">
          {initials}
        </span>
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-30"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <div className="absolute right-0 top-full z-40 mt-2 w-56 rounded-lg border border-border bg-card p-1 shadow-card">
            <div className="px-3 py-2">
              {name && (
                <p className="truncate text-sm font-medium text-foreground">
                  {name}
                </p>
              )}
              {email && (
                <p className="truncate text-xs text-muted-foreground">
                  {email}
                </p>
              )}
            </div>
            <div className="my-1 h-px bg-border" />
            <form action={signOutAction}>
              <button
                type="submit"
                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-secondary"
              >
                <LogOut className="h-4 w-4" strokeWidth={1.75} />
                Sair
              </button>
            </form>
          </div>
        </>
      )}
    </div>
  );
}
