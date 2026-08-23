import { Users } from "lucide-react";
import { getCustomerStats } from "@/lib/customers/queries";
import { DashboardCard } from "@/components/app/dashboard-card";

export async function ClientesCadastradosCard({
  companyId,
}: {
  companyId: string;
}) {
  const stats = await getCustomerStats(companyId);

  return (
    <DashboardCard
      label="Clientes cadastrados"
      value={stats.total}
      icon={Users}
      hint={
        stats.recent > 0
          ? `+${stats.recent} nos últimos 7 dias`
          : "Nenhum cadastro novo esta semana."
      }
      indicator={stats.recent > 0 ? "success" : "neutral"}
    />
  );
}
