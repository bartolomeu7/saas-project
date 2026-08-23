import Link from "next/link";
import type { Customer } from "@/types/customer";
import { formatDate } from "@/lib/format";
import { CustomerStatusBadge } from "@/components/app/customer-status-badge";

function initialsFrom(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "")).toUpperCase();
}

export function RecentCustomers({ customers }: { customers: Customer[] }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead className="bg-secondary/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-4 py-3 font-medium">Nome</th>
            <th className="hidden px-4 py-3 font-medium sm:table-cell">
              Telefone
            </th>
            <th className="hidden px-4 py-3 font-medium sm:table-cell">
              Cadastro
            </th>
            <th className="px-4 py-3 font-medium">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {customers.map((customer) => (
            <tr key={customer.id} className="transition-colors hover:bg-secondary/30">
              <td className="px-4 py-3">
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
              </td>
              <td className="hidden px-4 py-3 text-muted-foreground sm:table-cell">
                {customer.phone ?? "—"}
              </td>
              <td className="hidden px-4 py-3 text-muted-foreground sm:table-cell">
                {formatDate(customer.created_at)}
              </td>
              <td className="px-4 py-3">
                <CustomerStatusBadge status={customer.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
