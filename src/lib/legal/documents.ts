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
