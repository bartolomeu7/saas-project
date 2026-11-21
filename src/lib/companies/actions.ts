"use server";

import { redirect } from "next/navigation";
import { createSessionClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { AUTH_BACKEND_MESSAGES, AuthBackendError } from "@/lib/auth/token-claims";
import { ACCOUNT_BLOCKED_MESSAGE, AccountInactiveError } from "@/lib/auth/account-status";
import { createCompanySchema } from "@/lib/validations/company";
import { companyProfileSchema, normalizeCompanyProfile, quoteDefaultsSchema } from "@/lib/validations/company-profile";
import { checkLogoBytes } from "@/lib/validations/company-logo";
import type { ActionResult } from "@/lib/auth/actions";
import { revalidatePath } from "next/cache";
import {
  authorizeTrialSignup,
  TRIAL_ALREADY_USED_MESSAGE,
  TRIAL_IP_LIMIT_MESSAGE,
  TRIAL_UNAVAILABLE_MESSAGE,
} from "@/lib/security/trial-signup";

/**
 * Cria a empresa do usuário autenticado e o torna owner, através da
 * função de banco `create_company_with_owner` (security definer).
 *
 * Nenhum user_id, role ou company_id é aceito do formulário — a função
 * do banco resolve tudo a partir da sessão autenticada
 * (public.current_profile_user_id(), derivado do JWT do Clerk).
 */
export async function createCompanyAction(
  _prevState: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const parsed = createCompanySchema.safeParse({
    name: formData.get("name"),
    businessType: formData.get("businessType"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const supabase = await createSessionClient();

  let user;
  try {
    user = await getCurrentUser();
  } catch (error) {
    // Conta inativa/suspensa não conclui o onboarding nem cria empresa.
    if (error instanceof AccountInactiveError) {
      return { error: ACCOUNT_BLOCKED_MESSAGE, code: "ACCOUNT_BLOCKED" };
    }
    // Falha do Supabase ao resolver a identidade não é sessão expirada.
    if (error instanceof AuthBackendError) {
      return { error: AUTH_BACKEND_MESSAGES[error.code], code: error.code };
    }
    throw error;
  }

  if (!user) {
    return { error: "Sessão expirada. Faça login novamente." };
  }

  // Antifraude do teste grátis (no servidor, antes de conceder): registra de forma atômica se esta conexão ainda pode
  // receber o teste. Negado/indisponível NÃO impede a criação da empresa — só a concessão do teste (o usuário pode
  // assinar um plano ou falar com o suporte). O banco só concede o teste com esta autorização.
  await authorizeTrialSignup(user.id);

  const { error } = await supabase.rpc("create_company_with_owner", {
    p_name: parsed.data.name,
    p_business_type: parsed.data.businessType,
  });

  if (error) {
    return {
      error: "Não foi possível criar a empresa. Tente novamente.",
    };
  }

  redirect("/app");
}

/**
 * Mensagens do banco que são texto curado em português (raise exception de update_own_company). Qualquer outra coisa
 * (permissão do Postgres, rede, constraint) vira a mensagem genérica: nunca vaza detalhe interno.
 */
const COMPANY_EDIT_SAFE_MESSAGES = [
  "Apenas o proprietário ou um administrador",
  "Informe o nome da empresa.",
  "O nome da empresa pode ter no máximo",
  "Selecione o segmento da empresa.",
  "Nenhuma empresa encontrada.",
  "Usuário não autenticado.",
];

/**
 * Proprietário ou administrador da empresa altera nome e segmento. Nada de identidade vem do formulário: a função do
 * banco `update_own_company` resolve a empresa e o papel a partir da sessão (JWT do Clerk), recusa funcionário, não
 * mexe em status/plano e audita a mudança.
 */
export async function updateOwnCompanyAction(
  _prevState: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const parsed = createCompanySchema.safeParse({
    name: formData.get("name"),
    businessType: formData.get("businessType"),
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { error: issue?.message ?? "Dados inválidos.", field: issue?.path[0] === "businessType" ? "businessType" : "name" };
  }

  const supabase = await createSessionClient();
  const { error } = await supabase.rpc("update_own_company", {
    p_name: parsed.data.name,
    p_business_type: parsed.data.businessType,
  });

  if (error) {
    const known = COMPANY_EDIT_SAFE_MESSAGES.some((prefix) => error.message.startsWith(prefix));
    if (!known) console.error("[company] update_own_company() falhou:", error.message);
    return { error: known ? error.message : "Não foi possível salvar agora. Tente novamente." };
  }

  // O nome aparece no menu lateral (layout) e em Configurações.
  revalidatePath("/app", "layout");
  return { success: "Dados da empresa atualizados." };
}

/**
 * Pedido de teste grátis por quem JÁ tem empresa mas ainda não recebeu o teste (negado antes por limite de conexão, ou a
 * autorização estava indisponível). Repete a MESMA regra do cadastro: o servidor autoriza (IP confiável -> HMAC, janela,
 * limite, auditoria) e só então o banco concede, uma única vez, à empresa do dono (claim_free_trial). Nada vem do cliente.
 */
export async function requestFreeTrialAction(): Promise<ActionResult> {
  let user;
  try {
    user = await getCurrentUser();
  } catch (error) {
    if (error instanceof AccountInactiveError) return { error: ACCOUNT_BLOCKED_MESSAGE, code: "ACCOUNT_BLOCKED" };
    if (error instanceof AuthBackendError) return { error: AUTH_BACKEND_MESSAGES[error.code], code: error.code };
    throw error;
  }
  if (!user) return { error: "Sessão expirada. Faça login novamente." };

  const authorization = await authorizeTrialSignup(user.id);
  if (!authorization.allowed) {
    if (authorization.reason === "ip_limit") return { error: TRIAL_IP_LIMIT_MESSAGE, code: "TRIAL_IP_LIMIT" };
    if (authorization.reason === "trial_already_used") return { error: TRIAL_ALREADY_USED_MESSAGE, code: "TRIAL_ALREADY_USED" };
    return { error: TRIAL_UNAVAILABLE_MESSAGE, code: "TRIAL_UNAVAILABLE" };
  }

  const supabase = (await createSessionClient()) as unknown as {
    rpc(fn: "claim_free_trial"): Promise<{ data: { granted?: boolean; reason?: string } | null; error: { message: string } | null }>;
  };
  const { data, error } = await supabase.rpc("claim_free_trial");
  if (error || !data) {
    console.error("[trial] claim_free_trial() falhou:", error?.message ?? "sem resposta");
    return { error: TRIAL_UNAVAILABLE_MESSAGE, code: "TRIAL_UNAVAILABLE" };
  }
  if (data.granted === true) {
    revalidatePath("/app", "layout");
    return { success: "Teste grátis liberado. Aproveite!" };
  }
  switch (data.reason) {
    case "already_used":
      return { error: TRIAL_ALREADY_USED_MESSAGE, code: "TRIAL_ALREADY_USED" };
    case "has_subscription":
      return { error: "Sua empresa já possui uma assinatura; o teste grátis não se aplica.", code: "TRIAL_HAS_SUBSCRIPTION" };
    case "no_company":
      return { error: "Somente o proprietário da empresa pode solicitar o teste grátis.", code: "TRIAL_NOT_OWNER" };
    default:
      return { error: TRIAL_UNAVAILABLE_MESSAGE, code: "TRIAL_UNAVAILABLE" };
  }
}

/**
 * Mensagens curadas do banco (raise exception das funções da Fase 0 do Orçamento). Qualquer outra coisa vira a mensagem
 * genérica: nunca vaza detalhe interno.
 */
const PROFILE_SAFE_MESSAGES = [
  "Apenas o proprietário ou um administrador",
  "Nenhuma empresa encontrada.",
  "Usuário não autenticado.",
  "UF inválida",
  "Informe um e-mail válido.",
  "CEP inválido",
  "O site deve começar",
  "Use uma imagem",
  "Imagem inválida",
  "O arquivo não é uma imagem",
  "A validade padrão",
  "As condições de pagamento",
  "O rodapé",
];

function profileErrorMessage(error: { message: string }, fallback: string): string {
  const known = PROFILE_SAFE_MESSAGES.some((prefix) => error.message.startsWith(prefix));
  if (!known) console.error("[company] função de cadastro falhou:", error.message);
  return known ? error.message : fallback;
}

// As funções novas ainda não constam nos tipos gerados do banco: a chamada passa por um tipo mínimo.
type LooseRpc = { rpc(fn: string, args?: Record<string, unknown>): Promise<{ error: { message: string } | null }> };

/** Dados cadastrais da empresa (razão social, documento, contato e endereço). Dono ou administrador; o banco confere o papel. */
export async function updateCompanyProfileAction(_prevState: ActionResult, formData: FormData): Promise<ActionResult> {
  const keys = ["legalName", "document", "phone", "whatsapp", "email", "website", "postalCode", "address", "addressNumber", "complement", "neighborhood", "city", "state"] as const;
  const raw: Record<string, FormDataEntryValue | null> = {};
  for (const key of keys) raw[key] = formData.get(key);
  const parsed = companyProfileSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { error: issue?.message ?? "Dados inválidos.", field: typeof issue?.path[0] === "string" ? String(issue.path[0]) : undefined };
  }
  const data = normalizeCompanyProfile(parsed.data);

  const supabase = (await createSessionClient()) as unknown as LooseRpc;
  const { error } = await supabase.rpc("update_company_profile", {
    p_legal_name: data.legalName,
    p_document: data.document,
    p_phone: data.phone,
    p_whatsapp: data.whatsapp,
    p_email: data.email,
    p_website: data.website,
    p_postal_code: data.postalCode,
    p_address: data.address,
    p_address_number: data.addressNumber,
    p_complement: data.complement,
    p_neighborhood: data.neighborhood,
    p_city: data.city,
    p_state: data.state,
  });
  if (error) return { error: profileErrorMessage(error, "Não foi possível salvar agora. Tente novamente.") };

  revalidatePath("/app/configuracoes/empresa");
  return { success: "Dados da empresa salvos." };
}

/** Logo da empresa: PNG, JPG ou WEBP de até 512 KB. O tipo é conferido pelo conteúdo do arquivo, nunca pelo nome. */
export async function uploadCompanyLogoAction(_prevState: ActionResult, formData: FormData): Promise<ActionResult> {
  const file = formData.get("logo");
  if (!(file instanceof File) || file.size === 0) return { error: "Escolha uma imagem para o logo." };
  if (file.size > 600 * 1024) return { error: "A imagem é grande demais. Use uma de até 512 KB." };

  const bytes = new Uint8Array(await file.arrayBuffer());
  const check = checkLogoBytes(bytes);
  if (!check.ok) return { error: check.error };

  const supabase = (await createSessionClient()) as unknown as LooseRpc;
  const { error } = await supabase.rpc("set_company_logo", {
    p_content_type: check.contentType,
    p_data_base64: Buffer.from(bytes).toString("base64"),
  });
  if (error) return { error: profileErrorMessage(error, "Não foi possível salvar o logo agora. Tente novamente.") };

  revalidatePath("/app/configuracoes/empresa");
  return { success: "Logo atualizado." };
}

export async function removeCompanyLogoAction(): Promise<ActionResult> {
  const supabase = (await createSessionClient()) as unknown as LooseRpc;
  const { error } = await supabase.rpc("remove_company_logo");
  if (error) return { error: profileErrorMessage(error, "Não foi possível remover o logo agora. Tente novamente.") };

  revalidatePath("/app/configuracoes/empresa");
  return { success: "Logo removido." };
}

/** Padrões dos orçamentos: validade, condições de pagamento e rodapé do PDF. */
export async function updateQuoteDefaultsAction(_prevState: ActionResult, formData: FormData): Promise<ActionResult> {
  const parsed = quoteDefaultsSchema.safeParse({
    validityDays: formData.get("validityDays"),
    paymentTerms: formData.get("paymentTerms"),
    footer: formData.get("footer"),
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { error: issue?.message ?? "Dados inválidos.", field: typeof issue?.path[0] === "string" ? String(issue.path[0]) : undefined };
  }

  const supabase = (await createSessionClient()) as unknown as LooseRpc;
  const { error } = await supabase.rpc("update_company_quote_defaults", {
    p_validity_days: parsed.data.validityDays,
    p_payment_terms: parsed.data.paymentTerms,
    p_footer: parsed.data.footer,
  });
  if (error) return { error: profileErrorMessage(error, "Não foi possível salvar agora. Tente novamente.") };

  revalidatePath("/app/configuracoes/empresa");
  return { success: "Padrões dos orçamentos salvos." };
}
