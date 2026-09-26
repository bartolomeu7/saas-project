import Link from "next/link";
import type { ServiceCategory } from "@/types/service";
import { ServiceStatusBadge } from "@/components/app/service-status-badge";
import { DeactivateServiceCategoryButton } from "@/components/app/deactivate-service-category-button";
import { ReactivateServiceCategoryButton } from "@/components/app/reactivate-service-category-button";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";

export function ServiceCategoryTable({
  categories,
  serviceCounts,
}: {
  categories: ServiceCategory[];
  serviceCounts: Record<string, number>;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <Table className="w-full min-w-[560px] text-sm">
        <TableHeader className="bg-secondary/50 text-left text-xs uppercase text-muted-foreground">
          <TableRow>
            <TableHead className="px-4 py-3 font-medium">Categoria</TableHead>
            <TableHead className="px-4 py-3 font-medium">Serviços</TableHead>
            <TableHead className="px-4 py-3 font-medium">Status</TableHead>
            <TableHead className="px-4 py-3 font-medium">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {categories.map((category) => {
            const count = serviceCounts[category.id] ?? 0;
            return (
              <TableRow key={category.id} className="hover:bg-secondary/30">
                <TableCell className="px-4 py-3 font-medium text-foreground">{category.name}</TableCell>
                <TableCell className="px-4 py-3 text-muted-foreground">{count}</TableCell>
                <TableCell className="px-4 py-3">
                  <ServiceStatusBadge status={category.status} />
                </TableCell>
                <TableCell className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <Link
                      href={`/app/servicos/categorias/${category.id}/editar`}
                      className="text-sm font-medium underline-offset-4 hover:underline"
                    >
                      Editar
                    </Link>
                    {category.status === "active" ? (
                      <DeactivateServiceCategoryButton
                        categoryId={category.id}
                        categoryName={category.name}
                        serviceCount={count}
                      />
                    ) : (
                      <ReactivateServiceCategoryButton
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
