/**
 * Modelo dos documentos legais publicados (Termos de Uso e Política de Privacidade).
 *
 * O conteúdo vive no Git (versionado) e é a ÚNICA fonte do texto publicado. O hash
 * (SHA-256 do conteúdo canônico, ver src/lib/legal/hash.ts) é registrado no banco em
 * public.legal_document_versions: assim é possível provar depois exatamente qual texto
 * estava vigente. Texto publicado NUNCA é editado em silêncio: mudou → nova versão.
 */
export type LegalDocumentType = "TERMS_OF_USE" | "PRIVACY_POLICY";

export interface LegalSection {
  /** Âncora estável (usada no índice e em links). */
  id: string;
  title: string;
  paragraphs: string[];
  /** Lista opcional exibida depois dos parágrafos. */
  items?: string[];
}

export interface LegalDocument {
  type: LegalDocumentType;
  /** Rota pública do documento. */
  slug: string;
  title: string;
  /** Versão do texto (muda a cada alteração material). */
  version: string;
  /** Data de vigência (AAAA-MM-DD). */
  effectiveAt: string;
  /** Resumo curto exibido no topo (não faz parte do hash). */
  summary: string;
  sections: LegalSection[];
}

/*
 * Marcadores controlados usados dentro do texto (definidos como literais em cada arquivo de
 * conteúdo e em src/lib/legal/markers.ts, para os arquivos de conteúdo ficarem sem imports
 * em tempo de execução e poderem ser lidos direto pelos testes do Node):
 *   [BLOCKED — DADO EMPRESARIAL NECESSÁRIO]  → dado real da empresa ainda não fornecido
 *   [VALIDAÇÃO JURÍDICA NECESSÁRIA]          → ponto que exige revisão de advogado
 * Nenhum marcador pode chegar a Production sem ser resolvido (há teste que os lista).
 */
