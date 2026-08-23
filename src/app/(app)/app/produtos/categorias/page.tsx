import type { Metadata } from "next";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getCurrentCompany } from "@/lib/companies/queries";
import { listCategories } from "@/lib/product-categories/queries";
import { createClient } from "@/lib/supabase/server";
import { CategoryTable } from "@/components/app/category-table";
import { EmptyState } from "@/components/app/empty-state";

export const metadata: Metadata = {
  title: "Categorias de produtos",
};

export default async function ProductCategoriesPage() {
  const current = (await getCurrentCompany())!;
  const categories = await listCategories({ companyId: current.company.id });

  // Contagem de produtos por categoria, para avisar antes de desativar.
  // Uma única consulta agregando todas as categorias de uma vez (não
  // N+1) — leve o suficiente para o catálogo de uma pequena empresa.
  const supabase = createClient();
  const { data: productRows } = await supabase
    .from("products")
    .select("category_id")
    .eq("company_id", current.company.id)
    .not("category_id", "is", null);

  const productCounts: Record<string, number> = {};
  for (const row of productRows ?? []) {
    if (row.category_id) {
      productCounts[row.category_id] = (productCounts[row.category_id] ?? 0) + 1;
    }
  }

  return (
    <div className="flex flex-col gap-6 px-4 py-6 sm:px-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link
            href="/app/produtos"
            className="text-sm text-muted-foreground underline-offset-4 hover:underline"
          >
            ← Voltar para Produtos
          </Link>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">
            Categorias de produtos
          </h1>
          <p className="text-sm text-muted-foreground">
            Organize seus produtos em categorias.
          </p>
        </div>
        <Link
          href="/app/produtos/categorias/nova"
          className={cn(buttonVariants(), "shrink-0")}
        >
          + Nova categoria
        </Link>
      </div>

      {categories.length === 0 ? (
        <EmptyState
          title="Você ainda não possui categorias."
          description="Categorias ajudam a organizar seus produtos — por exemplo, Bebidas, Alimentos, Limpeza."
          actionLabel="Criar categoria"
          actionHref="/app/produtos/categorias/nova"
        />
      ) : (
        <CategoryTable categories={categories} productCounts={productCounts} />
      )}
    </div>
  );
}
