import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentCompany } from "@/lib/companies/queries";
import { getCategoryById } from "@/lib/service-categories/queries";
import { updateCategoryAction } from "@/lib/service-categories/actions";
import { ServiceCategoryForm } from "@/components/app/service-category-form";

export const metadata: Metadata = {
  title: "Editar categoria",
};

export default async function EditServiceCategoryPage({
  params,
}: {
  params: { id: string };
}) {
  const current = (await getCurrentCompany())!;
  const category = await getCategoryById(current.company.id, params.id);

  if (!category) {
    notFound();
  }

  const action = updateCategoryAction.bind(null, category.id);

  return (
    <div className="flex flex-col gap-6 px-4 py-6 sm:px-6">
      <div>
        <Link
          href="/app/servicos/categorias"
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          ← Voltar para Categorias
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Editar categoria</h1>
      </div>

      <div className="max-w-xl">
        <ServiceCategoryForm
          action={action}
          defaultValues={category}
          submitLabel="Salvar alterações"
        />
      </div>
    </div>
  );
}
