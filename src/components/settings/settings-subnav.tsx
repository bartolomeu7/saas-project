"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import type { SettingsNavItem } from "@/lib/settings/nav";

/**
 * Abas das telas de Configurações (visão geral, perfil, segurança, aparência…). Rolam na horizontal no celular.
 * É navegação por links (cada aba é uma página), por isso usa aria-current e não o padrão de tablist.
 */
export function SettingsSubnav({ items, label = "Seções de Configurações" }: { items: SettingsNavItem[]; label?: string }) {
  const pathname = usePathname().replace(/\/+$/, "");

  return (
    <nav aria-label={label} className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <ul className="flex min-w-max gap-1 border-b border-border">
        {items.map((item) => {
          const active = pathname === item.href;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "-mb-px inline-flex h-11 items-center border-b-2 px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  active
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
                )}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
