import Link from "next/link";
import type { SaleWithCustomer } from "@/types/sale";
import type { CompanyRole } from "@/types/company";
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
    <div className="overflow-x-auto rounded-lg border border-border">
      <Table className="w-full min-w-[900px] text-sm">
        <TableHeader className="bg-secondary/50 text-left text-xs uppercase text-muted-foreground">
          <TableRow>
            <TableHead className="px-4 py-3 font-medium">Número</TableHead>
            <TableHead className="px-4 py-3 font-medium">Cliente</TableHead>
            <TableHead className="px-4 py-3 font-medium">Data</TableHead>
            <TableHead className="px-4 py-3 font-medium">Itens</TableHead>
            <TableHead className="px-4 py-3 font-medium">Total</TableHead>
            <TableHead className="px-4 py-3 font-medium">Pagamento</TableHead>
            <TableHead className="px-4 py-3 font-medium">Status</TableHead>
            <TableHead className="px-4 py-3 font-medium">Responsável</TableHead>
            <TableHead className="px-4 py-3 font-medium">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sales.map((sale) => (
            <TableRow key={sale.id} className="hover:bg-secondary/30">
              <TableCell className="px-4 py-3 font-medium text-foreground">{saleNumber(sale.id)}</TableCell>
              <TableCell className="px-4 py-3 text-muted-foreground">
                {sale.customer_name ?? "Sem cliente"}
              </TableCell>
              <TableCell className="px-4 py-3 text-muted-foreground">{formatDate(sale.sold_at)}</TableCell>
              <TableCell className="px-4 py-3 text-muted-foreground">{sale.item_count ?? 0}</TableCell>
              <TableCell className="px-4 py-3 text-foreground">{formatMoney(sale.total_amount)}</TableCell>
              <TableCell className="px-4 py-3">
                <SalePaymentStatusBadge status={sale.payment_status} />
              </TableCell>
              <TableCell className="px-4 py-3">
                <SaleStatusBadge status={sale.status} />
              </TableCell>
              <TableCell className="px-4 py-3 text-muted-foreground">{sale.user_name ?? "—"}</TableCell>
              <TableCell className="px-4 py-3">
                <div className="flex items-center gap-3">
                  <Link
                    href={`/app/vendas/${sale.id}`}
                    className="text-sm font-medium underline-offset-4 hover:underline"
                  >
                    Ver
                  </Link>
                  {canCancel(sale, currentRole, currentUserId) && (
                    <CancelSaleButton saleId={sale.id} />
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
