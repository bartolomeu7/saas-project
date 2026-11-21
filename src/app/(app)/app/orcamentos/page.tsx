import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, FileSignature, Hourglass, Pencil, Search, Send } from "lucide-react";
import { MetricCard } from "@/components/app/metric-card";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { ListAvatar } from "@/components/app/list-toolbar";
import { QuoteStatusBadge } from "@/components/app/quote-status-badge";
import { buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getCurrentCompany } from "@/lib/companies/queries";
import { getQuoteStats, listQuotes, QUOTE_LIST_LIMIT } from "@/lib/quotes/queries";
import { QUOTE_STATUS_LABELS, type QuoteDisplayStatus } from "@/lib/quotes/rules";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Orçamentos" };

const money = (value: number) => Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const FILTERS: QuoteDisplayStatus[] = ["draft", "sent", "approved", "rejected", "expired"];

export default async function QuotesPage({ searchParams: searchParamsPromise }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  const searchParams = await searchParamsPromise;
  const current = (await getCurrentCompany())!;
  const status = FILTERS.find((entry) => entry === searchParams?.status) ?? "";
  const search = (searchParams?.q ?? "").slice(0, 80).trim();
  const [stats, { rows, total }] = await Promise.all([getQuoteStats(current.company.id), listQuotes(current.company.id, { search, status })]);
  const filtering = Boolean(search || status);

  return (
    <div className="prime-module-page prime-module-page--orcamentos flex flex-col gap-6 px-4 py-6 sm:px-6">
      <PageHeader
        title="Orçamentos"
        description="Monte a proposta, baixe o PDF e acompanhe se o cliente aprovou."
        actions={
          <Link href="/app/orcamentos/novo" className={cn(buttonVariants())}>
            + Novo orçamento
          </Link>
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Rascunhos" value={String(stats.draft)} icon={Pencil} />
        <MetricCard label="Aguardando resposta" value={`${stats.open} · ${money(stats.openAmount)}`} icon={Send} />
        <MetricCard label="Aprovados" value={`${stats.approved} · ${money(stats.approvedAmount)}`} icon={CheckCircle2} />
        <MetricCard label="Vencidos" value={String(stats.expired)} icon={Hourglass} />
      </div>

      {stats.total === 0 && !filtering ? (
        <EmptyState
          title="Nenhum orçamento ainda."
          description="Crie o primeiro: escolha o cliente, adicione os itens e baixe o PDF para enviar."
          actionLabel="Novo orçamento"
          actionHref="/app/orcamentos/novo"
          icon={FileSignature}
        />
      ) : (
        <>
          <form className="flex flex-wrap items-center gap-2" role="search">
            <div className="relative min-w-[12rem] flex-1 sm:max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <input
                name="q"
                type="search"
                defaultValue={searchParams?.q ?? ""}
                aria-label="Buscar orçamento ou cliente"
                placeholder="Buscar número, cliente ou assunto..."
                className="h-10 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <select name="status" defaultValue={status} aria-label="Filtrar por situação" className="h-10 rounded-md border border-input bg-background px-3 text-sm">
              <option value="">Todas as situações</option>
              {FILTERS.map((entry) => (
                <option key={entry} value={entry}>
                  {QUOTE_STATUS_LABELS[entry]}
                </option>
              ))}
            </select>
            <button className={cn(buttonVariants({ variant: "outline" }))}>Filtrar</button>
          </form>
          <p className="text-xs text-muted-foreground" aria-live="polite">
            {total} {total === 1 ? "orçamento" : "orçamentos"}
            {total > QUOTE_LIST_LIMIT ? ` (mostrando os ${QUOTE_LIST_LIMIT} mais recentes)` : ""}
          </p>
          {rows.length === 0 && <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">Nenhum orçamento encontrado com esse filtro.</p>}
          {rows.length > 0 && (
            <div className="overflow-x-auto rounded-xl border border-border bg-card/40">
              <Table className="w-full text-sm sm:min-w-[560px]">
                <TableHeader className="bg-secondary/60 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                  <TableRow>
                    <TableHead className="px-4 py-3 font-semibold">Orçamento</TableHead>
                    <TableHead className="hidden px-4 py-3 font-semibold md:table-cell">Cliente</TableHead>
                    <TableHead className="px-4 py-3 font-semibold">Situação</TableHead>
                    <TableHead className="hidden px-4 py-3 font-semibold lg:table-cell">Emissão</TableHead>
                    <TableHead className="hidden px-4 py-3 font-semibold lg:table-cell">Válido até</TableHead>
                    <TableHead className="px-4 py-3 text-right font-semibold">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((quote) => (
                    <TableRow key={quote.id} className="hover:bg-secondary/30">
                      <TableCell className="px-4 py-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <ListAvatar>
                            <FileSignature className="h-4 w-4" strokeWidth={1.75} />
                          </ListAvatar>
                          <div className="min-w-0">
                            <Link href={`/app/orcamentos/${quote.id}`} className="block truncate font-medium text-foreground underline-offset-4 hover:underline">
                              {quote.number}
                            </Link>
                            <span className="block truncate text-xs text-muted-foreground md:hidden">{quote.customer_name}</span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="hidden px-4 py-3 text-muted-foreground md:table-cell">
                        <span className="block max-w-[16rem] truncate">{quote.customer_name}</span>
                        {quote.title && <span className="block max-w-[16rem] truncate text-xs">{quote.title}</span>}
                      </TableCell>
                      <TableCell className="px-4 py-3">
                        <QuoteStatusBadge status={quote.display_status} />
                      </TableCell>
                      <TableCell className="hidden px-4 py-3 text-muted-foreground lg:table-cell">{formatDate(quote.issued_on)}</TableCell>
                      <TableCell className="hidden px-4 py-3 text-muted-foreground lg:table-cell">{formatDate(quote.valid_until)}</TableCell>
                      <TableCell className="px-4 py-3 text-right font-medium text-foreground">{money(quote.total_amount)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
