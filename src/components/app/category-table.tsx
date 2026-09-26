import Link from "next/link";
import type { ProductCategory } from "@/types/product";
import { ProductStatusBadge } from "@/components/app/product-status-badge";
import { DeactivateCategoryButton } from "@/components/app/deactivate-category-button";
import { ReactivateCategoryButton } from "@/components/app/reactivate-category-button";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";

export function CategoryTable({
  categories,
  productCounts,
}: {
  categories: ProductCategory[];
  productCounts: Record<string, number>;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <Table className="w-full min-w-[560px] text-sm">
        <TableHeader className="bg-secondary/50 text-left text-xs uppercase text-muted-foreground">
          <TableRow>
            <TableHead className="px-4 py-3 font-medium">Categoria</TableHead>
            <TableHead className="px-4 py-3 font-medium">Produtos</TableHead>
            <TableHead className="px-4 py-3 font-medium">Status</TableHead>
            <TableHead className="px-4 py-3 font-medium">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {categories.map((category) => {
            const count = productCounts[category.id] ?? 0;
            return (
              <TableRow key={category.id} className="hover:bg-secondary/30">
                <TableCell className="px-4 py-3 font-medium text-foreground">{category.name}</TableCell>
                <TableCell className="px-4 py-3 text-muted-foreground">{count}</TableCell>
                <TableCell className="px-4 py-3">
                  <ProductStatusBadge status={category.status} />
                </TableCell>
                <TableCell className="px-4 py-3">
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
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
