import Link from "next/link";
import { Wrench } from "lucide-react";
import type { ServiceWithCategory } from "@/types/service";
import { formatDuration } from "@/types/service";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { ListAvatar } from "@/components/app/list-toolbar";
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

/**
 * Tabela de serviços no visual de "data table" (mesmo padrão de Clientes e Produtos): avatar, colunas extras só
 * quando cabem e, no celular, ações abaixo do nome. Mesmos dados, links e botões de antes.
 */
export function ServiceTable({ services }: { services: ServiceWithCategory[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card/40">
      <Table className="w-full text-sm sm:min-w-[600px]">
        <TableHeader className="bg-secondary/60 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
          <TableRow>
            <TableHead className="px-4 py-3 font-semibold">Serviço</TableHead>
            <TableHead className="hidden px-4 py-3 font-semibold md:table-cell">Categoria</TableHead>
            <TableHead className="hidden px-4 py-3 font-semibold sm:table-cell">Preço de venda</TableHead>
            <TableHead className="hidden px-4 py-3 font-semibold md:table-cell">Duração</TableHead>
            <TableHead className="px-4 py-3 font-semibold">Status</TableHead>
            <TableHead className="hidden px-4 py-3 text-right font-semibold sm:table-cell">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {services.map((service) => {
            const actions = (
              <>
                <Link
                  href={`/app/servicos/${service.id}`}
                  className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
                >
                  Ver
                </Link>
                <Link
                  href={`/app/servicos/${service.id}/editar`}
                  className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
                >
                  Editar
                </Link>
                {service.status === "active" ? (
                  <DeactivateServiceButton serviceId={service.id} serviceName={service.name} />
                ) : (
                  <ReactivateServiceButton serviceId={service.id} serviceName={service.name} />
                )}
              </>
            );

            return (
              <TableRow key={service.id} className="hover:bg-secondary/30">
                <TableCell className="px-4 py-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <ListAvatar>
                      <Wrench className="h-4 w-4" strokeWidth={1.75} />
                    </ListAvatar>
                    <div className="min-w-0">
                      <Link
                        href={`/app/servicos/${service.id}`}
                        className="block truncate font-medium text-foreground underline-offset-4 hover:underline"
                      >
                        {service.name}
                      </Link>
                      <span className="mt-0.5 block text-xs text-muted-foreground sm:hidden">
                        {formatMoney(service.sale_price)} · {formatDuration(service.duration_minutes)}
                      </span>
                      <div className="mt-2 flex flex-wrap items-center gap-2 sm:hidden">{actions}</div>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="hidden px-4 py-3 text-muted-foreground md:table-cell">
                  {service.category_name ?? "—"}
                </TableCell>
                <TableCell className="hidden px-4 py-3 text-foreground sm:table-cell">
                  {formatMoney(service.sale_price)}
                </TableCell>
                <TableCell className="hidden px-4 py-3 text-muted-foreground md:table-cell">
                  {formatDuration(service.duration_minutes)}
                </TableCell>
                <TableCell className="px-4 py-3">
                  <ServiceStatusBadge status={service.status} />
                </TableCell>
                <TableCell className="hidden px-4 py-3 sm:table-cell">
                  <div className="flex items-center justify-end gap-2">{actions}</div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
