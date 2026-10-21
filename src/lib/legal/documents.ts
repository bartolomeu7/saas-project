import { termsOfUse } from "@/content/legal/terms-of-use";
import { privacyPolicy } from "@/content/legal/privacy-policy";
import type { LegalDocument, LegalDocumentType } from "@/content/legal/types";
import { hashLegalDocument } from "@/lib/legal/hash";

/** Registro dos documentos publicados (a fonte do texto é src/content/legal). */
export const LEGAL_DOCUMENTS: Record<LegalDocumentType, LegalDocument> = {
  TERMS_OF_USE: termsOfUse,
  PRIVACY_POLICY: privacyPolicy,
};

export const LEGAL_ROUTES: Record<LegalDocumentType, string> = {
  TERMS_OF_USE: "/termos-de-uso",
  PRIVACY_POLICY: "/politica-de-privacidade",
};

export function getLegalDocument(type: LegalDocumentType): LegalDocument {
  return LEGAL_DOCUMENTS[type];
}

/** Hash SHA-256 do texto publicado hoje no repositório (deve bater com legal_document_versions). */
export function getLegalDocumentHash(type: LegalDocumentType): string {
  return hashLegalDocument(LEGAL_DOCUMENTS[type]);
}

const MARKER_PATTERN = /\[(?:BLOCKED|VALIDAÇÃO)[^\]]*\]/g;

/** Marcadores pendentes (dado empresarial ou validação jurídica) ainda presentes no texto. */
export function findLegalMarkers(doc: LegalDocument): string[] {
  const text = doc.sections
    .flatMap((section) => [...section.paragraphs, ...(section.items ?? [])])
    .join("\n");
  return text.match(MARKER_PATTERN) ?? [];
}

/**
 * Página pública que reaproveita seções de um documento aceito (mesma fonte, mesmo hash): a
 * Política de Reembolso é um trecho dos Termos de Uso e a página de Direitos do Titular é um
 * trecho da Política de Privacidade. Evita dois textos que poderiam divergir.
 */
function excerpt(source: LegalDocument, ids: readonly string[], title: string, slug: string, summary: string): LegalDocument {
  const sections = ids.map((id) => {
    const section = source.sections.find((s) => s.id === id);
    if (!section) throw new Error(`Seção "${id}" não existe em ${source.type}.`);
    return section;
  });
  return { ...source, title, slug, summary, sections };
}

export const REFUND_POLICY_SECTION_IDS = ["planos", "cancelamento", "arrependimento", "reembolso-outros", "reembolso-como"] as const;
export const DATA_RIGHTS_SECTION_IDS = [
  "quem-somos",
  "escopo",
  "direitos",
  "direitos-como-exercer",
  "direitos-prazos",
  "direitos-limites",
  "direitos-reclamacao",
] as const;

export function getRefundPolicyDocument(): LegalDocument {
  return excerpt(
    termsOfUse,
    REFUND_POLICY_SECTION_IDS,
    "Política de Reembolso e Cancelamento",
    "politica-de-reembolso",
    "Como cancelar, desistir em até 7 dias e receber o reembolso. Este texto é um trecho dos Termos de Uso, versão " +
      termsOfUse.version +
      "."
  );
}

export function getDataRightsDocument(): LegalDocument {
  return excerpt(
    privacyPolicy,
    DATA_RIGHTS_SECTION_IDS,
    "Direitos do Titular de Dados",
    "direitos-do-titular",
    "Como pedir acesso, correção, eliminação e os demais direitos da LGPD. Este texto é um trecho da Política de Privacidade, versão " +
      privacyPolicy.version +
      "."
  );
}
