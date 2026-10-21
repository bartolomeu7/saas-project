import type { MetadataRoute } from "next";
import type { LegalDocument } from "@/content/legal/types";
import { siteConfig } from "@/config/site";
import {
  findLegalMarkers,
  getDataRightsDocument,
  getLegalDocument,
  getRefundPolicyDocument,
} from "@/lib/legal/documents";
import { buildSitemapEntries, type SitemapPageInput } from "@/lib/seo/sitemap-entries";

/**
 * Páginas públicas que devem ser indexadas. Regras (ver src/lib/seo/sitemap-entries.ts):
 *  - Só URLs canônicas e absolutas, na origem validada de siteConfig.url.
 *  - A home não tem data de alteração confiável (o conteúdo muda por código e pelo catálogo de planos): sem `lastModified`.
 *  - Páginas legais usam a data de vigência da versão publicada como `lastModified` (data real de alteração do texto) e
 *    SÓ entram enquanto o texto não tiver marcadores pendentes ([BLOCKED]/[VALIDAÇÃO]): conteúdo provisório não é
 *    anunciado ao Google. Quando a `rc.4` resolver os dados da empresa, entram sozinhas.
 *  - Login, cadastro, conta excluída, áreas privadas, administração e APIs ficam de fora.
 */
function legalPage(path: string, doc: LegalDocument): SitemapPageInput {
  return { path, lastModified: doc.effectiveAt, indexable: findLegalMarkers(doc).length === 0 };
}

export default function sitemap(): MetadataRoute.Sitemap {
  return buildSitemapEntries(siteConfig.url, [
    { path: "/" },
    legalPage("/termos-de-uso", getLegalDocument("TERMS_OF_USE")),
    legalPage("/politica-de-privacidade", getLegalDocument("PRIVACY_POLICY")),
    legalPage("/politica-de-reembolso", getRefundPolicyDocument()),
    legalPage("/direitos-do-titular", getDataRightsDocument()),
  ]);
}
