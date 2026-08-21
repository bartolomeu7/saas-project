import Link from "next/link";
import type { Customer } from "@/types/customer";
import { formatDate } from "@/lib/format";
import { CustomerStatusBadge } from "@/components/app/customer-status-badge";
import { DeactivateCustomerButton } from "@/components/app/deactivate-customer-button";

export function CustomerTable({ customers }: { customers: Customer[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="bg-secondary/50 text-left text-xs uppercase text-muted-foreground">
          <tr>
            <th className="px-4 py-3 font-medium">Nome</th>
            <th className="px-4 py-3 font-medium">Telefone</th>
            <th className="px-4 py-3 font-medium">Email</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium">Cadastro</th>
            <th className="px-4 py-3 font-medium">Ações</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {customers.map((customer) => (
            <tr key={customer.id} className="hover:bg-secondary/30">
              <td className="px-4 py-3 font-medium">{customer.name}</td>
              <td className="px-4 py-3 text-muted-foreground">
                {customer.phone ?? "—"}
              </td>
              <td className="px-4 py-3 text-muted-foreground">
                {customer.email ?? "—"}
              </td>
              <td className="px-4 py-3">
                <CustomerStatusBadge status={customer.status} />
              </td>
              <td className="px-4 py-3 text-muted-foreground">
                {formatDate(customer.created_at)}
              </td>
              <td className="px-4 py-3">
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
                  {customer.status === "active" && (
                    <DeactivateCustomerButton
                      customerId={customer.id}
                      customerName={customer.name}
                    />
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
