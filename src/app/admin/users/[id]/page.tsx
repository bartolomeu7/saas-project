import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { AdminActionDialog } from "@/components/admin/admin-action-dialog";
import { PresenceBadge, UserRoleBadge, UserStatusBadge } from "@/components/admin/admin-badges";
import { AdminUserActions } from "@/components/admin/admin-user-actions";
import { AuditCard, DetailRow, PaymentsCard, SubscriptionCard } from "@/components/admin/admin-detail-parts";
import { CompanyAccessActions } from "@/components/admin/company-access-actions";
import { PageHeader } from "@/components/app/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { updateUserProfileAction } from "@/lib/admin/actions";
import { parseUuid } from "@/lib/admin/params";
import { getAccessActionContext, getPlatformUserDetail, requirePlatformAdmin } from "@/lib/admin/queries";
import { formatDate, formatDateTime, formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import { COMPANY_ROLE_LABELS } from "@/types/admin";

export const metadata = { title: "Usuário" };

/**
 * Detalhe de um usuário. Tudo vem de get_platform_user_detail() (SECURITY DEFINER
 * + is_platform_admin()): o clerk_user_id só é devolvido ao super_admin e o
 * histórico administrativo de um admin comum mostra apenas as próprias ações
 * (mesma regra da RLS de audit_logs). As operações de acesso/cobrança agem na
 * empresa do usuário e são revalidadas pelas RPCs.
 */
export default async function AdminUserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await requirePlatformAdmin();
  const userId = parseUuid((await params).id);
  if (!userId) notFound();

  const detail = await getPlatformUserDetail(userId);
  if (!detail) notFound();

  const { profile, company, subscription } = detail;
  const { plans, maxFreeDays } = await getAccessActionContext();
  const displayName = profile.full_name ?? profile.email ?? "Usuário";
  const canEditName = admin.role === "super_admin" || profile.user_id === admin.userId || profile.role === "user";

  return (
    <div className="flex flex-col gap-6 px-4 py-6 sm:px-6">
      <PageHeader
        eyebrow="Gestão"
        title={displayName}
        description={profile.email ?? "Sem e-mail"}
        actions={
          <Link href="/admin/users" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "gap-1.5")}>
            <ArrowLeft className="size-4" strokeWidth={1.75} /> Usuários
          </Link>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Perfil</CardTitle>
            <CardDescription>Identidade pelo Clerk; papel e status pelo banco.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <dl className="flex flex-col gap-2">
              <DetailRow label="Nome">{profile.full_name ?? "Sem nome"}</DetailRow>
              <DetailRow label="E-mail">{profile.email ?? "—"}</DetailRow>
              <DetailRow label="Papel">
                <UserRoleBadge role={profile.role} />
              </DetailRow>
              <DetailRow label="Status">
                <UserStatusBadge status={profile.status} />
              </DetailRow>
              <DetailRow label="Presença">
                <span className="inline-flex flex-wrap items-center justify-end gap-2">
                  <PresenceBadge presence={profile.presence} />
                  {profile.last_seen_at && (
                    <span className="text-xs text-muted-foreground">{formatRelative(profile.last_seen_at)}</span>
                  )}
                </span>
              </DetailRow>
              <DetailRow label="Cadastro">{formatDate(profile.created_at)}</DetailRow>
              <DetailRow label="Atualizado em">{formatDateTime(profile.updated_at)}</DetailRow>
              <DetailRow label="Login (Clerk)">
                {profile.clerk_linked ? (
                  profile.clerk_user_id ? (
                    <code className="text-xs">{profile.clerk_user_id}</code>
                  ) : (
                    "Vinculado"
                  )
                ) : (
                  <span className="text-warning">Sem vínculo (será ligado no primeiro login)</span>
                )}
              </DetailRow>
            </dl>

            <div className="flex flex-wrap items-start gap-3">
              {canEditName && (
                <AdminActionDialog
                  triggerLabel="Editar nome"
                  title="Editar nome"
                  description="E-mail e vínculo de login pertencem ao Clerk e não são editados aqui."
                  submitLabel="Salvar"
                  action={updateUserProfileAction.bind(null, profile.user_id)}
                  fields={[
                    {
                      type: "text",
                      name: "fullName",
                      label: "Nome completo",
                      required: true,
                      maxLength: 160,
                      defaultValue: profile.full_name ?? "",
                    },
                  ]}
                />
              )}
              <AdminUserActions
                userId={profile.user_id}
                userName={displayName}
                targetRole={profile.role}
                targetStatus={profile.status}
                actorRole={admin.role}
                isSelf={profile.user_id === admin.userId}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Empresa</CardTitle>
            <CardDescription>Primeira empresa a que o usuário pertence.</CardDescription>
          </CardHeader>
          <CardContent>
            {company ? (
              <dl className="flex flex-col gap-2">
                <DetailRow label="Nome">
                  <Link href={`/admin/companies/${company.id}`} className="underline-offset-4 hover:underline">
                    {company.name}
                  </Link>
                </DetailRow>
                <DetailRow label="Função">{COMPANY_ROLE_LABELS[company.member_role]}</DetailRow>
                <DetailRow label="Status">{company.status === "active" ? "Ativa" : "Inativa"}</DetailRow>
                <DetailRow label="Criada em">{formatDate(company.created_at)}</DetailRow>
              </dl>
            ) : (
              <p className="text-sm text-muted-foreground">
                Este usuário ainda não tem empresa (não concluiu o onboarding). Sem empresa não há assinatura a operar.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {company && (
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
              isSuperAdmin={admin.role === "super_admin"}
              maxFreeDays={maxFreeDays}
            />
          }
        />
      )}

      {company && <PaymentsCard payments={detail.payments} />}
      <AuditCard entries={detail.audit} />
    </div>
  );
}
