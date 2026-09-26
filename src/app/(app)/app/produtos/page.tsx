import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/app/page-header";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getCurrentCompany } from "@/lib/companies/queries";
import { getProductStats, listProducts } from "@/lib/products/queries";
import { listActiveCategories } from "@/lib/product-categories/queries";
import { getProductSegmentHints } from "@/config/product-segments";
import { ProductSearch } from "@/components/app/product-search";
import { ProductFilters } from "@/components/app/product-filters";
import { ProductStats } from "@/components/app/product-stats";
import { ProductTable } from "@/components/app/product-table";
import { EmptyState } from "@/components/app/empty-state";
import { Pagination } from "@/components/app/pagination";
import type { ProductStatus, StockLevel } from "@/types/product";

export const metadata: Metadata = {
  title: "Produtos",
};

function parseStatus(value?: string): ProductStatus | "all" {
  return value === "active" || value === "inactive" ? value : "all";
}

function parseStockLevel(value?: string): StockLevel | "all" {
  return value === "normal" || value === "low" || value === "out" ? value : "all";
}

function parseSort(value?: string): "name" | "price" | "stock" | "created_at" {
  return value === "price" || value === "stock" || value === "created_at" ? value : "name";
}

export default async function ProductsPage({
  searchParams,
}: {
  searchParams?: {
    q?: string;
    status?: string;
    stock?: string;
    category?: string;
    sort?: string;
    page?: string;
  };
}) {
  const current = (await getCurrentCompany())!;
  const companyId = current.company.id;
  const hints = getProductSegmentHints(current.company.business_type);

  const q = searchParams?.q ?? "";
  const status = parseStatus(searchParams?.status);
  const stockLevel = parseStockLevel(searchParams?.stock);
  const categoryId = searchParams?.category && searchParams.category !== "all" ? searchParams.category : undefined;
  const sortBy = parseSort(searchParams?.sort);
  const page = Math.max(1, Number(searchParams?.page) || 1);

  const [stats, categories, result] = await Promise.all([
    getProductStats(companyId),
    listActiveCategories(companyId),
    listProducts({
      companyId,
      search: q,
      status,
      stockLevel,
      categoryId,
      sortBy,
      page,
    }),
  ]);

  const hasAnyProduct = stats.total > 0;

  return (
    <div className="prime-module-page prime-module-page--produtos flex flex-col gap-6 px-4 py-6 sm:px-6">
      <PageHeader
        title={hints.productsLabel}
        description="Cadastre e organize os produtos da sua empresa."
        actions={
          <>
            <Link
              href="/app/produtos/categorias"
              className={cn(buttonVariants({ variant: "outline" }))}
            >
              Categorias
            </Link>
            <Link href="/app/produtos/novo" className={cn(buttonVariants())}>
              + Novo produto
            </Link>
          </>
        }
      />

      {!hasAnyProduct ? (
        <EmptyState
          title="Você ainda não possui produtos."
          description="Cadastre seu primeiro produto para começar a organizar sua operação."
          actionLabel="Adicionar produto"
          actionHref="/app/produtos/novo"
        />
      ) : (
        <>
          <ProductStats stats={stats} />

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <ProductSearch />
            <ProductFilters categories={categories} />
          </div>

          {result.products.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              Nenhum produto encontrado com esses filtros.
            </p>
          ) : (
            <>
              <ProductTable products={result.products} />
              <Pagination
                page={result.page}
                pageSize={result.pageSize}
                total={result.total}
                basePath="/app/produtos"
                itemLabel="produto"
                itemLabelPlural="produtos"
                searchParams={{
                  q: searchParams?.q,
                  status: searchParams?.status,
                  stock: searchParams?.stock,
                  category: searchParams?.category,
                  sort: searchParams?.sort,
                }}
              />
            </>
          )}
        </>
      )}
    </div>
  );
}
