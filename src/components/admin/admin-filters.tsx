import Link from "next/link";
import { Search } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";

export interface AdminFilterSelect {
  name: string;
  label: string;
  /** Primeira opção ("Todos"), com value vazio. */
  allLabel: string;
  value: string | undefined;
  options: { value: string; label: string }[];
}

export interface AdminFilterDate {
  name: string;
  label: string;
  value: string | undefined;
}

/**
 * Barra de busca + filtros das listas do admin. É um <form method="get"> puro:
 * o estado vive na URL (compartilhável, funciona sem JS e preserva paginação
 * via Pagination). Mesmos campos do kit do shadcn/ui (Input, NativeSelect, Button).
 */
export function AdminFilters({
  basePath,
  search,
  searchPlaceholder,
  selects,
  dates = [],
  hideSearch = false,
}: {
  basePath: string;
  search: string | undefined;
  searchPlaceholder: string;
  selects: AdminFilterSelect[];
  dates?: AdminFilterDate[];
  /** Esconde o campo de busca (listas que só filtram por seletores/datas). */
  hideSearch?: boolean;
}) {
  const hasFilters =
    Boolean(search) || selects.some((select) => Boolean(select.value)) || dates.some((date) => Boolean(date.value));

  return (
    <form
      method="get"
      action={basePath}
      role="search"
      className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end"
    >
      {!hideSearch && (
        <div className="relative sm:w-72">
          <label htmlFor="admin-q" className="sr-only">
            Buscar
          </label>
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            strokeWidth={1.75}
            aria-hidden="true"
          />
          <Input
            id="admin-q"
            name="q"
            defaultValue={search}
            placeholder={searchPlaceholder}
            autoComplete="off"
            maxLength={80}
            className="pl-9"
          />
        </div>
      )}

      {selects.map((select) => (
        <div key={select.name} className="flex flex-col gap-1">
          <label htmlFor={`admin-${select.name}`} className="sr-only">
            {select.label}
          </label>
          <NativeSelect
            id={`admin-${select.name}`}
            name={select.name}
            defaultValue={select.value ?? ""}
            aria-label={select.label}
          >
            <option value="">{select.allLabel}</option>
            {select.options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </NativeSelect>
        </div>
      ))}

      {dates.map((date) => (
        <div key={date.name} className="flex flex-col gap-1">
          <label htmlFor={`admin-${date.name}`} className="text-xs text-muted-foreground">
            {date.label}
          </label>
          <Input id={`admin-${date.name}`} name={date.name} type="date" defaultValue={date.value} className="w-40" />
        </div>
      ))}

      <div className="flex items-center gap-2">
        <Button type="submit">Filtrar</Button>
        {hasFilters && (
          <Link href={basePath} className={cn(buttonVariants({ variant: "ghost" }))}>
            Limpar
          </Link>
        )}
      </div>
    </form>
  );
}
