import type { Metadata } from "next";
import QRCode from "qrcode";
import { formatDateTime } from "@/lib/format";
import Link from "next/link";
import { notFound } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getCurrentCompany } from "@/lib/companies/queries";
import { getSubscriptionPaymentById } from "@/lib/billing/queries";
import { CopyPixButton } from "@/components/app/copy-pix-button";
import { PaymentStatusPoller } from "@/components/app/payment-status-poller";
import { CardCheckout } from "@/components/app/card-checkout";
import { cardCheckoutConfig } from "@/lib/syncpay/client";
import { buildCardIframeUrl, siteOrigin } from "@/lib/billing/buyer";
import { siteConfig } from "@/config/site";

export const metadata: Metadata = {
  title: "Pagamento",
};

const CURRENCY_FORMATTER = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

/** QR Code do Pix gerado AQUI a partir do "copia e cola" (a SyncPay devolve só o código, não a imagem). */
async function pixQrDataUrl(code: string): Promise<string | null> {
  try {
    return await QRCode.toDataURL(code, { errorCorrectionLevel: "M", margin: 1, width: 360 });
  } catch {
    return null;
  }
}

export default async function PaymentPage({ params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = await paramsPromise;
  const current = (await getCurrentCompany())!;
  const payment = await getSubscriptionPaymentById(current.company.id, params.id);

  if (!payment) {
    notFound();
  }

  const isCard = payment.charge_method === "card";
  const open = payment.status === "pending";
  const showPix = !isCard && open;

  const qrSrc = showPix ? (payment.pix_qr_code_url ?? (payment.pix_qr_code_text ? await pixQrDataUrl(payment.pix_qr_code_text) : null)) : null;

  // URL do iFrame de cartão montada no SERVIDOR com o valor do pagamento salvo (nunca do navegador)
  const card = cardCheckoutConfig();
  const origin = siteOrigin(siteConfig.url);
  const iframeUrl = isCard && open && card.publicKey && origin ? buildCardIframeUrl({ publicKey: card.publicKey, amountReais: Number(payment.amount), parentOrigin: origin }) : null;

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6 px-4 py-6 sm:px-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{isCard ? "Pagamento com cartão" : "Pagamento via Pix"}</h1>
        <p className="text-sm text-muted-foreground">{payment.plan_name}</p>
      </div>

      <div className="flex flex-col items-center gap-4 rounded-lg border border-border bg-card p-6 text-center shadow-soft">
        <p className="text-3xl font-semibold tracking-tight text-foreground">{CURRENCY_FORMATTER.format(Number(payment.amount))}</p>

        {qrSrc && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={qrSrc} alt="QR Code Pix" className="h-56 w-56 rounded-md border border-border" />
        )}

        {showPix && payment.pix_qr_code_text && (
          <div className="w-full">
            <p className="mb-1 text-xs text-muted-foreground">Pix Copia e Cola</p>
            <p className="break-all rounded-md bg-secondary px-3 py-2 text-left text-xs text-foreground">{payment.pix_qr_code_text}</p>
          </div>
        )}

        {showPix && payment.pix_qr_code_text && <CopyPixButton code={payment.pix_qr_code_text} />}

        {isCard && open && iframeUrl && <CardCheckout paymentId={payment.id} iframeUrl={iframeUrl} alreadySubmitted={payment.card_submitted_at !== null} />}

        {isCard && open && !iframeUrl && (
          <p className="text-sm text-muted-foreground">O pagamento por cartão não está disponível no momento. Volte aos planos e escolha o Pix.</p>
        )}

        <PaymentStatusPoller paymentId={payment.id} initialStatus={payment.status} method={isCard ? "card" : "pix"} />

        <p className="text-xs text-muted-foreground">Criado em {formatDateTime(payment.created_at)}</p>

        {(payment.status === "failed" || payment.status === "expired" || payment.status === "cancelled") && (
          <Link href="/app/assinatura/planos" className={cn(buttonVariants({ variant: "outline" }), "w-full")}>
            {isCard ? "Tentar de novo" : "Gerar novo Pix"}
          </Link>
        )}
      </div>
    </div>
  );
}
