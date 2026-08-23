import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DollarSign, TrendingUp, Clock, Tag } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getCurrentCompany } from "@/lib/companies/queries";
import { getServiceById } from "@/lib/services/queries";
import { listAuditLogsForEntity } from "@/lib/audit/queries";
import { calculateMargin, formatDuration } from "@/types/service";
import { ServiceStatusBadge } from "@/components/app/service-status-badge";
import { DeactivateServiceButton } from "@/components/app/deactivate-service-button";
import { ReactivateServiceButton } from "@/components/app/reactivate-service-button";
import { DashboardCard } from "@/components/app/dashboard-card";
import { ServiceHistoryList } from "@/components/app/service-history-list";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = {
  title: "Serviço",
};

function formatMoney(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default async function ServiceDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const current = (await getCurrentCompany())!;

  const service = await getServiceById(current.company.id, params.id);

  if (!service) {
    notFound();
  }

  const auditLogs = await listAuditLogsForEntity(current.company.id, "service", service.id);
  const margin = calculateMargin(service.cost_price, service.sale_price);

  return (
    <div className="flex flex-col gap-6 px-4 py-6 sm:px-6">
      <div>
        <Link
          href="/app/servicos"
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          ← Voltar para Serviços
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{service.name}</h1>
          <ServiceStatusBadge status={service.status} />
        </div>
        <p className="text-sm text-muted-foreground">
          Cadastrado em {formatDate(service.created_at)} · Atualizado em{" "}
          {formatDate(service.updated_at)}
        </p>
      </div>

      <div className="flex gap-3">
        <Link
          href={`/app/servicos/${service.id}/editar`}
          className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
        >
          Editar
        </Link>
        {service.status === "active" ? (
          <DeactivateServiceButton serviceId={service.id} serviceName={service.name} />
        ) : (
          <ReactivateServiceButton serviceId={service.id} serviceName={service.name} />
        )}
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground">Indicadores</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <DashboardCard label="Preço de venda" value={formatMoney(service.sale_price)} icon={DollarSign} />
          <DashboardCard label="Preço de custo" value={formatMoney(service.cost_price)} icon={Tag} />
          <DashboardCard
            label="Margem"
            value={formatMoney(margin.value)}
            icon={TrendingUp}
            hint={margin.percentage === null ? "Sem preço de venda definido" : `${margin.percentage.toFixed(2)}% sobre a venda`}
            indicator={margin.value > 0 ? "success" : margin.value < 0 ? "warning" : "neutral"}
          />
          <DashboardCard label="Duração" value={formatDuration(service.duration_minutes)} icon={Clock} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          <div className="rounded-lg border border-border bg-card p-6">
            <h2 className="text-sm font-semibold text-foreground">Identificação</h2>
            <div className="mt-4 grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs uppercase text-muted-foreground">Categoria</p>
                <p className="text-sm text-foreground">{service.category_name ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs uppercase text-muted-foreground">Duração</p>
                <p className="text-sm text-foreground">{formatDuration(service.duration_minutes)}</p>
              </div>
              {service.description && (
                <div className="col-span-2">
                  <p className="text-xs uppercase text-muted-foreground">Descrição</p>
                  <p className="whitespace-pre-wrap text-sm text-foreground">
                    {service.description}
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card p-6">
            <h2 className="text-sm font-semibold text-foreground">Ordens de serviço</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Histórico de execuções estará disponível quando o módulo de Ordens de
              Serviço for implementado.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div className="rounded-lg border border-border bg-card p-6">
            <h2 className="mb-4 text-sm font-semibold text-foreground">Histórico</h2>
            <ServiceHistoryList logs={auditLogs} />
          </div>
        </div>
      </div>
    </div>
  );
}
