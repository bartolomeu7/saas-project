import Link from "next/link";
import type { ServiceCategory } from "@/types/service";
import { ServiceStatusBadge } from "@/components/app/service-status-badge";
import { DeactivateServiceCategoryButton } from "@/components/app/deactivate-service-category-button";
import { ReactivateServiceCategoryButton } from "@/components/app/reactivate-service-category-button";

export function ServiceCategoryTable({
  categories,
  serviceCounts,
}: {
  categories: ServiceCategory[];
  serviceCounts: Record<string, number>;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[560px] text-sm">
        <thead className="bg-secondary/50 text-left text-xs uppercase text-muted-foreground">
          <tr>
            <th className="px-4 py-3 font-medium">Categoria</th>
            <th className="px-4 py-3 font-medium">Serviços</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium">Ações</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {categories.map((category) => {
            const count = serviceCounts[category.id] ?? 0;
            return (
              <tr key={category.id} className="hover:bg-secondary/30">
                <td className="px-4 py-3 font-medium text-foreground">{category.name}</td>
                <td className="px-4 py-3 text-muted-foreground">{count}</td>
                <td className="px-4 py-3">
                  <ServiceStatusBadge status={category.status} />
                </td>
                <td className="px-4 py-3">
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
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
