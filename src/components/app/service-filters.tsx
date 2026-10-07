"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ServiceCategory } from "@/types/service";
import { NativeSelect } from "@/components/ui/native-select";

const STATUS_FILTERS: { label: string; value: "all" | "active" | "inactive" }[] = [
  { label: "Todos", value: "all" },
  { label: "Ativos", value: "active" },
  { label: "Inativos", value: "inactive" },
];

const SORT_OPTIONS: { label: string; value: string }[] = [
  { label: "Nome", value: "name" },
  { label: "Preço", value: "price" },
  { label: "Duração", value: "duration" },
  { label: "Data de cadastro", value: "created_at" },
];

export function ServiceFilters({ categories }: { categories: ServiceCategory[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const status = searchParams.get("status") ?? "all";
  const category = searchParams.get("category") ?? "all";
  const sort = searchParams.get("sort") ?? "name";

  const [minPrice, setMinPrice] = useState(searchParams.get("minPrice") ?? "");
  const [maxPrice, setMaxPrice] = useState(searchParams.get("maxPrice") ?? "");
  const [minDuration, setMinDuration] = useState(searchParams.get("minDuration") ?? "");
  const [maxDuration, setMaxDuration] = useState(searchParams.get("maxDuration") ?? "");

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());

    if (value === "all" || value === "") {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    params.delete("page");

    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  }

  // Filtros numéricos (preço/duração) usam debounce, igual à busca por
  // nome — evita disparar uma navegação a cada tecla digitada.
  useEffect(() => {
    const timeout = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      const entries: [string, string][] = [
        ["minPrice", minPrice],
        ["maxPrice", maxPrice],
        ["minDuration", minDuration],
        ["maxDuration", maxDuration],
      ];
      for (const [key, value] of entries) {
        if (value) {
          params.set(key, value);
        } else {
          params.delete(key);
        }
      }
      params.delete("page");

      startTransition(() => {
        router.push(`${pathname}?${params.toString()}`);
      });
    }, 400);

    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minPrice, maxPrice, minDuration, maxDuration]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex max-w-full flex-wrap rounded-md border border-border p-1">
          {STATUS_FILTERS.map((filter) => (
            <button
              key={filter.value}
              type="button"
              onClick={() => updateParam("status", filter.value)}
              className={cn(
                "rounded px-3 py-1.5 text-sm font-medium transition-colors",
                status === filter.value
                  ? "bg-secondary text-secondary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {filter.label}
            </button>
          ))}
        </div>

        <NativeSelect
          value={category}
          onChange={(event) => updateParam("category", event.target.value)}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="all">Todas as categorias</option>
          {categories.map((cat) => (
            <option key={cat.id} value={cat.id}>
              {cat.name}
            </option>
          ))}
        </NativeSelect>

        <NativeSelect
          value={sort}
          onChange={(event) => updateParam("sort", event.target.value)}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              Ordenar por {option.label.toLowerCase()}
            </option>
          ))}
        </NativeSelect>

        {isPending && (
          <span className="text-xs text-muted-foreground">Atualizando...</span>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor="minPrice" className="text-xs text-muted-foreground">
            Preço mínimo
          </Label>
          <Input
            id="minPrice"
            type="number"
            step="0.01"
            min="0"
            placeholder="R$ 0,00"
            value={minPrice}
            onChange={(event) => setMinPrice(event.target.value)}
            className="h-9 w-28"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="maxPrice" className="text-xs text-muted-foreground">
            Preço máximo
          </Label>
          <Input
            id="maxPrice"
            type="number"
            step="0.01"
            min="0"
            placeholder="Sem limite"
            value={maxPrice}
            onChange={(event) => setMaxPrice(event.target.value)}
            className="h-9 w-28"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="minDuration" className="text-xs text-muted-foreground">
            Duração mínima (min)
          </Label>
          <Input
            id="minDuration"
            type="number"
            step="1"
            min="0"
            placeholder="0"
            value={minDuration}
            onChange={(event) => setMinDuration(event.target.value)}
            className="h-9 w-28"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="maxDuration" className="text-xs text-muted-foreground">
            Duração máxima (min)
          </Label>
          <Input
            id="maxDuration"
            type="number"
            step="1"
            min="0"
            placeholder="Sem limite"
            value={maxDuration}
            onChange={(event) => setMaxDuration(event.target.value)}
            className="h-9 w-28"
          />
        </div>
      </div>
    </div>
  );
}
