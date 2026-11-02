import Link from "next/link";
import type { Customer } from "@/types/customer";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { CustomerStatusBadge } from "@/components/app/customer-status-badge";
import { DeactivateCustomerButton } from "@/components/app/deactivate-customer-button";
import { ReactivateCustomerButton } from "@/components/app/reactivate-customer-button";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";

/**
 * Tabela de clientes (visual de "data table" do Kiranism/shadcn): avatar com a inicial, nome com o contato abaixo no
 * celular, colunas extras só quando cabem e ações agrupadas à direita. Mesmos dados, links e botões de antes.
 */
export function CustomerTable({ customers }: { customers: Customer[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card/40">
      <Table className="w-full min-w-[560px] text-sm">
        <TableHeader className="bg-secondary/60 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
          <TableRow>
            <TableHead className="px-4 py-3 font-semibold">Cliente</TableHead>
            <TableHead className="hidden px-4 py-3 font-semibold md:table-cell">Telefone</TableHead>
            <TableHead className="hidden px-4 py-3 font-semibold lg:table-cell">E-mail</TableHead>
            <TableHead className="px-4 py-3 font-semibold">Status</TableHead>
            <TableHead className="hidden px-4 py-3 font-semibold sm:table-cell">Cadastro</TableHead>
            <TableHead className="px-4 py-3 text-right font-semibold">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {customers.map((customer) => (
            <TableRow key={customer.id} className="hover:bg-secondary/30">
              <TableCell className="px-4 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold text-primary-text"
                    aria-hidden="true"
                  >
                    {customer.name.trim().slice(0, 1).toUpperCase()}
                  </span>
                  <div className="min-w-0">
                    <Link
                      href={`/app/clientes/${customer.id}`}
                      className="block truncate font-medium text-foreground underline-offset-4 hover:underline"
                    >
                      {customer.name}
                    </Link>
                    <span className="block truncate text-xs text-muted-foreground lg:hidden">
                      {customer.phone ?? customer.email ?? "Sem contato"}
                    </span>
                  </div>
                </div>
              </TableCell>
              <TableCell className="hidden px-4 py-3 text-muted-foreground md:table-cell">
                {customer.phone ?? "—"}
              </TableCell>
              <TableCell className="hidden px-4 py-3 text-muted-foreground lg:table-cell">
                {customer.email ?? "—"}
              </TableCell>
              <TableCell className="px-4 py-3">
                <CustomerStatusBadge status={customer.status} />
              </TableCell>
              <TableCell className="hidden px-4 py-3 text-muted-foreground sm:table-cell">
                {formatDate(customer.created_at)}
              </TableCell>
              <TableCell className="px-4 py-3">
                <div className="flex items-center justify-end gap-2">
                  <Link
                    href={`/app/clientes/${customer.id}`}
                    className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
                  >
                    Ver
                  </Link>
                  <Link
                    href={`/app/clientes/${customer.id}/editar`}
                    className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
                  >
                    Editar
                  </Link>
                  {customer.status === "active" ? (
                    <DeactivateCustomerButton
                      customerId={customer.id}
                      customerName={customer.name}
                    />
                  ) : (
                    <ReactivateCustomerButton
                      customerId={customer.id}
                      customerName={customer.name}
                    />
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
