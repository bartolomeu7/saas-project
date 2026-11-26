"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, LoaderCircle, ReceiptText, Search, User } from "lucide-react";
import { visibleAdminNavGroups } from "@/components/admin/admin-nav-items";
import { Button } from "@/components/ui/button";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { adminSearchAction } from "@/lib/admin/search-actions";
import type { SearchHit } from "@/types/admin";
import type { UserRole } from "@/types/profile";

export const OPEN_ADMIN_SEARCH_EVENT = "prime-admin-search";

const HIT_KINDS = {
  user: { heading: "Usuários", icon: User, base: "/admin/users" },
  company: { heading: "Empresas", icon: Building2, base: "/admin/companies" },
  payment: { heading: "Pagamentos", icon: ReceiptText, base: "/admin/payments" },
} as const;

/** Busca rápida do painel (Ctrl/⌘ + K): abre qualquer aba e encontra usuário, empresa ou pagamento. */
export function AdminCommandMenu({ role }: { role: UserRole }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  // Resultado guardado junto do termo que o gerou: enquanto não bate com o digitado, está "buscando".
  const [result, setResult] = useState<{ query: string; hits: SearchHit[]; failed: boolean }>({ query: "", hits: [], failed: false });
  const query = term.trim();
  const active = open && query.length >= 2;
  const current = active && result.query === query;
  const searching = active && !current;
  const hits = current ? result.hits : [];

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((value) => !value);
      }
    }
    const onOpen = () => setOpen(true);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener(OPEN_ADMIN_SEARCH_EVENT, onOpen);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener(OPEN_ADMIN_SEARCH_EVENT, onOpen);
    };
  }, []);

  useEffect(() => {
    if (!active) return;
    let stale = false;
    const timer = window.setTimeout(() => {
      adminSearchAction(query)
        .then((found) => {
          if (!stale) setResult({ query, hits: found, failed: false });
        })
        .catch(() => {
          if (!stale) setResult({ query, hits: [], failed: true });
        });
    }, 250);
    return () => {
      stale = true;
      window.clearTimeout(timer);
    };
  }, [active, query]);

  function go(href: string) {
    setOpen(false);
    setTerm("");
    router.push(href);
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="h-9 gap-2 bg-secondary/40 font-normal text-muted-foreground hover:text-foreground md:w-64 md:justify-start"
        aria-label="Abrir a busca do painel"
      >
        <Search className="!size-4" strokeWidth={1.75} />
        <span className="hidden flex-1 text-left md:inline">Buscar no painel…</span>
        <kbd className="pointer-events-none hidden rounded border border-border bg-background px-1.5 font-mono text-[10px] text-muted-foreground md:inline">
          Ctrl K
        </kbd>
      </Button>

      <CommandDialog open={open} onOpenChange={setOpen} title="Busca do painel">
        <CommandInput value={term} onValueChange={setTerm} maxLength={80} placeholder="Aba, usuário, empresa ou pagamento…" />
        <CommandList>
          <CommandEmpty>{searching ? "Buscando…" : "Nada encontrado."}</CommandEmpty>
          {searching && (
            <p className="flex items-center gap-2 px-4 py-2 text-xs text-muted-foreground" role="status">
              <LoaderCircle className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" /> Buscando…
            </p>
          )}
          {current && result.failed && <p className="px-4 py-2 text-xs text-destructive" role="alert">Não foi possível buscar agora.</p>}

          {(Object.keys(HIT_KINDS) as SearchHit["kind"][]).map((kind) => {
            const items = hits.filter((hit) => hit.kind === kind);
            if (items.length === 0) return null;
            const { heading, icon: Icon, base } = HIT_KINDS[kind];
            return (
              <CommandGroup key={kind} heading={heading}>
                {items.map((hit) => (
                  // O termo digitado entra no valor para o filtro local não esconder o que o banco já encontrou.
                  <CommandItem key={hit.id} value={`${term} ${hit.id}`} onSelect={() => go(`${base}/${hit.id}`)}>
                    <Icon className="mr-2" strokeWidth={1.75} />
                    <span className="truncate">{hit.title ?? "Sem nome"}</span>
                    {hit.subtitle && <span className="ml-2 truncate text-xs text-muted-foreground">{hit.subtitle}</span>}
                  </CommandItem>
                ))}
              </CommandGroup>
            );
          })}

          {visibleAdminNavGroups(role).map((group) => (
            <CommandGroup key={group.label} heading={group.label}>
              {group.items.map((item) => {
                const Icon = item.icon;
                return (
                  <CommandItem key={item.href} value={`${item.label} ${group.label}`} onSelect={() => go(item.href)}>
                    <Icon className="mr-2" strokeWidth={1.75} />
                    {item.label}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          ))}
        </CommandList>
      </CommandDialog>
    </>
  );
}
