import Link from "next/link";
import { LifeBuoy } from "lucide-react";
import { AdminFilters } from "@/components/admin/admin-filters";
import { PaymentStatusBadge } from "@/components/admin/admin-badges";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { Pagination } from "@/components/app/pagination";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { parseEnum, parsePage, type SearchParams } from "@/lib/admin/params";
import { ADMIN_PAGE_SIZE, listPlatformTickets, requirePlatformAdmin } from "@/lib/admin/queries";
import { formatCurrency, formatDateTime } from "@/lib/format";
import { formatOrderCode, TICKET_REASON_LABELS } from "@/types/billing";

export const metadata = { title: "Suporte" };

const VIEWS = ["resolved", "all"] as const;

/** Chamados abertos pelos clientes sobre ordens de pagamento. A resposta é dada no detalhe do pagamento. */
export default async function AdminSupportPage({ searchParams: searchParamsPromise }: { searchParams: Promise<SearchParams> }) {
  await requirePlatformAdmin();
  const searchParams = await searchParamsPromise;
  const view = parseEnum(searchParams.status, VIEWS);
  const page = parsePage(searchParams.page);
  const { rows, total } = await listPlatformTickets(view === "all" ? null : (view ?? "open"), page);

  return (
    <div className="flex flex-col gap-6 px-4 py-6 sm:px-6">
      <PageHeader eyebrow="Visão geral" title="Suporte" description="Chamados dos clientes sobre ordens de pagamento. Os abertos mais antigos vêm primeiro." />

      <AdminFilters
        basePath="/admin/support"
        search={undefined}
        searchPlaceholder=""
        hideSearch
        selects={[
          {
            name: "status",
            label: "Situação",
            allLabel: "Abertos",
            value: view,
            options: [
              { value: "resolved", label: "Resolvidos" },
              { value: "all", label: "Todos" },
            ],
          },
        ]}
      />

      {rows.length === 0 ? (
        <EmptyState
          icon={LifeBuoy}
          title={view ? "Nenhum chamado encontrado" : "Nenhum chamado aberto"}
          description="Quando um cliente pedir ajuda em uma ordem de pagamento, o chamado aparece aqui."
          {...(page > 1 ? { actionLabel: "Ir para a primeira página", actionHref: "/admin/support" } : {})}
        />
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ordem</TableHead>
                <TableHead>Aberto em</TableHead>
                <TableHead>Empresa</TableHead>
                <TableHead>Assunto</TableHead>
                <TableHead>Pagamento</TableHead>
                <TableHead>Chamado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((ticket) => (
                <TableRow key={ticket.ticket_id}>
                  <TableCell className="whitespace-nowrap">
                    <Link
                      href={`/admin/payments/${ticket.payment_id}`}
                      className="font-mono font-medium underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {formatOrderCode(ticket.order_number)}
                    </Link>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{formatDateTime(ticket.created_at)}</TableCell>
                  <TableCell>
                    <Link href={`/admin/companies/${ticket.company_id}`} className="underline-offset-4 hover:underline">
                      {ticket.company_name}
                    </Link>
                    {ticket.opened_by_email && <span className="block text-xs text-muted-foreground">{ticket.opened_by_email}</span>}
                  </TableCell>
                  <TableCell className="max-w-[20rem]">
                    <span className="block text-foreground">{TICKET_REASON_LABELS[ticket.reason] ?? ticket.reason}</span>
                    <span className="block truncate text-xs text-muted-foreground" title={ticket.message}>
                      {ticket.message}
                    </span>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <PaymentStatusBadge status={ticket.payment_status} />
                      <span className="tabular-nums">{formatCurrency(ticket.amount)}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={ticket.status === "open" ? "warning" : "success"}>{ticket.status === "open" ? "Aberto" : "Resolvido"}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <Pagination
        page={page}
        pageSize={ADMIN_PAGE_SIZE}
        total={total}
        basePath="/admin/support"
        searchParams={{ status: view }}
        itemLabel="chamado"
        itemLabelPlural="chamados"
      />
    </div>
  );
}
