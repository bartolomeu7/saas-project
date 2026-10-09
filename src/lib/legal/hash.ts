import { createHash } from "node:crypto";
import type { LegalDocument } from "../../content/legal/types";

/**
 * Forma CANÔNICA do conteúdo publicado de um documento legal: só o que é texto vigente
 * (tipo, versão, vigência, título e seções), com ordem de campos fixa. O resumo da página
 * não entra. Qualquer mudança no texto muda o hash, o que obriga a publicar nova versão.
 *
 * Este módulo não importa nada do app em tempo de execução (só node:crypto), para os testes
 * do Node poderem carregá-lo diretamente.
 */
export function canonicalLegalContent(doc: LegalDocument): string {
  return JSON.stringify({
    type: doc.type,
    version: doc.version,
    effectiveAt: doc.effectiveAt,
    title: doc.title,
    sections: doc.sections.map((section) => ({
      id: section.id,
      title: section.title,
      paragraphs: section.paragraphs,
      items: section.items ?? [],
    })),
  });
}

/** SHA-256 (hex) do conteúdo canônico. É o valor registrado em legal_document_versions.content_hash. */
export function hashLegalDocument(doc: LegalDocument): string {
  return createHash("sha256").update(canonicalLegalContent(doc), "utf8").digest("hex");
}
