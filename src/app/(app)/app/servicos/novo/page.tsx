import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentCompany } from "@/lib/companies/queries";
import { listActiveCategories } from "@/lib/service-categories/queries";
import { createServiceAction } from "@/lib/services/actions";
import { ServiceForm } from "@/components/app/service-form";

export const metadata: Metadata = {
  title: "Novo serviço",
};

export default async function NewServicePage() {
  const current = (await getCurrentCompany())!;
  const categories = await listActiveCategories(current.company.id);

  return (
    <div className="flex flex-col gap-6 px-4 py-6 sm:px-6">
      <div>
        <Link
          href="/app/servicos"
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          ← Voltar para Serviços
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Novo serviço</h1>
        <p className="text-sm text-muted-foreground">
          Apenas o nome é obrigatório — os demais campos podem ser preenchidos depois.
        </p>
      </div>

      <div className="max-w-3xl">
        <ServiceForm
          action={createServiceAction}
          categories={categories}
          submitLabel="Salvar serviço"
        />
      </div>
    </div>
  );
}
