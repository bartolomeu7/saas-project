import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { AdminActionDialog } from "@/components/admin/admin-action-dialog";
import { CompanyStatusBadge, PresenceBadge, UserRoleBadge, UserStatusBadge } from "@/components/admin/admin-badges";
import { AuditCard, DetailRow, PaymentsCard, SubscriptionCard } from "@/components/admin/admin-detail-parts";
import { CompanyAccessActions } from "@/components/admin/company-access-actions";
import { PageHeader } from "@/components/app/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { setCompanyStatusAction, updateCompanyAction } from "@/lib/admin/actions";
import { parseUuid } from "@/lib/admin/params";
import { getAccessActionContext, getPlatformCompanyDetail, requirePlatformAdmin } from "@/lib/admin/queries";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { COMPANY_ROLE_LABELS } from "@/types/admin";
import { BUSINESS_TYPE_LABELS, type BusinessType } from "@/types/company";
import { CompanyStatusControl } from "./status-control";

export const metadata = { title: "Empresa" };

/**
 * Detalhe de uma empresa (visão da PLATAFORMA). Leitura via get_platform_company_detail():
 * contagens de uso vêm das tabelas do próprio tenant, mas SOMENTE agregadas — nenhum
 * dado de cliente/venda/produto individual é exposto, e nada aqui altera dados do
 * tenant (multi-tenancy preservada). Edição de nome/tipo e operações de cobrança
 * passam por RPCs com auditoria; ativar/inativar é exclusivo de super_admin.
 */
export default async function AdminCompanyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await requirePlatformAdmin();
  const companyId = parseUuid((await params).id);
  if (!companyId) notFound();

  const detail = await getPlatformCompanyDetail(companyId);
  if (!detail) notFound();

  const { company, members, subscription, usage } = detail;
  const { plans, maxFreeDays } = await getAccessActionContext();
  const isSuper = admin.role === "super_admin";

  return (
    <div className="flex flex-col gap-6 px-4 py-6 sm:px-6">
      <PageHeader
        eyebrow="Gestão"
        title={company.name}
        description={`${BUSINESS_TYPE_LABELS[company.business_type]} · criada em ${formatDate(company.created_at)}`}
        actions={
          <Link href="/admin/companies" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "gap-1.5")}>
            <ArrowLeft className="size-4" strokeWidth={1.75} /> Empresas
          </Link>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Dados da empresa</CardTitle>
            <CardDescription>Cadastro e situação.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <dl className="flex flex-col gap-2">
              <DetailRow label="Nome">{company.name}</DetailRow>
              <DetailRow label="Tipo de negócio">{BUSINESS_TYPE_LABELS[company.business_type]}</DetailRow>
              <DetailRow label="Status">
                <CompanyStatusBadge status={company.status} />
              </DetailRow>
              <DetailRow label="Receita paga (total)">{formatCurrency(detail.paid_total)}</DetailRow>
            </dl>
            <div className="flex flex-wrap items-start gap-3">
              <AdminActionDialog
                triggerLabel="Editar empresa"
                title="Editar empresa"
                description="Altera apenas nome e tipo de negócio. Membros e dados do tenant não são afetados."
                submitLabel="Salvar"
                action={updateCompanyAction.bind(null, company.id)}
                fields={[
                  { type: "text", name: "name", label: "Nome", required: true, maxLength: 120, defaultValue: company.name },
                  {
                    type: "select",
                    name: "businessType",
                    label: "Tipo de negócio",
                    required: true,
                    defaultValue: company.business_type,
                    options: (Object.keys(BUSINESS_TYPE_LABELS) as BusinessType[]).map((value) => ({
                      value,
                      label: BUSINESS_TYPE_LABELS[value],
                    })),
                  },
                ]}
              />
              {isSuper && (
                <CompanyStatusControl
                  companyId={company.id}
                  companyName={company.name}
                  status={company.status}
                />
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Uso do produto</CardTitle>
            <CardDescription>Contagens agregadas (sem dados individuais do tenant).</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="flex flex-col gap-2">
              <DetailRow label="Clientes">{usage.customers}</DetailRow>
              <DetailRow label="Produtos">{usage.products}</DetailRow>
              <DetailRow label="Serviços">{usage.services}</DetailRow>
              <DetailRow label="Agendamentos">{usage.appointments}</DetailRow>
              <DetailRow label="Vendas (total)">{usage.sales_total}</DetailRow>
              <DetailRow label="Vendas (30 dias)">{usage.sales_last_30d}</DetailRow>
              <DetailRow label="Última venda">{usage.last_sale_at ? formatDateTime(usage.last_sale_at) : "Nenhuma"}</DetailRow>
            </dl>
          </CardContent>
        </Card>
      </div>

      <SubscriptionCard
        subscription={subscription}
        action={
          <CompanyAccessActions
            companyId={company.id}
            plans={plans}
            currentPlanId={subscription?.plan.id ?? null}
            hasSubscription={Boolean(subscription)}
            subscriptionStatus={subscription?.status ?? null}
            accessActive={subscription?.access_active ?? false}
            isSuperAdmin={isSuper}
            maxFreeDays={maxFreeDays}
          />
        }
      />

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle className="text-base">Equipe</CardTitle>
          <CardDescription>Membros da empresa e seus papéis.</CardDescription>
        </CardHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Membro</TableHead>
              <TableHead>Função</TableHead>
              <TableHead>Papel na plataforma</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Presença</TableHead>
              <TableHead>Entrou em</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((member) => (
              <TableRow key={member.user_id}>
                <TableCell>
                  <Link href={`/admin/users/${member.user_id}`} className="flex min-w-[10rem] flex-col underline-offset-4 hover:underline">
                    <span className="font-medium text-foreground">{member.full_name ?? "Sem nome"}</span>
                    <span className="text-xs text-muted-foreground">{member.email ?? "Sem e-mail"}</span>
                  </Link>
                </TableCell>
                <TableCell>{COMPANY_ROLE_LABELS[member.company_role]}</TableCell>
                <TableCell>
                  <UserRoleBadge role={member.platform_role} />
                </TableCell>
                <TableCell>
                  <UserStatusBadge status={member.user_status} />
                </TableCell>
                <TableCell>
                  <PresenceBadge presence={member.presence} />
                </TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">{formatDate(member.joined_at)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <PaymentsCard payments={detail.payments} />
      <AuditCard entries={detail.audit} title="Histórico administrativo da empresa" />
    </div>
  );
}
