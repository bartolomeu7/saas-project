import { Skeleton } from "@/components/ui/skeleton";

/** Esqueleto do painel da plataforma enquanto a página carrega (streaming do App Router). */
export default function AdminLoading() {
  return (
    <div
      className="flex flex-col gap-6 px-4 py-6 sm:px-6"
      role="status"
      aria-busy="true"
      aria-label="Carregando painel"
    >
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-lg" />
        ))}
      </div>
      <div className="flex flex-col gap-2 rounded-lg border border-border p-4">
        <Skeleton className="h-9 w-full sm:w-72" />
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
      <span className="sr-only">Carregando…</span>
    </div>
  );
}
