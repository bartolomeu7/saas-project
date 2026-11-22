import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getCurrentCompany } from "@/lib/companies/queries";
import { getCurrentUser } from "@/lib/auth/session";
import { getPlanById } from "@/lib/billing/queries";
import { CheckoutForm } from "@/components/app/checkout-form";
import { cardAvailable } from "@/lib/billing/gateway";
import { buildBuyer } from "@/lib/billing/buyer";
import { documentProblem, formatDocument, formatPhone, phoneProblem } from "@/lib/billing/checkout-profile";

export const metadata: Metadata = {
  title: "Finalizar assinatura",
};

const CURRENCY = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Passo entre "Assinar" e o QR Code: resume o plano e, se faltar CPF/CNPJ ou telefone no cadastro da empresa (o gateway
 * exige), já mostra os campos aqui. Ao confirmar, salva no cadastro e gera o pagamento. O preço é lido do plano no banco.
 */
export default async function CheckoutPage({
  params: paramsPromise,
  searchParams: searchParamsPromise,
}: {
  params: Promise<{ planId: string }>;
  searchParams: Promise<{ method?: string }>;
}) {
  const { planId } = await paramsPromise;
  const { method } = await searchParamsPromise;
  if (!UUID.test(planId)) notFound();

  const [current, user, plan] = await Promise.all([getCurrentCompany(), getCurrentUser(), getPlanById(planId)]);
  if (!current || !user) redirect("/login");

  const billable =
    plan !== null &&
    plan.status === "active" &&
    !plan.trial &&
    !plan.lifetime &&
    plan.code !== "CUSTOM" &&
    plan.price !== null &&
    Number(plan.price) > 0 &&
    plan.access_duration_days !== null;
  if (!plan || !billable) {
    return (
      <div className="mx-auto flex max-w-lg flex-col gap-4 px-4 py-6 sm:px-6">
        <h1 className="text-2xl font-semibold tracking-tight">Plano indisponível</h1>
        <p className="text-sm text-muted-foreground">Este plano não está disponível para contratação agora. Escolha outro na lista de planos.</p>
        <Link href="/app/assinatura/planos" className={cn(buttonVariants({ variant: "outline" }))}>
          Ver planos
        </Link>
      </div>
    );
  }

  const canPay = current.role === "owner" || current.role === "admin";
  const company = current.company;
  const cardEnabled = await cardAvailable();
  const initialMethod = method === "card" && cardEnabled ? "card" : "pix";

  // o que ainda falta para o gateway aceitar a cobrança (mesma regra do servidor)
  const buyer = buildBuyer({
    companyName: company.name,
    legalName: company.legal_name,
    document: company.document,
    phone: company.phone,
    whatsapp: company.whatsapp,
    companyEmail: company.email,
    userEmail: user.email,
  });
  const missing = buyer.ok ? [] : buyer.missing;
  const needsDocument = missing.includes("documento");
  const needsPhone = missing.includes("telefone");
  const noEmail = missing.includes("e-mail");

  const days = plan.access_duration_days ?? 0;

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6 px-4 py-6 sm:px-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Finalizar assinatura</h1>
        <p className="text-sm text-muted-foreground">Confira o plano e os dados para gerar o pagamento.</p>
      </div>

      <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-5 shadow-soft">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Plano escolhido</p>
          <h2 className="text-lg font-semibold text-foreground">{plan.name}</h2>
          {plan.description && <p className="mt-1 text-sm text-muted-foreground">{plan.description}</p>}
        </div>
        <div className="flex items-end justify-between border-t border-border pt-3">
          <p className="text-sm text-muted-foreground">
            {days} {days === 1 ? "dia" : "dias"} de acesso
          </p>
          <p className="text-2xl font-semibold tracking-tight text-foreground">{CURRENCY.format(Number(plan.price))}</p>
        </div>
        <p className="text-xs text-muted-foreground">Pagamento único por Pix. Quando o banco confirmar, o acesso é liberado automaticamente e o prazo é somado ao que você já tem.</p>
      </div>

      {!canPay ? (
        <p className="rounded-md border border-border bg-secondary px-3 py-2 text-sm text-muted-foreground" role="status">
          Apenas o proprietário ou administradores podem contratar ou renovar o plano.
        </p>
      ) : noEmail ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive" role="alert">
          Não encontramos um e-mail válido na sua conta. Informe um e-mail em Configurações → Empresa para continuar.
        </p>
      ) : (
        <CheckoutForm
          planId={plan.id}
          cardEnabled={cardEnabled}
          initialMethod={initialMethod}
          needsDocument={needsDocument}
          needsPhone={needsPhone}
          // preenche o que já existe (mesmo inválido) para a pessoa só corrigir
          defaultDocument={documentProblem(company.document) === null ? formatDocument(company.document) : (company.document ?? "")}
          defaultPhone={phoneProblem(company.phone ?? company.whatsapp) === null ? formatPhone(company.phone ?? company.whatsapp) : (company.phone ?? "")}
        />
      )}

      <Link href="/app/assinatura/planos" className="text-center text-sm text-muted-foreground underline-offset-4 hover:underline">
        ← Voltar para os planos
      </Link>
    </div>
  );
}
