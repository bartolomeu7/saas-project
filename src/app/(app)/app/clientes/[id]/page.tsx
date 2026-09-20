import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ShoppingCart, Wrench, Wallet } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getCurrentCompany } from "@/lib/companies/queries";
import { getCustomerById } from "@/lib/customers/queries";
import {
  getCustomerSalesStats,
  getCustomerTopProducts,
  listSalesByCustomer,
} from "@/lib/sales/queries";
import { getCustomerRevenueRank } from "@/lib/customers/ranking";
import { classifyCustomer } from "@/lib/customers/classification";
import { listAuditLogsForEntity } from "@/lib/audit/queries";
import { listCustomerDocuments } from "@/lib/customer-documents/queries";
import { SaleTable } from "@/components/app/sale-table";
import { getCurrentUser } from "@/lib/auth/session";
import { CustomerStatusBadge } from "@/components/app/customer-status-badge";
import { DeactivateCustomerButton } from "@/components/app/deactivate-customer-button";
import { ReactivateCustomerButton } from "@/components/app/reactivate-customer-button";
import { CustomerProfileTabs } from "@/components/app/customer-profile-tabs";
import { CustomerSummaryTab } from "@/components/app/customer-summary-tab";
import { CustomerHistoryTab } from "@/components/app/customer-history-tab";
import { CustomerDocumentsTab } from "@/components/app/customer-documents-tab";
import { CustomerLoyaltyTab, CustomerLoyaltyTabSkeleton } from "@/components/app/customer-loyalty-tab";
import { EmptyState } from "@/components/app/empty-state";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = {
  title: "Cliente",
};

const VALID_TABS = [
  "resumo",
  "historico",
  "compras",
  "servicos",
  "financeiro",
  "documentos",
  "fidelidade",
  "observacoes",
] as const;
type TabKey = (typeof VALID_TABS)[number];

function parseTab(value?: string): TabKey {
  return (VALID_TABS as readonly string[]).includes(value ?? "")
    ? (value as TabKey)
    : "resumo";
}

export default async function CustomerDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { tab?: string };
}) {
  const current = (await getCurrentCompany())!;

  // getCustomerById já filtra por company_id — se o cliente não existir OU
  // pertencer a outra empresa, retorna null. A RLS no banco garante o
  // mesmo isolamento mesmo que este filtro explícito fosse removido.
  const customer = await getCustomerById(current.company.id, params.id);

  if (!customer) {
    notFound();
  }

  const tab = parseTab(searchParams?.tab);

  // Só busca o histórico quando a aba está aberta — evita consulta
  // desnecessária nas outras abas.
  const auditLogs =
    tab === "historico"
      ? await listAuditLogsForEntity(current.company.id, "customer", customer.id)
      : [];

  const salesStats =
    tab === "resumo"
      ? await getCustomerSalesStats(current.company.id, customer.id)
      : { totalSpent: 0, purchaseCount: 0, averageTicket: null, lastPurchaseAt: null, estimatedMargin: 0 };

  // Só busca posição no ranking/produtos mais comprados quando a aba
  // Resumo está aberta e há pelo menos uma compra — evita consultas
  // desnecessárias nas outras abas ou para clientes sem vendas ainda.
  const revenueRank =
    tab === "resumo" && salesStats.purchaseCount > 0
      ? await getCustomerRevenueRank(current.company.id, customer.id)
      : { position: null, totalRanked: 0, isTopTier: false };

  const topProducts =
    tab === "resumo" && salesStats.purchaseCount > 0
      ? await getCustomerTopProducts(current.company.id, customer.id)
      : [];

  const classification =
    tab === "resumo"
      ? classifyCustomer({
          stats: salesStats,
          customerCreatedAt: customer.created_at,
          isTopTier: revenueRank.isTopTier,
        })
      : null;

  const customerSales =
    tab === "compras" ? await listSalesByCustomer(current.company.id, customer.id) : [];
  const currentUser = tab === "compras" ? await getCurrentUser() : null;

  const documents =
    tab === "documentos" ? await listCustomerDocuments(current.company.id, customer.id) : [];

  return (
    <div className="flex flex-col gap-6 px-4 py-6 sm:px-6">
      <div>
        <Link
          href="/app/clientes"
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          ← Voltar para Clientes
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">
            {customer.name}
          </h1>
          <CustomerStatusBadge status={customer.status} />
        </div>
        <p className="text-sm text-muted-foreground">
          Cadastrado em {formatDate(customer.created_at)} · Última movimentação em{" "}
          {formatDate(customer.updated_at)}
        </p>
      </div>

      <div className="flex gap-3">
        <Link
          href={`/app/clientes/${customer.id}/editar`}
          className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
        >
          Editar
        </Link>
        {customer.status === "active" ? (
          <DeactivateCustomerButton
            customerId={customer.id}
            customerName={customer.name}
          />
        ) : (
          <ReactivateCustomerButton
            customerId={customer.id}
            customerName={customer.name}
          />
        )}
      </div>

      <div className="max-w-3xl">
        <CustomerProfileTabs customerId={customer.id} activeTab={tab} />

        <div className="pt-6">
          {tab === "resumo" && classification && (
            <CustomerSummaryTab
              customer={customer}
              salesStats={salesStats}
              classification={classification}
              topProducts={topProducts}
            />
          )}

          {tab === "historico" && <CustomerHistoryTab logs={auditLogs} />}

          {tab === "compras" &&
            (customerSales.length === 0 ? (
              <EmptyState
                icon={ShoppingCart}
                title="Nenhuma compra registrada ainda."
                description="As vendas feitas para este cliente aparecerão aqui."
              />
            ) : (
              <SaleTable
                sales={customerSales}
                currentRole={current.role}
                currentUserId={currentUser?.id ?? null}
              />
            ))}

          {tab === "servicos" && (
            <EmptyState
              icon={Wrench}
              title="Em breve"
              description="Serviços prestados a este cliente serão exibidos separadamente numa fase futura (Ordens de Serviço)."
            />
          )}

          {tab === "financeiro" && (
            <EmptyState
              icon={Wallet}
              title="Financeiro — Em breve"
              description="O módulo Financeiro ainda não foi implementado. Quando estiver disponível, pagamentos e pendências deste cliente aparecerão aqui."
            />
          )}

          {tab === "documentos" && (
            <CustomerDocumentsTab customerId={customer.id} documents={documents} />
          )}

          {tab === "fidelidade" && (
            <Suspense fallback={<CustomerLoyaltyTabSkeleton />}>
              <CustomerLoyaltyTab
                companyId={current.company.id}
                customerId={customer.id}
                canConfigure={current.role === "owner" || current.role === "admin"}
              />
            </Suspense>
          )}

          {tab === "observacoes" && (
            <div className="rounded-lg border border-border bg-card p-6">
              {customer.notes ? (
                <p className="whitespace-pre-wrap text-sm text-foreground">
                  {customer.notes}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Nenhuma observação registrada para este cliente.{" "}
                  <Link
                    href={`/app/clientes/${customer.id}/editar`}
                    className="underline underline-offset-4 hover:text-foreground"
                  >
                    Adicionar
                  </Link>
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
