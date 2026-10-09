import type { Metadata } from "next";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getCurrentCompany } from "@/lib/companies/queries";
import { daysUntilExpiry, isSubscriptionAccessActive } from "@/lib/billing/access";
import {
  getCurrentSubscription,
  getPlanById,
  getSubscriptionPayments,
} from "@/lib/billing/queries";
import { SubscriptionStatusBadge } from "@/components/app/subscription-status-badge";
import { SubscriptionPaymentStatusBadge } from "@/components/app/subscription-payment-status-badge";

export const metadata: Metadata = {
  title: "Assinatura",
};

export default async function SubscriptionPage() {
  const current = (await getCurrentCompany())!;
  const companyId = current.company.id;

  const subscription = await getCurrentSubscription(companyId);
  const plan = subscription ? await getPlanById(subscription.plan_id) : null;
  const payments = await getSubscriptionPayments(companyId);
  const lastPayment = payments[0] ?? null;

  const isLifetime = subscription?.lifetime === true;
  const isExpired = !isSubscriptionAccessActive(subscription);

  return (
    <div className="flex flex-col gap-6 px-4 py-6 sm:px-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Assinatura</h1>
        <p className="text-sm text-muted-foreground">
          Gerencie o plano e os pagamentos do Prime Ges.
        </p>
      </div>

      <div className="rounded-lg border border-border bg-card p-6 shadow-soft">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm text-muted-foreground">Plano atual</p>
            <p className="text-xl font-semibold text-foreground">
              {plan?.name ?? "Nenhum plano ativo"}
            </p>
          </div>
          {subscription && <SubscriptionStatusBadge status={subscription.status} />}
        </div>

        {subscription && (
          <dl className="mt-4 grid grid-cols-1 gap-4 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-muted-foreground">Válido até</dt>
              <dd className="font-medium text-foreground">
                {isLifetime || !subscription.expires_at
                  ? "Sem vencimento"
                  : new Date(subscription.expires_at).toLocaleDateString("pt-BR")}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Dias restantes</dt>
              <dd className="font-medium text-foreground">
                {isExpired ? (isLifetime ? "Acesso suspenso" : "Expirado") : isLifetime ? "Vitalício" : `${daysUntilExpiry(subscription) ?? 0} dias`}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Usuários adicionais permitidos</dt>
              <dd className="font-medium text-foreground">{plan?.additional_user_limit ?? 0}</dd>
            </div>
          </dl>
        )}

        {isLifetime && !isExpired && (
          <p className="mt-4 rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
            Seu acesso é vitalício: não há vencimento nem renovação a fazer.
          </p>
        )}

        {isExpired && !isLifetime && (
          <p className="mt-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {subscription?.status === "trialing" || !subscription
              ? "Seu período de teste acabou. Escolha um plano para continuar usando o Prime Ges."
              : "Sua assinatura expirou. Renove para voltar a acessar o sistema."}
          </p>
        )}

        <div className="mt-6 flex flex-wrap gap-2">
          {!(isLifetime && !isExpired) && (
            <Link href="/app/assinatura/planos" className={cn(buttonVariants())}>
              {isExpired ? "Ver planos e renovar" : "Trocar de plano"}
            </Link>
          )}
          <Link
            href="/app/assinatura/historico"
            className={cn(buttonVariants({ variant: "outline" }))}
          >
            Ver histórico de pagamentos
          </Link>
        </div>
      </div>

      {lastPayment && (
        <div className="rounded-lg border border-border bg-card p-6 shadow-soft">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Última cobrança</p>
              <p className="font-medium text-foreground">{lastPayment.plan_name}</p>
            </div>
            <SubscriptionPaymentStatusBadge status={lastPayment.status} />
          </div>
          {lastPayment.status === "pending" && (
            <Link
              href={`/app/assinatura/pagamento/${lastPayment.id}`}
              className={cn(buttonVariants({ variant: "outline", size: "sm" }), "mt-3")}
            >
              Continuar pagamento
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
