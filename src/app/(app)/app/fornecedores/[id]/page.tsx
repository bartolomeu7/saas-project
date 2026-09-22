import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentCompany } from "@/lib/companies/queries";
import { getSupplierById } from "@/lib/suppliers/queries";
import { updateSupplierAction, toggleSupplierAction } from "@/lib/suppliers/actions";
import { SupplierForm } from "@/components/app/supplier-form";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Fornecedor" };

export default async function SupplierDetailPage({ params }: { params: { id: string } }) {
  const current = (await getCurrentCompany())!;
  const supplier = await getSupplierById(current.company.id, params.id);
  if (!supplier) return <div className="px-4 py-10 text-center">Fornecedor não encontrado.</div>;

  const defaultValues = {
    name: supplier.name,
    legal_name: supplier.legal_name ?? "",
    document: supplier.document ?? "",
    email: supplier.email ?? "",
    phone: supplier.phone ?? "",
    whatsapp: supplier.whatsapp ?? "",
    address: supplier.address ?? "",
    address_number: supplier.address_number ?? "",
    complement: supplier.complement ?? "",
    neighborhood: supplier.neighborhood ?? "",
    city: supplier.city ?? "",
    state: supplier.state ?? "",
    postal_code: supplier.postal_code ?? "",
    notes: supplier.notes ?? "",
    status: supplier.status,
  };

  return (
    <div className="flex flex-col gap-6 px-4 py-6 sm:px-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link href="/app/fornecedores" className="text-sm text-muted-foreground hover:underline">← Fornecedores</Link>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">{supplier.name}</h1>
          <p className="text-sm text-muted-foreground">{supplier.status === "active" ? "Fornecedor ativo" : "Fornecedor inativo"}</p>
        </div>
        <form action={async () => {
          "use server";
          await toggleSupplierAction(supplier.id, supplier.status === "active" ? "inactive" : "active");
        }}>
          <button className={cn(buttonVariants({ variant: "outline" }))}>
            {supplier.status === "active" ? "Inativar" : "Reativar"}
          </button>
        </form>
      </div>
      <div className="max-w-4xl">
        <SupplierForm action={updateSupplierAction.bind(null, supplier.id)} defaultValues={defaultValues} submitLabel="Salvar alterações" />
      </div>
    </div>
  );
}
