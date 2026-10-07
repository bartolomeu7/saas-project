import Link from "next/link";
import type { Customer } from "@/types/customer";
import { formatDate } from "@/lib/format";
import { CustomerStatusBadge } from "@/components/app/customer-status-badge";
import { DeactivateCustomerButton } from "@/components/app/deactivate-customer-button";
import { ReactivateCustomerButton } from "@/components/app/reactivate-customer-button";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";

export function CustomerTable({ customers }: { customers: Customer[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <Table className="w-full min-w-[640px] text-sm">
        <TableHeader className="bg-secondary/50 text-left text-xs uppercase text-muted-foreground">
          <TableRow>
            <TableHead className="px-4 py-3 font-medium">Nome</TableHead>
            <TableHead className="px-4 py-3 font-medium">Telefone</TableHead>
            <TableHead className="px-4 py-3 font-medium">Email</TableHead>
            <TableHead className="px-4 py-3 font-medium">Status</TableHead>
            <TableHead className="px-4 py-3 font-medium">Cadastro</TableHead>
            <TableHead className="px-4 py-3 font-medium">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {customers.map((customer) => (
            <TableRow key={customer.id} className="hover:bg-secondary/30">
              <TableCell className="px-4 py-3 font-medium">{customer.name}</TableCell>
              <TableCell className="px-4 py-3 text-muted-foreground">
                {customer.phone ?? "—"}
              </TableCell>
              <TableCell className="px-4 py-3 text-muted-foreground">
                {customer.email ?? "—"}
              </TableCell>
              <TableCell className="px-4 py-3">
                <CustomerStatusBadge status={customer.status} />
              </TableCell>
              <TableCell className="px-4 py-3 text-muted-foreground">
                {formatDate(customer.created_at)}
              </TableCell>
              <TableCell className="px-4 py-3">
                <div className="flex items-center gap-3">
                  <Link
                    href={`/app/clientes/${customer.id}`}
                    className="text-sm font-medium underline-offset-4 hover:underline"
                  >
                    Ver
                  </Link>
                  <Link
                    href={`/app/clientes/${customer.id}/editar`}
                    className="text-sm font-medium underline-offset-4 hover:underline"
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
