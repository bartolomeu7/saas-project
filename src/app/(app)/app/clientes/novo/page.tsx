import type { Metadata } from "next";
import Link from "next/link";
import { createCustomerAction } from "@/lib/customers/actions";
import { CustomerForm } from "@/components/app/customer-form";

export const metadata: Metadata = {
  title: "Novo cliente",
};

export default function NewCustomerPage() {
  return (
    <div className="flex flex-col gap-6 px-4 py-6 sm:px-6">
      <div>
        <Link
          href="/app/clientes"
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          ← Voltar para Clientes
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Novo cliente
        </h1>
        <p className="text-sm text-muted-foreground">
          Preencha os dados do cliente. Apenas o nome é obrigatório.
        </p>
      </div>

      <div className="max-w-3xl">
        <CustomerForm action={createCustomerAction} submitLabel="Salvar cliente" />
      </div>
    </div>
  );
}
