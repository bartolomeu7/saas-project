"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Package, Search, ShoppingCart, UserPlus, Wrench } from "lucide-react";
import { NAV_GROUPS } from "@/components/app/nav-items";
import { Button } from "@/components/ui/button";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { getSaleSegmentHints } from "@/config/sale-segments";
import type { BusinessType } from "@/types/company";

/**
 * Busca rápida (Ctrl/⌘ + K) para navegar entre módulos e abrir os
 * cadastros mais usados. Só usa rotas que já existem: itens de menu
 * desabilitados ("Em breve") não aparecem.
 */
export function CommandMenu({ businessType }: { businessType: BusinessType }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const saleLabel = getSaleSegmentHints(businessType).newSaleLabel;

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((value) => !value);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const go = useCallback(
    (href: string) => {
      setOpen(false);
      router.push(href);
    },
    [router]
  );

  const quickActions = [
    { label: "Novo cliente", href: "/app/clientes/novo", icon: UserPlus },
    { label: "Novo produto", href: "/app/produtos/novo", icon: Package },
    { label: saleLabel, href: "/app/vendas/nova", icon: ShoppingCart },
    { label: "Novo serviço", href: "/app/servicos/novo", icon: Wrench },
  ];

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="hidden h-9 w-56 justify-start gap-2 bg-secondary/40 font-normal text-muted-foreground hover:text-foreground md:inline-flex"
        aria-label="Abrir busca rápida"
      >
        <Search className="!size-4" strokeWidth={1.75} />
        <span className="flex-1 text-left">Buscar…</span>
        <kbd className="pointer-events-none rounded border border-border bg-background px-1.5 font-mono text-[10px] text-muted-foreground">
          Ctrl K
        </kbd>
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={() => setOpen(true)}
        className="h-9 w-9 rounded-full text-muted-foreground hover:text-foreground md:hidden"
        aria-label="Abrir busca rápida"
      >
        <Search className="!size-[18px]" strokeWidth={1.75} />
      </Button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Buscar página ou ação…" />
        <CommandList>
          <CommandEmpty>Nada encontrado.</CommandEmpty>
          <CommandGroup heading="Ações rápidas">
            {quickActions.map((action) => {
              const Icon = action.icon;
              return (
                <CommandItem
                  key={action.href}
                  value={`ação ${action.label}`}
                  onSelect={() => go(action.href)}
                >
                  <Icon className="mr-2 size-4" strokeWidth={1.75} />
                  {action.label}
                </CommandItem>
              );
            })}
          </CommandGroup>
          <CommandSeparator />
          {NAV_GROUPS.map((group, index) => {
            const items = group.items.filter((item) => item.enabled);
            if (items.length === 0) return null;
            return (
              <CommandGroup key={group.label ?? `group-${index}`} heading={group.label ?? "Início"}>
                {items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <CommandItem
                      key={item.href}
                      value={`ir para ${item.label}`}
                      onSelect={() => go(item.href)}
                    >
                      <Icon className="mr-2 size-4" strokeWidth={1.75} />
                      {item.label}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            );
          })}
        </CommandList>
      </CommandDialog>
    </>
  );
}
