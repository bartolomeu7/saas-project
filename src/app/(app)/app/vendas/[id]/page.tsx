import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentCompany } from "@/lib/companies/queries";
import { getCurrentUser } from "@/lib/auth/session";
import { getSaleById } from "@/lib/sales/queries";
import { getSaleSegmentHints } from "@/config/sale-segments";
import { listAuditLogsForEntity } from "@/lib/audit/queries";
import { calculateMarginPercentage } from "@/types/sale";
import { SaleStatusBadge } from "@/components/app/sale-status-badge";
import { CustomerPicker } from "@/components/app/customer-picker";
import { ProductPicker } from "@/components/app/product-picker";
import { ServicePicker } from "@/components/app/service-picker";
import { SaleItemsTable } from "@/components/app/sale-items-table";
import { SaleSummaryCard } from "@/components/app/sale-summary-card";
import { SalePaymentForm } from "@/components/app/sale-payment-form";
import { SalePaymentList } from "@/components/app/sale-payment-list";
import { CompleteSaleButton } from "@/components/app/complete-sale-button";
import { CancelSaleButton } from "@/components/app/cancel-sale-button";
import { SaleHistoryList } from "@/components/app/sale-history-list";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = {
  title: "Venda",
};

function formatMoney(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function saleNumber(id: string): string {
  return `#${id.slice(0, 8).toUpperCase()}`;
}

export default async function SaleDetailPage({ params }: { params: { id: string } }) {
  const current = (await getCurrentCompany())!;
  const user = await getCurrentUser();

  const sale = await getSaleById(current.company.id, params.id);
  if (!sale) {
    notFound();
  }

  const hints = getSaleSegmentHints(current.company.business_type);
  const auditLogs = await listAuditLogsForEntity(current.company.id, "sale", sale.id);

  const isDraft = sale.status === "draft";
  const isCompleted = sale.status === "completed";
  const canCancel =
    isCompleted &&
    (current.role === "owner" || current.role === "admin" || sale.user_id === user?.id);

  const marginPercentage = calculateMarginPercentage(sale.estimated_margin, sale.total_amount);

  const productPicker = <ProductPicker key="products" saleId={sale.id} />;
  const servicePicker = <ServicePicker key="services" saleId={sale.id} />;
  const pickers =
    hints.priority === "services"
      ? [servicePicker, productPicker]
      : [productPicker, servicePicker];

  return (
    <div className="flex flex-col gap-6 px-4 py-6 sm:px-6">
      <div>
        <Link
          href="/app/vendas"
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          ← Voltar para Vendas
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">Venda {saleNumber(sale.id)}</h1>
          <SaleStatusBadge status={sale.status} />
        </div>
        <p className="text-sm text-muted-foreground">
          {formatDate(sale.sold_at)} · Responsável: {sale.user_name ?? "—"}
          {sale.customer_name ? ` · Cliente: ${sale.customer_name}` : " · Sem cliente"}
        </p>
        {sale.status === "cancelled" && (
          <p className="mt-1 text-sm text-destructive">
            Cancelada em {sale.cancelled_at ? formatDate(sale.cancelled_at) : "—"}
            {sale.cancelled_reason ? ` · Motivo: ${sale.cancelled_reason}` : ""}
          </p>
        )}
      </div>

      {canCancel && (
        <div>
          <CancelSaleButton saleId={sale.id} />
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          {isDraft && (
            <div className="rounded-lg border border-border bg-card p-6">
              <h2 className="mb-3 text-sm font-semibold text-foreground">Cliente</h2>
              <CustomerPicker saleId={sale.id} currentCustomerName={sale.customer_name} />
            </div>
          )}

          {isDraft && (
            <div className="rounded-lg border border-border bg-card p-6">
              <h2 className="mb-3 text-sm font-semibold text-foreground">Adicionar item</h2>
              <div className="flex flex-col gap-4">{pickers}</div>
            </div>
          )}

          <div>
            <h2 className="mb-3 text-sm font-semibold text-muted-foreground">Itens</h2>
            <SaleItemsTable saleId={sale.id} items={sale.items} editable={isDraft} />
          </div>

          {sale.status !== "cancelled" && (
            <div className="rounded-lg border border-border bg-card p-6">
              <h2 className="mb-4 text-sm font-semibold text-foreground">Pagamento</h2>
              <div className="flex flex-col gap-4">
                <SalePaymentList payments={sale.payments} />
                <SalePaymentForm saleId={sale.id} />
              </div>
            </div>
          )}

          {isDraft && (
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-6">
              <h2 className="mb-3 text-sm font-semibold text-foreground">Concluir</h2>
              <p className="mb-3 text-xs text-muted-foreground">
                Ao concluir, o estoque dos produtos é baixado e a venda não pode mais ser
                editada — apenas cancelada.
              </p>
              <CompleteSaleButton saleId={sale.id} />
            </div>
          )}
        </div>

        <div className="flex flex-col gap-6">
          <SaleSummaryCard sale={sale} editable={isDraft} />

          {isCompleted && (
            <div className="rounded-lg border border-dashed border-border bg-card/40 p-4 text-xs text-muted-foreground">
              Margem estimada — não considera despesas operacionais, impostos ou taxas.
              {marginPercentage !== null && ` (${marginPercentage.toFixed(1)}% sobre o total)`}
            </div>
          )}

          <div className="rounded-lg border border-border bg-card p-6">
            <h2 className="mb-4 text-sm font-semibold text-foreground">Histórico</h2>
            <SaleHistoryList logs={auditLogs} />
          </div>
        </div>
      </div>
    </div>
  );
}
