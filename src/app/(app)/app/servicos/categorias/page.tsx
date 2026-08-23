import type { Metadata } from "next";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getCurrentCompany } from "@/lib/companies/queries";
import { listCategories } from "@/lib/service-categories/queries";
import { createClient } from "@/lib/supabase/server";
import { ServiceCategoryTable } from "@/components/app/service-category-table";
import { EmptyState } from "@/components/app/empty-state";

export const metadata: Metadata = {
  title: "Categorias de serviços",
};

export default async function ServiceCategoriesPage() {
  const current = (await getCurrentCompany())!;
  const categories = await listCategories({ companyId: current.company.id });

  // Contagem de serviços por categoria, para avisar antes de desativar.
  // Uma única consulta agregando todas as categorias de uma vez (não
  // N+1) — mesmo padrão de src/app/(app)/app/produtos/categorias/page.tsx.
  const supabase = createClient();
  const { data: serviceRows } = await supabase
    .from("services")
    .select("category_id")
    .eq("company_id", current.company.id)
    .not("category_id", "is", null);

  const serviceCounts: Record<string, number> = {};
  for (const row of serviceRows ?? []) {
    if (row.category_id) {
      serviceCounts[row.category_id] = (serviceCounts[row.category_id] ?? 0) + 1;
    }
  }

  return (
    <div className="flex flex-col gap-6 px-4 py-6 sm:px-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link
            href="/app/servicos"
            className="text-sm text-muted-foreground underline-offset-4 hover:underline"
          >
            ← Voltar para Serviços
          </Link>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">
            Categorias de serviços
          </h1>
          <p className="text-sm text-muted-foreground">
            Organize seus serviços em categorias.
          </p>
        </div>
        <Link
          href="/app/servicos/categorias/nova"
          className={cn(buttonVariants(), "shrink-0")}
        >
          + Nova categoria
        </Link>
      </div>

      {categories.length === 0 ? (
        <EmptyState
          title="Você ainda não possui categorias."
          description="Categorias ajudam a organizar seus serviços — por exemplo, Lavagem, Estética, Manutenção."
          actionLabel="Criar categoria"
          actionHref="/app/servicos/categorias/nova"
        />
      ) : (
        <ServiceCategoryTable categories={categories} serviceCounts={serviceCounts} />
      )}
    </div>
  );
}
