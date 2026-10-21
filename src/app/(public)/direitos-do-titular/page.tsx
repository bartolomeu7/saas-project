import type { Metadata } from "next";
import { siteConfig } from "@/config/site";
import { LegalDocumentView } from "@/components/legal/legal-document-view";
import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteHeader } from "@/components/marketing/site-header";
import { getDataRightsDocument, getLegalDocumentHash } from "@/lib/legal/documents";

const doc = getDataRightsDocument();

export const metadata: Metadata = {
  title: "Direitos do Titular de Dados",
  description: "Como exercer os direitos da LGPD no Prime Ges: acesso, correção, eliminação, portabilidade e outros.",
  alternates: { canonical: `${siteConfig.url}/direitos-do-titular` },
};

export default function DataRightsPage() {
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
