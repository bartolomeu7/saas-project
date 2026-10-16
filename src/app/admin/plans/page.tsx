import Link from "next/link";
import { Eye, Layers, Pencil, Plus } from "lucide-react";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listPlatformPlans, requirePlatformAdmin } from "@/lib/admin/queries";
import { formatDateTime } from "@/lib/format";
import { formatPlanPrice } from "@/lib/billing/pricing-display";
import { cn } from "@/lib/utils";
import type { PlatformPlanRow } from "@/types/admin";
import { PlanStatusControl } from "./plan-status-control";

export const metadata = { title: "Planos" };

const KIND_LABELS: Record<PlatformPlanRow["kind"], string> = {
  standard: "Padrão",
  trial: "Teste grátis",
  custom: "Personalizado",
  lifetime: "Vitalício",
};

const PROMO_LABELS: Record<PlatformPlanRow["promo_state"], string> = {
  none: "",
  scheduled: "agendada",
  active: "em vigor",
  expired: "encerrada",
};

function priceCell(plan: PlatformPlanRow) {
  if (plan.kind === "lifetime") return <span className="text-muted-foreground">Não vendido</span>;
  if (plan.price === null) return <span className="text-muted-foreground">Sob consulta</span>;
  if (plan.price === 0) return <span>Grátis</span>;
  return (
    <span className="flex flex-col">
      <span className="font-medium tabular-nums">{formatPlanPrice(plan.price)}</span>
      {plan.compare_price !== null && (
        <span className="text-xs text-muted-foreground">
          <s className="tabular-nums">{formatPlanPrice(plan.compare_price)}</s>
          {plan.discount_percent !== null && ` · −${plan.discount_percent.toLocaleString("pt-BR", { minimumFractionDigits: 1 })}%`}
        </span>
      )}
    </span>
  );
}

function durationCell(plan: PlatformPlanRow) {
  if (plan.kind === "lifetime") return "Sem vencimento";
  if (plan.access_duration_days === null) return "Sob consulta";
  return `${plan.access_duration_days} ${plan.access_duration_days === 1 ? "dia" : "dias"}`;
}

/**
 * Catálogo de planos do admin. Leitura via list_platform_plans() (admin e super_admin). Criar, editar, ativar/desativar
 * e ajustar preços/promoções/limites são SUPER_ADMIN ONLY (RPC revalida no banco, valida faixas e audita). Planos nunca
 * são excluídos — só desativados — para preservar assinaturas, cobranças e histórico financeiro.
 */
export default async function AdminPlansPage() {
  const admin = await requirePlatformAdmin();
  const plans = await listPlatformPlans();
  const isSuper = admin.role === "super_admin";

  return (
    <div className="flex flex-col gap-6 px-4 py-6 sm:px-6">
      <PageHeader
        eyebrow="Gestão"
        title="Planos"
        description="Catálogo comercial do Prime Ges: preço, desconto, duração, limites de usuários e benefícios. O site público lê esta mesma fonte."
        actions={
          isSuper ? (
            <Link href="/admin/plans/new" className={cn(buttonVariants({ size: "sm" }))}>
              <Plus className="mr-1 size-4" /> Novo plano
            </Link>
          ) : undefined
        }
      />

      {plans.length === 0 ? (
        <EmptyState icon={Layers} title="Nenhum plano encontrado" description="Não há planos cadastrados." />
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Plano</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead>Preço</TableHead>
                <TableHead>Duração</TableHead>
                <TableHead className="text-right">Usuários</TableHead>
                <TableHead className="text-right">Assinaturas</TableHead>
                <TableHead>Alterado em</TableHead>
                <TableHead>Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {plans.map((plan) => (
                <TableRow key={plan.plan_id}>
                  <TableCell>
                    <div className="flex min-w-[10rem] flex-col">
                      <span className="flex items-center gap-2 font-medium text-foreground">
                        {plan.name}
                        <Badge variant={plan.kind === "standard" ? "muted" : "info"}>{KIND_LABELS[plan.kind]}</Badge>
                      </span>
                      <span className="font-mono text-xs text-muted-foreground">
                        {plan.code} · ordem {plan.sort_order}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col items-start gap-1">
                      <Badge variant={plan.status === "active" ? "success" : "muted"}>{plan.status === "active" ? "Ativo" : "Inativo"}</Badge>
                      {plan.kind !== "lifetime" && (
                        <span className="text-xs text-muted-foreground">{plan.public_visible ? "Visível no site" : "Oculto no site"}</span>
                      )}
                      {plan.promo_state !== "none" && (
                        <span className="text-xs text-muted-foreground">Promoção {PROMO_LABELS[plan.promo_state]}</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{priceCell(plan)}</TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">{durationCell(plan)}</TableCell>
                  <TableCell className="whitespace-nowrap text-right tabular-nums">
                    {plan.additional_user_limit + 1}
                    <span className="block text-xs text-muted-foreground">{plan.additional_user_limit} adicional(is)</span>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right tabular-nums">
                    {plan.subscriptions_count}
                    <span className="block text-xs text-muted-foreground">
                      {plan.active_subscriptions_count} ativa(s) · {plan.payments_count} pgto(s)
                    </span>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{formatDateTime(plan.updated_at)}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-3">
                      <Link href={`/admin/plans/${plan.plan_id}`} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                        {isSuper ? <Pencil className="size-3.5" /> : <Eye className="size-3.5" />}
                        {isSuper ? "Editar" : "Ver"}
                      </Link>
                      {isSuper && plan.kind !== "lifetime" && (
                        <PlanStatusControl
                          planId={plan.plan_id}
                          planName={plan.name}
                          active={plan.status === "active"}
                          isProtected={plan.is_protected}
                          activeSubscriptions={plan.active_subscriptions_count}
                        />
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
