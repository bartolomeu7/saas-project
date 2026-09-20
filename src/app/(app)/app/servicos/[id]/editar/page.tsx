import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentCompany } from "@/lib/companies/queries";
import { getServiceById } from "@/lib/services/queries";
import { listActiveCategories } from "@/lib/service-categories/queries";
import { updateServiceAction } from "@/lib/services/actions";
import { ServiceForm } from "@/components/app/service-form";

export const metadata: Metadata = {
  title: "Editar serviço",
};

export default async function EditServicePage({
  params,
}: {
  params: { id: string };
}) {
  const current = (await getCurrentCompany())!;
  const service = await getServiceById(current.company.id, params.id);

  if (!service) {
    notFound();
  }

  const categories = await listActiveCategories(current.company.id);
  const action = updateServiceAction.bind(null, service.id);

  return (
    <div className="flex flex-col gap-6 px-4 py-6 sm:px-6">
      <div>
        <Link
          href={`/app/servicos/${service.id}`}
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          ← Voltar para {service.name}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Editar serviço</h1>
      </div>

      <div className="max-w-3xl">
        <ServiceForm
          action={action}
          defaultValues={service}
          categories={categories}
          currentCategoryName={service.category_name}
          submitLabel="Salvar alterações"
        />
      </div>
    </div>
  );
}
