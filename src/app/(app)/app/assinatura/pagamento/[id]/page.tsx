import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getCurrentCompany } from "@/lib/companies/queries";
import { getSubscriptionPaymentById } from "@/lib/billing/queries";
import { CopyPixButton } from "@/components/app/copy-pix-button";
import { PaymentStatusPoller } from "@/components/app/payment-status-poller";

export const metadata: Metadata = {
  title: "Pagamento",
};

const CURRENCY_FORMATTER = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

export default async function PaymentPage({ params }: { params: { id: string } }) {
  const current = (await getCurrentCompany())!;
  const payment = await getSubscriptionPaymentById(current.company.id, params.id);

  if (!payment) {
    notFound();
  }

  const showQr = payment.status === "pending";

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6 px-4 py-6 sm:px-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Pagamento via Pix</h1>
        <p className="text-sm text-muted-foreground">{payment.plan_name}</p>
      </div>

      <div className="flex flex-col items-center gap-4 rounded-lg border border-border bg-card p-6 text-center shadow-soft">
        <p className="text-3xl font-semibold tracking-tight text-foreground">
          {CURRENCY_FORMATTER.format(Number(payment.amount))}
        </p>

        {showQr && payment.pix_qr_code_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={payment.pix_qr_code_url}
            alt="QR Code Pix"
            className="h-56 w-56 rounded-md border border-border"
          />
        )}

        {showQr && payment.pix_qr_code_text && (
          <div className="w-full">
            <p className="mb-1 text-xs text-muted-foreground">Pix Copia e Cola</p>
            <p className="break-all rounded-md bg-secondary px-3 py-2 text-left text-xs text-foreground">
              {payment.pix_qr_code_text}
            </p>
          </div>
        )}

        {showQr && payment.pix_qr_code_text && <CopyPixButton code={payment.pix_qr_code_text} />}

        <PaymentStatusPoller paymentId={payment.id} initialStatus={payment.status} />

        <p className="text-xs text-muted-foreground">
          Criado em {new Date(payment.created_at).toLocaleString("pt-BR")}
        </p>

        {(payment.status === "failed" ||
          payment.status === "expired" ||
          payment.status === "cancelled") && (
          <Link
            href="/app/assinatura/planos"
            className={cn(buttonVariants({ variant: "outline" }), "w-full")}
          >
            Gerar novo Pix
          </Link>
        )}
      </div>
    </div>
  );
}
