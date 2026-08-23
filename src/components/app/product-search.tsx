"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";

/**
 * Busca por nome, SKU ou código de barras. Mesmo padrão de
 * CustomerSearch: debounce, atualiza a URL (?q=...), reseta página,
 * sempre filtra no servidor.
 */
export function ProductSearch() {
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
    <div className="flex items-center gap-2">
      <Input
        type="search"
        placeholder="Buscar por nome, SKU ou código de barras..."
        value={value}
        onChange={(event) => setValue(event.target.value)}
        className="max-w-sm"
      />
      {isPending && (
        <span className="text-xs text-muted-foreground">Buscando...</span>
      )}
    </div>
  );
}
