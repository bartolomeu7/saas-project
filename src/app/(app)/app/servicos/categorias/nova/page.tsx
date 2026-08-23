import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentCompany } from "@/lib/companies/queries";
import { getServiceSegmentHints } from "@/config/service-segments";
import { createCategoryAction } from "@/lib/service-categories/actions";
import { ServiceCategoryForm } from "@/components/app/service-category-form";

export const metadata: Metadata = {
  title: "Nova categoria",
};

export default async function NewServiceCategoryPage() {
  const current = (await getCurrentCompany())!;
  const hints = getServiceSegmentHints(current.company.business_type);

  return (
    <div className="flex flex-col gap-6 px-4 py-6 sm:px-6">
      <div>
        <Link
          href="/app/servicos/categorias"
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          ← Voltar para Categorias
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Nova categoria</h1>
        {hints.suggestedCategories.length > 0 && (
          <p className="mt-1 text-sm text-muted-foreground">
            Sugestões para o seu segmento: {hints.suggestedCategories.join(", ")} — você
            pode usar essas ou criar as suas.
          </p>
        )}
      </div>

      <div className="max-w-xl">
        <ServiceCategoryForm action={createCategoryAction} submitLabel="Salvar categoria" />
      </div>
    </div>
  );
}
