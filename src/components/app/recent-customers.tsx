import Link from "next/link";
import type { Customer } from "@/types/customer";
import { formatDate } from "@/lib/format";
import { CustomerStatusBadge } from "@/components/app/customer-status-badge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";

function initialsFrom(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "")).toUpperCase();
}

export function RecentCustomers({ customers }: { customers: Customer[] }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <Table className="w-full text-sm">
        <TableHeader className="bg-secondary/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
          <TableRow>
            <TableHead className="px-4 py-3 font-medium">Nome</TableHead>
            <TableHead className="hidden px-4 py-3 font-medium sm:table-cell">
              Telefone
            </TableHead>
            <TableHead className="hidden px-4 py-3 font-medium sm:table-cell">
              Cadastro
            </TableHead>
            <TableHead className="px-4 py-3 font-medium">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {customers.map((customer) => (
            <TableRow key={customer.id} className="transition-colors hover:bg-secondary/30">
              <TableCell className="px-4 py-3">
                <Link
                  href={`/app/clientes/${customer.id}`}
                  className="flex items-center gap-3"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
                    {initialsFrom(customer.name)}
                  </span>
                  <span className="font-medium text-foreground underline-offset-4 hover:underline">
                    {customer.name}
                  </span>
                </Link>
              </TableCell>
              <TableCell className="hidden px-4 py-3 text-muted-foreground sm:table-cell">
                {customer.phone ?? "—"}
              </TableCell>
              <TableCell className="hidden px-4 py-3 text-muted-foreground sm:table-cell">
                {formatDate(customer.created_at)}
              </TableCell>
              <TableCell className="px-4 py-3">
                <CustomerStatusBadge status={customer.status} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
