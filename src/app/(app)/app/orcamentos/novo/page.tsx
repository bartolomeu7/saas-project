import type { Metadata } from "next";
import Link from "next/link";
import { QuoteForm } from "@/components/app/quote-form";
import { getCurrentCompany, getQuoteDefaults } from "@/lib/companies/queries";
import { createQuoteAction } from "@/lib/quotes/actions";
import { loadQuoteFormOptions } from "@/lib/quotes/form-data";
import { addDaysIso } from "@/lib/quotes/rules";
import { todayDateSaoPaulo } from "@/lib/timezone";

export const metadata: Metadata = { title: "Novo orçamento" };

export default async function NewQuotePage() {
  const current = (await getCurrentCompany())!;
  const [options, defaults] = await Promise.all([loadQuoteFormOptions(current.company.id), getQuoteDefaults(current.company.id)]);
  const today = todayDateSaoPaulo();

  return (
    <div className="flex flex-col gap-6 px-4 py-6 sm:px-6">
      <Link href="/app/orcamentos" className="text-sm text-muted-foreground hover:underline">
        ← Voltar para Orçamentos
      </Link>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Novo orçamento</h1>
        <p className="text-sm text-muted-foreground">Ele nasce como rascunho: você revisa, baixa o PDF e só depois marca como enviado.</p>
      </div>
      <QuoteForm
        action={createQuoteAction}
        customers={options.customers}
        products={options.products}
        services={options.services}
        submitLabel="Criar orçamento"
        pendingLabel="Criando orçamento..."
        values={{
          customerId: "",
          customerName: "",
          customerDocument: "",
          customerPhone: "",
          customerEmail: "",
          customerAddress: "",
          title: "",
          issuedOn: today,
          validUntil: addDaysIso(today, defaults.validityDays),
          paymentTerms: defaults.paymentTerms,
          deliveryTerms: "",
          notes: "",
          footer: defaults.footer,
          discount: "",
          items: [],
        }}
      />
    </div>
  );
}
