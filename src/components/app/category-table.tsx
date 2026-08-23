import Link from "next/link";
import type { ProductCategory } from "@/types/product";
import { ProductStatusBadge } from "@/components/app/product-status-badge";
import { DeactivateCategoryButton } from "@/components/app/deactivate-category-button";
import { ReactivateCategoryButton } from "@/components/app/reactivate-category-button";

export function CategoryTable({
  categories,
  productCounts,
}: {
  categories: ProductCategory[];
  productCounts: Record<string, number>;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[560px] text-sm">
        <thead className="bg-secondary/50 text-left text-xs uppercase text-muted-foreground">
          <tr>
            <th className="px-4 py-3 font-medium">Categoria</th>
            <th className="px-4 py-3 font-medium">Produtos</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium">Ações</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {categories.map((category) => {
            const count = productCounts[category.id] ?? 0;
            return (
              <tr key={category.id} className="hover:bg-secondary/30">
                <td className="px-4 py-3 font-medium text-foreground">{category.name}</td>
                <td className="px-4 py-3 text-muted-foreground">{count}</td>
                <td className="px-4 py-3">
                  <ProductStatusBadge status={category.status} />
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <Link
                      href={`/app/produtos/categorias/${category.id}/editar`}
                      className="text-sm font-medium underline-offset-4 hover:underline"
                    >
                      Editar
                    </Link>
                    {category.status === "active" ? (
                      <DeactivateCategoryButton
                        categoryId={category.id}
                        categoryName={category.name}
                        productCount={count}
                      />
                    ) : (
                      <ReactivateCategoryButton
                        categoryId={category.id}
                        categoryName={category.name}
                      />
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
