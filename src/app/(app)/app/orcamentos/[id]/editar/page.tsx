import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { QuoteForm, type DraftItem } from "@/components/app/quote-form";
import { getCurrentCompany } from "@/lib/companies/queries";
import { updateQuoteAction } from "@/lib/quotes/actions";
import { loadQuoteFormOptions } from "@/lib/quotes/form-data";
import { getQuoteDetail } from "@/lib/quotes/queries";

export const metadata: Metadata = { title: "Editar orçamento" };

export default async function EditQuotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const current = (await getCurrentCompany())!;
  const detail = await getQuoteDetail(current.company.id, id);
  if (!detail) notFound();
  const { quote, items } = detail;
  // só rascunho se edita; os outros voltam para a página do orçamento (lá há "Voltar para rascunho")
  if (quote.status !== "draft") redirect(`/app/orcamentos/${quote.id}`);
  const options = await loadQuoteFormOptions(current.company.id);
  // cliente que ficou inativo depois continua aparecendo na lista, para o orçamento não perder o vínculo ao editar
  if (quote.customer_id && !options.customers.some((customer) => customer.id === quote.customer_id)) {
    options.customers.push({ id: quote.customer_id, name: quote.customer_name });
  }

  const draftItems: DraftItem[] = items.map((item) => ({
    type: item.item_type,
    refId: item.product_id ?? item.service_id ?? "",
    description: item.description,
    unit: item.unit,
    quantity: String(item.quantity),
    unitPrice: String(item.unit_price),
    discount: Number(item.discount_amount) > 0 ? String(item.discount_amount) : "",
  }));

  return (
    <div className="flex flex-col gap-6 px-4 py-6 sm:px-6">
      <Link href={`/app/orcamentos/${quote.id}`} className="text-sm text-muted-foreground hover:underline">
        ← Voltar para {quote.number}
      </Link>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Editar {quote.number}</h1>
        <p className="text-sm text-muted-foreground">Rascunho: dá para mudar tudo. Depois de enviado, o orçamento fica travado.</p>
      </div>
      <QuoteForm
        action={updateQuoteAction.bind(null, quote.id)}
        customers={options.customers}
        products={options.products}
        services={options.services}
        submitLabel="Salvar alterações"
        pendingLabel="Salvando..."
        values={{
          customerId: quote.customer_id ?? "",
          customerName: quote.customer_name,
          customerDocument: quote.customer_document ?? "",
          customerPhone: quote.customer_phone ?? "",
          customerEmail: quote.customer_email ?? "",
          customerAddress: quote.customer_address ?? "",
          title: quote.title ?? "",
          issuedOn: quote.issued_on,
          validUntil: quote.valid_until,
          paymentTerms: quote.payment_terms ?? "",
          deliveryTerms: quote.delivery_terms ?? "",
          notes: quote.notes ?? "",
          footer: quote.footer ?? "",
          discount: Number(quote.discount_amount) > 0 ? String(quote.discount_amount) : "",
          items: draftItems,
        }}
      />
    </div>
  );
}
