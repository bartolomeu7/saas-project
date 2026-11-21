import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/app/page-header";
import { QuoteActions } from "@/components/app/quote-actions";
import { QuoteStatusBadge } from "@/components/app/quote-status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getCurrentCompany } from "@/lib/companies/queries";
import { getQuoteDetail } from "@/lib/quotes/queries";
import { allowedTransitions, daysBetweenIso, formatQuantity, toMilli } from "@/lib/quotes/rules";
import { QUOTE_EVENT_LABELS } from "@/types/quote";
import { formatDate, formatDateTime } from "@/lib/format";
import { todayDateSaoPaulo } from "@/lib/timezone";

export const metadata: Metadata = { title: "Orçamento" };

const money = (value: number) => Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default async function QuoteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const current = (await getCurrentCompany())!;
  const detail = await getQuoteDetail(current.company.id, id);
  if (!detail) notFound();
  const { quote, items, events } = detail;
  const today = todayDateSaoPaulo();
  const transitions = allowedTransitions(quote.status, quote.valid_until, today);
  const daysLeft = daysBetweenIso(today, quote.valid_until);

  return (
    <div className="flex flex-col gap-6 px-4 py-6 sm:px-6">
      <Link href="/app/orcamentos" className="text-sm text-muted-foreground hover:underline">
        ← Voltar para Orçamentos
      </Link>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            {quote.number}
            <QuoteStatusBadge status={quote.display_status} />
          </span>
        }
        description={quote.title ?? undefined}
      />

      <QuoteActions id={quote.id} status={quote.status} transitions={transitions} />

      {quote.display_status === "expired" && (
        <p role="status" className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          A validade deste orçamento acabou em {formatDate(quote.valid_until)}. Para aprovar, volte para rascunho e atualize a validade.
        </p>
      )}
      {quote.status === "sent" && daysLeft >= 0 && daysLeft <= 3 && (
        <p role="status" className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          {daysLeft === 0 ? "A validade acaba hoje." : `Faltam ${daysLeft} ${daysLeft === 1 ? "dia" : "dias"} para a validade acabar.`}
        </p>
      )}
      {quote.status === "rejected" && quote.rejection_reason && (
        <p role="status" className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
          Motivo da recusa: {quote.rejection_reason}
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <section className="rounded-xl border bg-card p-4 lg:col-span-2">
          <h2 className="mb-3 font-semibold">Cliente</h2>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-muted-foreground">Nome</dt>
              <dd>{quote.customer_id ? <Link className="underline-offset-4 hover:underline" href={`/app/clientes/${quote.customer_id}`}>{quote.customer_name}</Link> : quote.customer_name}</dd>
            </div>
            {quote.customer_document && (
              <div>
                <dt className="text-xs text-muted-foreground">CPF/CNPJ</dt>
                <dd>{quote.customer_document}</dd>
              </div>
            )}
            {quote.customer_phone && (
              <div>
                <dt className="text-xs text-muted-foreground">Telefone / WhatsApp</dt>
                <dd>{quote.customer_phone}</dd>
              </div>
            )}
            {quote.customer_email && (
              <div>
                <dt className="text-xs text-muted-foreground">E-mail</dt>
                <dd className="break-all">{quote.customer_email}</dd>
              </div>
            )}
            {quote.customer_address && (
              <div className="sm:col-span-2">
                <dt className="text-xs text-muted-foreground">Endereço</dt>
                <dd>{quote.customer_address}</dd>
              </div>
            )}
          </dl>
        </section>
        <section className="rounded-xl border bg-card p-4">
          <h2 className="mb-3 font-semibold">Datas</h2>
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <dt className="text-muted-foreground">Emissão</dt>
            <dd className="text-right">{formatDate(quote.issued_on)}</dd>
            <dt className="text-muted-foreground">Válido até</dt>
            <dd className="text-right">{formatDate(quote.valid_until)}</dd>
            {quote.sent_at && (
              <>
                <dt className="text-muted-foreground">Enviado em</dt>
                <dd className="text-right">{formatDateTime(quote.sent_at)}</dd>
              </>
            )}
            {quote.approved_at && (
              <>
                <dt className="text-muted-foreground">Aprovado em</dt>
                <dd className="text-right">{formatDateTime(quote.approved_at)}</dd>
              </>
            )}
            {quote.rejected_at && (
              <>
                <dt className="text-muted-foreground">Recusado em</dt>
                <dd className="text-right">{formatDateTime(quote.rejected_at)}</dd>
              </>
            )}
          </dl>
        </section>
      </div>

      <section className="rounded-xl border bg-card">
        <h2 className="border-b p-4 font-semibold">Itens</h2>
        <div className="overflow-x-auto">
          <Table className="w-full text-sm sm:min-w-[560px]">
            <TableHeader className="bg-secondary/60 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
              <TableRow>
                <TableHead className="px-4 py-3 font-semibold">#</TableHead>
                <TableHead className="px-4 py-3 font-semibold">Descrição</TableHead>
                <TableHead className="px-4 py-3 text-right font-semibold">Qtd.</TableHead>
                <TableHead className="px-4 py-3 text-right font-semibold">Preço</TableHead>
                <TableHead className="hidden px-4 py-3 text-right font-semibold sm:table-cell">Desconto</TableHead>
                <TableHead className="px-4 py-3 text-right font-semibold">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="px-4 py-3 text-muted-foreground">{item.position}</TableCell>
                  <TableCell className="px-4 py-3">{item.description}</TableCell>
                  <TableCell className="px-4 py-3 text-right whitespace-nowrap">
                    {formatQuantity(toMilli(String(item.quantity)))} {item.unit}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-right whitespace-nowrap">{money(item.unit_price)}</TableCell>
                  <TableCell className="hidden px-4 py-3 text-right whitespace-nowrap sm:table-cell">{Number(item.discount_amount) > 0 ? money(item.discount_amount) : "—"}</TableCell>
                  <TableCell className="px-4 py-3 text-right font-medium whitespace-nowrap">{money(item.total_amount)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <div className="flex flex-col items-end gap-1 border-t bg-muted/20 p-4 text-sm">
          <p className="text-muted-foreground">Subtotal {money(quote.subtotal)}</p>
          {Number(quote.discount_amount) > 0 && <p className="text-muted-foreground">Desconto {money(quote.discount_amount)}</p>}
          <p className="text-2xl font-semibold">{money(quote.total_amount)}</p>
        </div>
      </section>

      {(quote.payment_terms || quote.delivery_terms || quote.notes || quote.footer) && (
        <section className="grid grid-cols-1 gap-4 rounded-xl border bg-card p-4 text-sm">
          {quote.payment_terms && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Condições de pagamento</h3>
              <p className="mt-1 whitespace-pre-line">{quote.payment_terms}</p>
            </div>
          )}
          {quote.delivery_terms && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Prazo de entrega / execução</h3>
              <p className="mt-1 whitespace-pre-line">{quote.delivery_terms}</p>
            </div>
          )}
          {quote.notes && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Observações</h3>
              <p className="mt-1 whitespace-pre-line">{quote.notes}</p>
            </div>
          )}
          {quote.footer && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Rodapé do PDF</h3>
              <p className="mt-1 whitespace-pre-line">{quote.footer}</p>
            </div>
          )}
        </section>
      )}

      <section className="rounded-xl border bg-card p-4">
        <h2 className="mb-3 font-semibold">Histórico</h2>
        <ol className="flex flex-col gap-2 text-sm">
          {events.map((event) => (
            <li key={event.id} className="flex flex-wrap items-baseline justify-between gap-2">
              <span>
                {QUOTE_EVENT_LABELS[event.event]}
                {event.note ? <span className="text-muted-foreground"> — {event.note}</span> : null}
              </span>
              <time className="text-xs text-muted-foreground" dateTime={event.created_at}>
                {formatDateTime(event.created_at)}
              </time>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
