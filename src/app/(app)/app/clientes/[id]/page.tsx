import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getCurrentCompany } from "@/lib/companies/queries";
import { getCustomerById } from "@/lib/customers/queries";
import { CustomerStatusBadge } from "@/components/app/customer-status-badge";
import { DeactivateCustomerButton } from "@/components/app/deactivate-customer-button";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = {
  title: "Cliente",
};

const FIELDS: { label: string; key: keyof NonNullable<Awaited<ReturnType<typeof getCustomerById>>> }[] = [
  { label: "Documento", key: "document" },
  { label: "Telefone", key: "phone" },
  { label: "WhatsApp", key: "whatsapp" },
  { label: "E-mail", key: "email" },
  { label: "CEP", key: "postal_code" },
  { label: "Endereço", key: "address" },
  { label: "Número", key: "address_number" },
  { label: "Complemento", key: "complement" },
  { label: "Bairro", key: "neighborhood" },
  { label: "Cidade", key: "city" },
  { label: "Estado", key: "state" },
];

export default async function CustomerDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const current = (await getCurrentCompany())!;

  // getCustomerById já filtra por company_id — se o cliente não existir OU
  // pertencer a outra empresa, retorna null. A RLS no banco garante o
  // mesmo isolamento mesmo que este filtro explícito fosse removido.
  const customer = await getCustomerById(current.company.id, params.id);

  if (!customer) {
    notFound();
  }

  return (
    <div className="flex flex-col gap-6 px-4 py-6 sm:px-6">
      <div>
        <Link
          href="/app/clientes"
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          ← Voltar para Clientes
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">
            {customer.name}
          </h1>
          <CustomerStatusBadge status={customer.status} />
        </div>
        <p className="text-sm text-muted-foreground">
          Cadastrado em {formatDate(customer.created_at)} · Atualizado em{" "}
          {formatDate(customer.updated_at)}
        </p>
      </div>

      <div className="flex gap-3">
        <Link
          href={`/app/clientes/${customer.id}/editar`}
          className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
        >
          Editar
        </Link>
        {customer.status === "active" && (
          <DeactivateCustomerButton
            customerId={customer.id}
            customerName={customer.name}
          />
        )}
      </div>

      <div className="grid max-w-3xl grid-cols-1 gap-4 rounded-lg border border-border p-6 sm:grid-cols-2">
        {FIELDS.map((field) => (
          <div key={field.key}>
            <p className="text-xs uppercase text-muted-foreground">
              {field.label}
            </p>
            <p className="text-sm">{customer[field.key] ?? "—"}</p>
          </div>
        ))}

        {customer.notes && (
          <div className="sm:col-span-2">
            <p className="text-xs uppercase text-muted-foreground">
              Observações
            </p>
            <p className="whitespace-pre-wrap text-sm">{customer.notes}</p>
          </div>
        )}
      </div>

      <div className="max-w-3xl rounded-lg border border-border p-6">
        <h2 className="text-sm font-semibold">Histórico</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Histórico de vendas e serviços será disponibilizado nas próximas
          versões.
        </p>
      </div>
    </div>
  );
}
