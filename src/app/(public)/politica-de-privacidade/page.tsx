import type { Metadata } from "next";
import { siteConfig } from "@/config/site";
import { LegalDocumentView } from "@/components/legal/legal-document-view";
import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteHeader } from "@/components/marketing/site-header";
import { getLegalDocument, getLegalDocumentHash } from "@/lib/legal/documents";

const doc = getLegalDocument("PRIVACY_POLICY");

export const metadata: Metadata = {
  title: "Política de Privacidade",
  description: "Como o Prime Ges trata dados pessoais: quais dados, para quê, com quem compartilha, por quanto tempo e seus direitos.",
  alternates: { canonical: `${siteConfig.url}/politica-de-privacidade` },
};

export default function PrivacyPolicyPage() {
  return (
    <>
      <SiteHeader isHome={false} />
      <main id="conteudo" tabIndex={-1} className="outline-none">
        <LegalDocumentView doc={doc} hash={getLegalDocumentHash("PRIVACY_POLICY")} />
      </main>
      <SiteFooter />
    </>
  );
}
