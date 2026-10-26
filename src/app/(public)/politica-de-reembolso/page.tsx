import type { Metadata } from "next";
import { publicOpenGraph, siteConfig } from "@/config/site";
import { LegalDocumentView } from "@/components/legal/legal-document-view";
import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteHeader } from "@/components/marketing/site-header";
import { getLegalDocumentHash, getRefundPolicyDocument } from "@/lib/legal/documents";

const doc = getRefundPolicyDocument();

export const metadata: Metadata = {
  title: "Política de Reembolso e Cancelamento",
  description: "Como cancelar, desistir em até 7 dias (art. 49 do CDC) e receber o reembolso do Prime Ges.",
  alternates: { canonical: `${siteConfig.url}/politica-de-reembolso` },
  openGraph: publicOpenGraph("/politica-de-reembolso"),
};

export default function RefundPolicyPage() {
  return (
    <>
      <SiteHeader isHome={false} />
      <main id="conteudo" tabIndex={-1} className="outline-none">
        <LegalDocumentView doc={doc} hash={getLegalDocumentHash("TERMS_OF_USE")} />
      </main>
      <SiteFooter />
    </>
  );
}
