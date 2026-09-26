import Link from "next/link";
import type { ServiceWithCategory } from "@/types/service";
import { formatDuration } from "@/types/service";
import { ServiceStatusBadge } from "@/components/app/service-status-badge";
import { DeactivateServiceButton } from "@/components/app/deactivate-service-button";
import { ReactivateServiceButton } from "@/components/app/reactivate-service-button";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";

function formatMoney(value: number): string {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export function ServiceTable({ services }: { services: ServiceWithCategory[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <Table className="w-full min-w-[720px] text-sm">
        <TableHeader className="bg-secondary/50 text-left text-xs uppercase text-muted-foreground">
          <TableRow>
            <TableHead className="px-4 py-3 font-medium">Serviço</TableHead>
            <TableHead className="px-4 py-3 font-medium">Categoria</TableHead>
            <TableHead className="px-4 py-3 font-medium">Preço de venda</TableHead>
            <TableHead className="px-4 py-3 font-medium">Duração</TableHead>
            <TableHead className="px-4 py-3 font-medium">Status</TableHead>
            <TableHead className="px-4 py-3 font-medium">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {services.map((service) => (
            <TableRow key={service.id} className="hover:bg-secondary/30">
              <TableCell className="px-4 py-3 font-medium text-foreground">{service.name}</TableCell>
              <TableCell className="px-4 py-3 text-muted-foreground">
                {service.category_name ?? "—"}
              </TableCell>
              <TableCell className="px-4 py-3 text-muted-foreground">
                {formatMoney(service.sale_price)}
              </TableCell>
              <TableCell className="px-4 py-3 text-muted-foreground">
                {formatDuration(service.duration_minutes)}
              </TableCell>
              <TableCell className="px-4 py-3">
                <ServiceStatusBadge status={service.status} />
              </TableCell>
              <TableCell className="px-4 py-3">
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
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
