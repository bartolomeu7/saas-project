/**
 * Integridade entre o texto versionado no repositório e a versão vigente publicada no banco.
 * Módulo puro (sem I/O): só compara versão e hash dos dois documentos.
 *
 * OK        => o texto que o usuário vê é exatamente o publicado (mesma versão e mesmo SHA-256).
 * MISMATCH  => texto alterado sem nova versão, versão vigente diferente da do repositório (ex.: nova versão
 *              publicada no banco antes do deploy) ou hash diferente. NENHUM aceite deve ser gravado.
 * UNAVAILABLE => faltou um dos dois documentos vigentes no banco.
 */
export interface PublishedRow {
  document_type: string;
  version: string;
  content_hash: string;
}

export interface CodeDocument {
  version: string;
  hash: string;
}

export type LegalIntegrity = "OK" | "MISMATCH" | "UNAVAILABLE";

export function evaluateLegalIntegrity(
  rows: readonly PublishedRow[] | null | undefined,
  code: { terms: CodeDocument; privacy: CodeDocument }
): LegalIntegrity {
  const terms = rows?.find((row) => row.document_type === "TERMS_OF_USE");
  const privacy = rows?.find((row) => row.document_type === "PRIVACY_POLICY");
  if (!terms || !privacy) return "UNAVAILABLE";

  return terms.version === code.terms.version &&
    privacy.version === code.privacy.version &&
    terms.content_hash === code.terms.hash &&
    privacy.content_hash === code.privacy.hash
    ? "OK"
    : "MISMATCH";
}
