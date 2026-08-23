import Link from "next/link";
import type { ServiceWithCategory } from "@/types/service";
import { formatDuration } from "@/types/service";
import { ServiceStatusBadge } from "@/components/app/service-status-badge";
import { DeactivateServiceButton } from "@/components/app/deactivate-service-button";
import { ReactivateServiceButton } from "@/components/app/reactivate-service-button";

function formatMoney(value: number): string {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export function ServiceTable({ services }: { services: ServiceWithCategory[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[720px] text-sm">
        <thead className="bg-secondary/50 text-left text-xs uppercase text-muted-foreground">
          <tr>
            <th className="px-4 py-3 font-medium">Serviço</th>
            <th className="px-4 py-3 font-medium">Categoria</th>
            <th className="px-4 py-3 font-medium">Preço de venda</th>
            <th className="px-4 py-3 font-medium">Duração</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium">Ações</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {services.map((service) => (
            <tr key={service.id} className="hover:bg-secondary/30">
              <td className="px-4 py-3 font-medium text-foreground">{service.name}</td>
              <td className="px-4 py-3 text-muted-foreground">
                {service.category_name ?? "—"}
              </td>
              <td className="px-4 py-3 text-muted-foreground">
                {formatMoney(service.sale_price)}
              </td>
              <td className="px-4 py-3 text-muted-foreground">
                {formatDuration(service.duration_minutes)}
              </td>
              <td className="px-4 py-3">
                <ServiceStatusBadge status={service.status} />
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-3">
                  <Link
                    href={`/app/servicos/${service.id}`}
                    className="text-sm font-medium underline-offset-4 hover:underline"
                  >
                    Ver
                  </Link>
                  <Link
                    href={`/app/servicos/${service.id}/editar`}
                    className="text-sm font-medium underline-offset-4 hover:underline"
                  >
                    Editar
                  </Link>
                  {service.status === "active" ? (
                    <DeactivateServiceButton
                      serviceId={service.id}
                      serviceName={service.name}
                    />
                  ) : (
                    <ReactivateServiceButton
                      serviceId={service.id}
                      serviceName={service.name}
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
