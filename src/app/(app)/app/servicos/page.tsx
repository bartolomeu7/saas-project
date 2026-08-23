import type { Metadata } from "next";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getCurrentCompany } from "@/lib/companies/queries";
import { getServiceStats, listServices } from "@/lib/services/queries";
import { listActiveCategories } from "@/lib/service-categories/queries";
import { getServiceSegmentHints } from "@/config/service-segments";
import { ServiceSearch } from "@/components/app/service-search";
import { ServiceFilters } from "@/components/app/service-filters";
import { ServiceStats } from "@/components/app/service-stats";
import { ServiceTable } from "@/components/app/service-table";
import { EmptyState } from "@/components/app/empty-state";
import { Pagination } from "@/components/app/pagination";
import type { ServiceStatus } from "@/types/service";

export const metadata: Metadata = {
  title: "Serviços",
};

function parseStatus(value?: string): ServiceStatus | "all" {
  return value === "active" || value === "inactive" ? value : "all";
}

function parseSort(value?: string): "name" | "price" | "duration" | "created_at" {
  return value === "price" || value === "duration" || value === "created_at"
    ? value
    : "name";
}

function parseNumber(value?: string): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

export default async function ServicesPage({
  searchParams,
}: {
  searchParams?: {
    q?: string;
    status?: string;
    category?: string;
    sort?: string;
    page?: string;
    minPrice?: string;
    maxPrice?: string;
    minDuration?: string;
    maxDuration?: string;
  };
}) {
  const current = (await getCurrentCompany())!;
  const companyId = current.company.id;
  const hints = getServiceSegmentHints(current.company.business_type);

  const q = searchParams?.q ?? "";
  const status = parseStatus(searchParams?.status);
  const categoryId =
    searchParams?.category && searchParams.category !== "all" ? searchParams.category : undefined;
  const sortBy = parseSort(searchParams?.sort);
  const page = Math.max(1, Number(searchParams?.page) || 1);
  const minPrice = parseNumber(searchParams?.minPrice);
  const maxPrice = parseNumber(searchParams?.maxPrice);
  const minDuration = parseNumber(searchParams?.minDuration);
  const maxDuration = parseNumber(searchParams?.maxDuration);

  const [stats, categories, result] = await Promise.all([
    getServiceStats(companyId),
    listActiveCategories(companyId),
    listServices({
      companyId,
      search: q,
      status,
      categoryId,
      sortBy,
      page,
      minPrice,
      maxPrice,
      minDuration,
      maxDuration,
    }),
  ]);

  const hasAnyService = stats.total > 0;

  return (
    <div className="flex flex-col gap-6 px-4 py-6 sm:px-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{hints.servicesLabel}</h1>
          <p className="text-sm text-muted-foreground">
            Cadastre e organize os serviços da sua empresa.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Link
            href="/app/servicos/categorias"
            className={cn(buttonVariants({ variant: "outline" }))}
          >
            Categorias
          </Link>
          <Link href="/app/servicos/novo" className={cn(buttonVariants())}>
            + Novo serviço
          </Link>
        </div>
      </div>

      {!hasAnyService ? (
        <EmptyState
          title="Você ainda não possui serviços."
          description="Cadastre seu primeiro serviço para começar a organizar seu catálogo."
          actionLabel="Adicionar serviço"
          actionHref="/app/servicos/novo"
        />
      ) : (
        <>
          <ServiceStats stats={stats} />

          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <ServiceSearch />
            <ServiceFilters categories={categories} />
          </div>

          {result.services.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              Nenhum serviço encontrado com esses filtros.
            </p>
          ) : (
            <>
              <ServiceTable services={result.services} />
              <Pagination
                page={result.page}
                pageSize={result.pageSize}
                total={result.total}
                basePath="/app/servicos"
                itemLabel="serviço"
                itemLabelPlural="serviços"
                searchParams={{
                  q: searchParams?.q,
                  status: searchParams?.status,
                  category: searchParams?.category,
                  sort: searchParams?.sort,
                  minPrice: searchParams?.minPrice,
                  maxPrice: searchParams?.maxPrice,
                  minDuration: searchParams?.minDuration,
                  maxDuration: searchParams?.maxDuration,
                }}
              />
            </>
          )}
        </>
      )}
    </div>
  );
}
