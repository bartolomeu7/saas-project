import "server-only";

import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { createClerkSupabaseClient } from "@/lib/supabase/clerk-client";
import { getLegalDocumentHash, getLegalDocument } from "@/lib/legal/documents";

/**
 * Acesso ao consentimento legal (somente servidor). Toda decisão é do banco: as RPCs
 * (supabase/migrations/20261010000000_legal_consent.sql) identificam o usuário pelo JWT do Clerk,
 * validam a versão vigente e gravam com o relógio do servidor. Nada aqui confia em valor vindo
 * do navegador.
 */

type RpcError = { message: string } | null;
type RpcResult<T> = Promise<{ data: T | null; error: RpcError }>;

interface PublishedRow {
  document_type: string;
  version: string;
  effective_at: string;
  content_hash: string;
}

interface ConsentStatus {
  complete: boolean;
  pending: PublishedRow[];
}

interface HistoryRow {
  consent_type: string;
  document_type: string;
  version: string;
  document_hash: string;
  granted: boolean;
  granted_at: string;
  context: string;
}

// As RPCs novas ainda não existem no types/supabase.ts gerado: cast local e pontual (mesmo padrão
// de clerk-session.ts), sem alterar o gerador.
interface LegalRpcClient {
  rpc(fn: "get_current_legal_documents"): RpcResult<PublishedRow[]>;
  rpc(fn: "get_my_legal_consent_status"): RpcResult<ConsentStatus>;
  rpc(fn: "get_my_legal_consent_history"): RpcResult<HistoryRow[]>;
  rpc(
    fn: "record_legal_consent",
    args: { p_terms_version: string; p_privacy_version: string; p_context: string }
  ): RpcResult<{ terms_version: string; privacy_version: string; recorded: number }>;
}

function client(): LegalRpcClient {
  return createClerkSupabaseClient() as unknown as LegalRpcClient;
}

export interface PublishedLegalVersions {
  terms: { version: string; hash: string };
  privacy: { version: string; hash: string };
  /**
   * OK: o texto do repositório é exatamente o publicado no banco (mesma versão e mesmo hash).
   * MISMATCH: alguém mudou o texto sem publicar nova versão (ou o banco está defasado). Nesse
   * caso NENHUM aceite deve ser gravado: não seria prova do texto que o usuário viu.
   */
  integrity: "OK" | "MISMATCH";
}

/** Versões vigentes segundo o banco (leitura pública). Null se indisponível. */
export async function getPublishedLegalVersions(): Promise<PublishedLegalVersions | null> {
  const { data, error } = await client().rpc("get_current_legal_documents");
  if (error || !data) return null;

  const terms = data.find((row) => row.document_type === "TERMS_OF_USE");
  const privacy = data.find((row) => row.document_type === "PRIVACY_POLICY");
  if (!terms || !privacy) return null;

  const codeTerms = getLegalDocument("TERMS_OF_USE").version;
  const codePrivacy = getLegalDocument("PRIVACY_POLICY").version;
  const integrity =
    terms.version === codeTerms &&
    privacy.version === codePrivacy &&
    terms.content_hash === getLegalDocumentHash("TERMS_OF_USE") &&
    privacy.content_hash === getLegalDocumentHash("PRIVACY_POLICY")
      ? "OK"
      : "MISMATCH";

  return {
    terms: { version: terms.version, hash: terms.content_hash },
    privacy: { version: privacy.version, hash: privacy.content_hash },
    integrity,
  };
}

/** Status do usuário atual (exige sessão). Lança erro se o banco não responder (fail closed). */
export async function getMyConsentStatus(): Promise<ConsentStatus> {
  // auth() sinaliza ao Next que a rota depende da sessão (renderização dinâmica). Sem isto, o erro
  // de "uso dinâmico" ficaria escondido dentro do client do Supabase e quebraria o pré-render.
  await auth();
  const { data, error } = await client().rpc("get_my_legal_consent_status");
  if (error || !data) {
    throw new Error(`Verificação de consentimento legal falhou: ${error?.message ?? "sem dados"}`);
  }
  return data;
}

/** True se o usuário já tem algum registro de consentimento (para distinguir reaceite de 1º aceite). */
export async function hasConsentHistory(): Promise<boolean> {
  const { data, error } = await client().rpc("get_my_legal_consent_history");
  if (error) throw new Error(`Leitura do histórico de consentimento falhou: ${error.message}`);
  return (data?.length ?? 0) > 0;
}

export type ConsentContext = "SIGNUP" | "REACCEPTANCE" | "ACCEPTANCE_GATE";

export async function recordMyConsent(input: {
  termsVersion: string;
  privacyVersion: string;
  context: ConsentContext;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const { error } = await client().rpc("record_legal_consent", {
    p_terms_version: input.termsVersion,
    p_privacy_version: input.privacyVersion,
    p_context: input.context,
  });
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}

/**
 * Guarda de layout: usuário autenticado sem consentimento vigente vai para /aceite-termos.
 * Fail closed: se o banco não responder, lança (a UI de erro é exibida) em vez de liberar o acesso.
 */
export async function requireLegalConsent(): Promise<void> {
  const status = await getMyConsentStatus();
  if (!status.complete) redirect("/aceite-termos");
}

export { safeAfterConsentPath } from "@/lib/legal/safe-path";
