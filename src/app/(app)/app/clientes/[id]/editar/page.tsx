import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentCompany } from "@/lib/companies/queries";
import { getCustomerById } from "@/lib/customers/queries";
import { updateCustomerAction } from "@/lib/customers/actions";
import { CustomerForm } from "@/components/app/customer-form";

export const metadata: Metadata = {
  title: "Editar cliente",
};

export default async function EditCustomerPage({
  params,
}: {
  params: { id: string };
}) {
  const current = (await getCurrentCompany())!;
  const customer = await getCustomerById(current.company.id, params.id);

  if (!customer) {
    notFound();
  }

  const action = updateCustomerAction.bind(null, customer.id);

  return (
    <div className="flex flex-col gap-6 px-4 py-6 sm:px-6">
      <div>
        <Link
          href={`/app/clientes/${customer.id}`}
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          ← Voltar para {customer.name}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Editar cliente
        </h1>
      </div>

      <div className="max-w-3xl">
        <CustomerForm
          action={action}
          defaultValues={customer}
          submitLabel="Salvar alterações"
        />
      </div>
    </div>
  );
}
