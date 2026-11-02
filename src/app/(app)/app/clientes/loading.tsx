import { Skeleton } from "@/components/ui/skeleton";

/** Esqueleto da lista de clientes (mesmo desenho da página: cabeçalho, indicadores, barra e linhas da tabela). */
export default function CustomersLoading() {
  return (
    <div
      className="flex flex-col gap-6 px-4 py-6 sm:px-6"
      role="status"
      aria-busy="true"
      aria-label="Carregando clientes"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-64 max-w-full" />
        </div>
        <Skeleton className="h-10 w-36 rounded-md" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-[62px] rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-[62px] w-full rounded-xl" />
      <div className="flex flex-col gap-2 rounded-xl border border-border p-3">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
            <Skeleton className="h-4 w-40 max-w-[45%]" />
            <Skeleton className="ml-auto h-6 w-16 rounded-full" />
          </div>
        ))}
      </div>
      <span className="sr-only">Carregando…</span>
    </div>
  );
}
