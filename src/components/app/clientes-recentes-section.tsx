import { Users } from "lucide-react";
import { getRecentCustomers } from "@/lib/customers/queries";
import { RecentCustomers } from "@/components/app/recent-customers";
import { EmptyState } from "@/components/app/empty-state";

export async function ClientesRecentesSection({
  companyId,
}: {
  companyId: string;
}) {
  const customers = await getRecentCustomers(companyId, 5);

  if (customers.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title="Você ainda não possui clientes."
        description="Cadastre o primeiro cliente para começar a usar o Prime Ges."
        actionLabel="Adicionar primeiro cliente"
        actionHref="/app/clientes/novo"
      />
    );
  }

  return <RecentCustomers customers={customers} />;
}
