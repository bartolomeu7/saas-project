import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Barra de busca e filtros das listagens dos módulos (padrão visual do toolbar de tabelas do Kiranism/shadcn).
 * Só layout: a busca e os filtros continuam sendo componentes de cada módulo, guiados por parâmetros da URL.
 */
export function ListToolbar({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-xl border border-border bg-card/60 p-3 sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** "Mostrando 1–10 de 25 clientes" — dados reais da paginação do servidor. */
export function ListSummary({
  page,
  pageSize,
  total,
  itemLabel = "cliente",
  itemLabelPlural = "clientes",
  className,
}: {
  page: number;
  pageSize: number;
  total: number;
  itemLabel?: string;
  itemLabelPlural?: string;
  className?: string;
}) {
  if (total <= 0) return null;
  const first = (page - 1) * pageSize + 1;
  const last = Math.min(total, page * pageSize);
  return (
    <p className={cn("text-xs text-muted-foreground", className)} aria-live="polite">
      Mostrando {first}–{last} de {total} {total === 1 ? itemLabel : itemLabelPlural}
    </p>
  );
}
