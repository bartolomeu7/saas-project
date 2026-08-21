import type { Metadata } from "next";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getCurrentCompany } from "@/lib/companies/queries";
import { getCustomerStats, listCustomers } from "@/lib/customers/queries";
import { CustomerSearch } from "@/components/app/customer-search";
import { CustomerFilters } from "@/components/app/customer-filters";
import { CustomerStats } from "@/components/app/customer-stats";
import { CustomerTable } from "@/components/app/customer-table";
import { EmptyState } from "@/components/app/empty-state";
import { Pagination } from "@/components/app/pagination";
import type { CustomerStatus } from "@/types/customer";

export const metadata: Metadata = {
  title: "Clientes",
};

function parseStatus(value?: string): CustomerStatus | "all" {
  return value === "active" || value === "inactive" ? value : "all";
}

export default async function CustomersPage({
  searchParams,
}: {
  searchParams?: { q?: string; status?: string; page?: string };
}) {
  const current = (await getCurrentCompany())!;
  const companyId = current.company.id;

  const q = searchParams?.q ?? "";
  const status = parseStatus(searchParams?.status);
  const page = Math.max(1, Number(searchParams?.page) || 1);

  const [stats, result] = await Promise.all([
    getCustomerStats(companyId),
    listCustomers({ companyId, search: q, status, page }),
  ]);

  const hasAnyCustomer = stats.total > 0;

  return (
    <div className="flex flex-col gap-6 px-4 py-6 sm:px-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Clientes</h1>
          <p className="text-sm text-muted-foreground">
            Gerencie os clientes da sua empresa.
          </p>
        </div>
        <Link
          href="/app/clientes/novo"
          className={cn(buttonVariants(), "shrink-0")}
        >
          + Novo cliente
        </Link>
      </div>

      {!hasAnyCustomer ? (
        <EmptyState
          title="Você ainda não possui clientes."
          description="Cadastre o primeiro cliente para começar a usar o Prime Ges."
          actionLabel="Adicionar primeiro cliente"
          actionHref="/app/clientes/novo"
        />
      ) : (
        <>
          <CustomerStats stats={stats} />

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CustomerSearch />
            <CustomerFilters />
          </div>

          {result.customers.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              Nenhum cliente encontrado com esses filtros.
            </p>
          ) : (
            <>
              <CustomerTable customers={result.customers} />
              <Pagination
                page={result.page}
                pageSize={result.pageSize}
                total={result.total}
                basePath="/app/clientes"
                searchParams={{
                  q: searchParams?.q,
                  status: searchParams?.status,
                }}
              />
            </>
          )}
        </>
      )}
    </div>
  );
}
