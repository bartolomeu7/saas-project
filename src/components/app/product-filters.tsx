"use client";

import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import type { ProductCategory } from "@/types/product";

const STATUS_FILTERS: { label: string; value: "all" | "active" | "inactive" }[] = [
  { label: "Todos", value: "all" },
  { label: "Ativos", value: "active" },
  { label: "Inativos", value: "inactive" },
];

const STOCK_FILTERS: { label: string; value: "all" | "normal" | "low" | "out" }[] = [
  { label: "Todos os estoques", value: "all" },
  { label: "Estoque normal", value: "normal" },
  { label: "Estoque baixo", value: "low" },
  { label: "Sem estoque", value: "out" },
];

const SORT_OPTIONS: { label: string; value: string }[] = [
  { label: "Nome", value: "name" },
  { label: "Preço", value: "price" },
  { label: "Estoque", value: "stock" },
  { label: "Data de cadastro", value: "created_at" },
];

export function ProductFilters({ categories }: { categories: ProductCategory[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const status = searchParams.get("status") ?? "all";
  const stock = searchParams.get("stock") ?? "all";
  const category = searchParams.get("category") ?? "all";
  const sort = searchParams.get("sort") ?? "name";

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

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-md border border-border p-1">
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

        <select
          value={stock}
          onChange={(event) => updateParam("stock", event.target.value)}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {STOCK_FILTERS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <select
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
        </select>

        <select
          value={sort}
          onChange={(event) => updateParam("sort", event.target.value)}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              Ordenar por {option.label.toLowerCase()}
            </option>
          ))}
        </select>

        {isPending && (
          <span className="text-xs text-muted-foreground">Atualizando...</span>
        )}
      </div>
    </div>
  );
}
