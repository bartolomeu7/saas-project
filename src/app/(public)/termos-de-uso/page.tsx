import type { Metadata } from "next";
import { siteConfig } from "@/config/site";
import { LegalDocumentView } from "@/components/legal/legal-document-view";
import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteHeader } from "@/components/marketing/site-header";
import { getLegalDocument, getLegalDocumentHash } from "@/lib/legal/documents";

const doc = getLegalDocument("TERMS_OF_USE");

export const metadata: Metadata = {
  title: "Termos de Uso",
  description: "Termos de Uso do Prime Ges: conta, planos e pagamento, uso permitido, responsabilidades e encerramento.",
  alternates: { canonical: `${siteConfig.url}/termos-de-uso` },
};

export default function TermsOfUsePage() {
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
