"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";

/**
 * Busca por nome, telefone, e-mail ou documento. Atualiza a URL (?q=...)
 * com debounce, sempre resetando a página para 1 — a listagem em si é
 * feita no servidor a partir do searchParam, nunca carregando todos os
 * clientes no client para filtrar localmente.
 */
export function CustomerSearch() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [value, setValue] = useState(searchParams.get("q") ?? "");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const timeout = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());

      if (value) {
        params.set("q", value);
      } else {
        params.delete("q");
      }
      params.delete("page");

      startTransition(() => {
        router.push(`${pathname}?${params.toString()}`);
      });
    }, 350);

    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <div className="flex items-center gap-2 sm:min-w-[320px]">
      <div className="relative w-full max-w-sm">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          type="search"
          aria-label="Buscar clientes por nome, telefone, e-mail ou documento"
          placeholder="Buscar cliente..."
          value={value}
          onChange={(event) => setValue(event.target.value)}
          className="pl-9"
        />
      </div>
      {isPending && (
        <span className="text-xs text-muted-foreground">Buscando...</span>
      )}
    </div>
  );
}
