import type { Metadata } from "next";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getCurrentCompany } from "@/lib/companies/queries";
import { getCurrentUser } from "@/lib/auth/session";
import { listSales, getSaleStats, resolveSalePeriodRange } from "@/lib/sales/queries";
import { getSaleSegmentHints } from "@/config/sale-segments";
import { SaleSearch } from "@/components/app/sale-search";
import { SaleFilters } from "@/components/app/sale-filters";
import { SaleStats } from "@/components/app/sale-stats";
import { SaleTable } from "@/components/app/sale-table";
import { EmptyState } from "@/components/app/empty-state";
import { Pagination } from "@/components/app/pagination";
import type { SaleStatus, SalePaymentStatus } from "@/types/sale";
import type { SalePeriod } from "@/lib/sales/queries";

export const metadata: Metadata = {
  title: "Vendas",
};

function parseStatus(value?: string): SaleStatus | "all" {
  return value === "draft" || value === "completed" || value === "cancelled" ? value : "all";
}

function parsePaymentStatus(value?: string): SalePaymentStatus | "all" {
  return value === "pending" || value === "paid" ? value : "all";
}

function parsePeriod(value?: string): SalePeriod {
  return value === "today" ||
    value === "7d" ||
    value === "30d" ||
    value === "month" ||
    value === "year" ||
    value === "custom"
    ? value
    : "all";
}

export default async function SalesPage({
  searchParams,
}: {
  searchParams?: {
    q?: string;
    status?: string;
    paymentStatus?: string;
    period?: string;
    from?: string;
    to?: string;
    page?: string;
  };
}) {
  const current = (await getCurrentCompany())!;
  const user = await getCurrentUser();
  const companyId = current.company.id;
  const hints = getSaleSegmentHints(current.company.business_type);

  const q = searchParams?.q ?? "";
  const status = parseStatus(searchParams?.status);
  const paymentStatus = parsePaymentStatus(searchParams?.paymentStatus);
  const period = parsePeriod(searchParams?.period);
  const range = resolveSalePeriodRange(period, searchParams?.from, searchParams?.to);
  const page = Math.max(1, Number(searchParams?.page) || 1);

  const [stats, result] = await Promise.all([
    getSaleStats(companyId, range.from, range.to),
    listSales({
      companyId,
      search: q,
      status,
      paymentStatus,
      from: range.from,
      to: range.to,
      page,
    }),
  ]);

  const hasAnySale = stats.totalInPeriod > 0 || result.total > 0;

  return (
    <div className="prime-module-page prime-module-page--vendas flex flex-col gap-6 px-4 py-6 sm:px-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Vendas</h1>
          <p className="text-sm text-muted-foreground">
            Acompanhe e registre as vendas da sua empresa.
          </p>
        </div>
        <Link href="/app/vendas/nova" className={cn(buttonVariants(), "shrink-0")}>
          + {hints.newSaleLabel}
        </Link>
      </div>

      {!hasAnySale && !q && status === "all" && paymentStatus === "all" ? (
        <EmptyState
          title="Você ainda não possui vendas."
          description="Registre sua primeira venda para começar a acompanhar o desempenho da empresa."
          actionLabel={hints.newSaleLabel}
          actionHref="/app/vendas/nova"
        />
      ) : (
        <>
          <SaleStats stats={stats} />

          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <SaleSearch />
            <SaleFilters />
          </div>

          {result.sales.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              Nenhuma venda encontrada com esses filtros.
            </p>
          ) : (
            <>
              <SaleTable
                sales={result.sales}
                currentRole={current.role}
                currentUserId={user?.id ?? null}
              />
              <Pagination
                page={result.page}
                pageSize={result.pageSize}
                total={result.total}
                basePath="/app/vendas"
                itemLabel="venda"
                itemLabelPlural="vendas"
                searchParams={{
                  q: searchParams?.q,
                  status: searchParams?.status,
                  paymentStatus: searchParams?.paymentStatus,
                  period: searchParams?.period,
                  from: searchParams?.from,
                  to: searchParams?.to,
                }}
              />
            </>
          )}
        </>
      )}
    </div>
  );
}
