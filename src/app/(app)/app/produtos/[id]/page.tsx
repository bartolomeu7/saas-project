import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DollarSign, TrendingUp, Package, AlertTriangle } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getCurrentCompany } from "@/lib/companies/queries";
import { getProductById } from "@/lib/products/queries";
import { listAuditLogsForEntity } from "@/lib/audit/queries";
import { calculateMargin, PRODUCT_UNIT_LABELS } from "@/types/product";
import { ProductStatusBadge } from "@/components/app/product-status-badge";
import { StockLevelBadge } from "@/components/app/stock-level-badge";
import { DeactivateProductButton } from "@/components/app/deactivate-product-button";
import { ReactivateProductButton } from "@/components/app/reactivate-product-button";
import { DashboardCard } from "@/components/app/dashboard-card";
import { StockAdjustForm } from "@/components/app/stock-adjust-form";
import { ProductHistoryList } from "@/components/app/product-history-list";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = {
  title: "Produto",
};

function formatMoney(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default async function ProductDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const current = (await getCurrentCompany())!;

  const product = await getProductById(current.company.id, params.id);

  if (!product) {
    notFound();
  }

  const auditLogs = await listAuditLogsForEntity(current.company.id, "product", product.id);
  const margin = calculateMargin(product.cost_price, product.sale_price);

  return (
    <div className="flex flex-col gap-6 px-4 py-6 sm:px-6">
      <div>
        <Link
          href="/app/produtos"
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          ← Voltar para Produtos
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{product.name}</h1>
          <ProductStatusBadge status={product.status} />
          <StockLevelBadge product={product} />
        </div>
        <p className="text-sm text-muted-foreground">
          Cadastrado em {formatDate(product.created_at)} · Atualizado em{" "}
          {formatDate(product.updated_at)}
        </p>
      </div>

      <div className="flex gap-3">
        <Link
          href={`/app/produtos/${product.id}/editar`}
          className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
        >
          Editar
        </Link>
        {product.status === "active" ? (
          <DeactivateProductButton productId={product.id} productName={product.name} />
        ) : (
          <ReactivateProductButton productId={product.id} productName={product.name} />
        )}
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground">Indicadores</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <DashboardCard label="Preço de venda" value={formatMoney(product.sale_price)} icon={DollarSign} />
          <DashboardCard
            label="Margem"
            value={formatMoney(margin.value)}
            icon={TrendingUp}
            hint={margin.percentage === null ? "Sem preço de venda definido" : `${margin.percentage.toFixed(2)}% sobre a venda`}
            indicator={margin.value > 0 ? "success" : margin.value < 0 ? "warning" : "neutral"}
          />
          <DashboardCard
            label="Estoque atual"
            value={`${product.stock_quantity} ${product.unit}`}
            icon={Package}
          />
          <DashboardCard
            label="Estoque mínimo"
            value={`${product.minimum_stock} ${product.unit}`}
            icon={AlertTriangle}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          <div className="rounded-lg border border-border bg-card p-6">
            <h2 className="text-sm font-semibold text-foreground">Identificação</h2>
            <div className="mt-4 grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs uppercase text-muted-foreground">SKU</p>
                <p className="text-sm text-foreground">{product.sku ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs uppercase text-muted-foreground">Código de barras</p>
                <p className="text-sm text-foreground">{product.barcode ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs uppercase text-muted-foreground">Categoria</p>
                <p className="text-sm text-foreground">{product.category_name ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs uppercase text-muted-foreground">Unidade</p>
                <p className="text-sm text-foreground">{PRODUCT_UNIT_LABELS[product.unit]}</p>
              </div>
              {product.description && (
                <div className="col-span-2">
                  <p className="text-xs uppercase text-muted-foreground">Descrição</p>
                  <p className="whitespace-pre-wrap text-sm text-foreground">
                    {product.description}
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card p-6">
            <h2 className="text-sm font-semibold text-foreground">Vendas</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Histórico de vendas estará disponível quando o módulo de Vendas for implementado.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div className="rounded-lg border border-border bg-card p-6">
            <h2 className="mb-4 text-sm font-semibold text-foreground">Ajustar estoque</h2>
            <StockAdjustForm
              productId={product.id}
              currentStock={product.stock_quantity}
              unit={product.unit}
            />
          </div>

          <div className="rounded-lg border border-border bg-card p-6">
            <h2 className="mb-4 text-sm font-semibold text-foreground">Histórico</h2>
            <ProductHistoryList logs={auditLogs} />
          </div>
        </div>
      </div>
    </div>
  );
}
