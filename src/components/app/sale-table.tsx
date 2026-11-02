import Link from "next/link";
import { ShoppingCart } from "lucide-react";
import type { SaleWithCustomer } from "@/types/sale";
import type { CompanyRole } from "@/types/company";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { ListAvatar } from "@/components/app/list-toolbar";
import { SaleStatusBadge } from "@/components/app/sale-status-badge";
import { SalePaymentStatusBadge } from "@/components/app/sale-payment-status-badge";
import { CancelSaleButton } from "@/components/app/cancel-sale-button";
import { formatDate } from "@/lib/format";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";

function formatMoney(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function saleNumber(id: string): string {
  return `#${id.slice(0, 8).toUpperCase()}`;
}

/** Owner/admin sempre podem cancelar; employee só a própria venda. */
function canCancel(sale: SaleWithCustomer, role: CompanyRole, userId: string | null): boolean {
  if (sale.status !== "completed") return false;
  if (role === "owner" || role === "admin") return true;
  return sale.user_id === userId;
}

/**
 * Tabela de vendas no visual de "data table": número com avatar, cliente e data abaixo no celular, colunas extras
 * só quando cabem e ações agrupadas. Mesmas regras de cancelamento (canCancel) e mesmos dados de antes.
 */
export function SaleTable({
  sales,
  currentRole,
  currentUserId,
}: {
  sales: SaleWithCustomer[];
  currentRole: CompanyRole;
  currentUserId: string | null;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card/40">
      <Table className="w-full text-sm sm:min-w-[640px]">
        <TableHeader className="bg-secondary/60 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
          <TableRow>
            <TableHead className="px-4 py-3 font-semibold">Venda</TableHead>
            <TableHead className="hidden px-4 py-3 font-semibold md:table-cell">Cliente</TableHead>
            <TableHead className="hidden px-4 py-3 font-semibold sm:table-cell">Data</TableHead>
            <TableHead className="hidden px-4 py-3 font-semibold xl:table-cell">Itens</TableHead>
            <TableHead className="px-4 py-3 font-semibold">Total</TableHead>
            <TableHead className="hidden px-4 py-3 font-semibold lg:table-cell">Pagamento</TableHead>
            <TableHead className="px-4 py-3 font-semibold">Status</TableHead>
            <TableHead className="hidden px-4 py-3 font-semibold xl:table-cell">Responsável</TableHead>
            <TableHead className="hidden px-4 py-3 text-right font-semibold sm:table-cell">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sales.map((sale) => {
            const actions = (
              <>
                <Link
                  href={`/app/vendas/${sale.id}`}
                  className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
                >
                  Ver
                </Link>
                {canCancel(sale, currentRole, currentUserId) && <CancelSaleButton saleId={sale.id} />}
              </>
            );

            return (
              <TableRow key={sale.id} className="hover:bg-secondary/30">
                <TableCell className="px-4 py-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <ListAvatar>
                      <ShoppingCart className="h-4 w-4" strokeWidth={1.75} />
                    </ListAvatar>
                    <div className="min-w-0">
                      <Link
                        href={`/app/vendas/${sale.id}`}
                        className="block truncate font-medium text-foreground underline-offset-4 hover:underline"
                      >
                        {saleNumber(sale.id)}
                      </Link>
                      <span className="block truncate text-xs text-muted-foreground md:hidden">
                        {sale.customer_name ?? "Sem cliente"} · {formatDate(sale.sold_at)}
                      </span>
                      <div className="mt-2 flex flex-wrap items-center gap-2 sm:hidden">{actions}</div>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="hidden px-4 py-3 text-muted-foreground md:table-cell">
                  {sale.customer_name ?? "Sem cliente"}
                </TableCell>
                <TableCell className="hidden px-4 py-3 text-muted-foreground sm:table-cell">
                  {formatDate(sale.sold_at)}
                </TableCell>
                <TableCell className="hidden px-4 py-3 text-muted-foreground xl:table-cell">
                  {sale.item_count ?? 0}
                </TableCell>
                <TableCell className="px-4 py-3 font-medium text-foreground">{formatMoney(sale.total_amount)}</TableCell>
                <TableCell className="hidden px-4 py-3 lg:table-cell">
                  <SalePaymentStatusBadge status={sale.payment_status} />
                </TableCell>
                <TableCell className="px-4 py-3">
                  <SaleStatusBadge status={sale.status} />
                </TableCell>
                <TableCell className="hidden px-4 py-3 text-muted-foreground xl:table-cell">
                  {sale.user_name ?? "—"}
                </TableCell>
                <TableCell className="hidden px-4 py-3 sm:table-cell">
                  <div className="flex items-center justify-end gap-2">{actions}</div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
