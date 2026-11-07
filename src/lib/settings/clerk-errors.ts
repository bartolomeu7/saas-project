/**
 * Mensagens em português para os erros do Clerk nas telas de conta (perfil e segurança).
 *
 * Função pura (sem React e sem importar o Clerk) para poder ser testada em Node: reconhece o formato de erro da API do
 * Clerk (`{ errors: [{ code, message, longMessage }] }`) sem depender da classe. Códigos conhecidos viram texto curado;
 * qualquer outro cai na mensagem genérica — nunca mostramos texto técnico cru, nem dados da conta.
 */

const MESSAGES: Record<string, string> = {
  form_password_incorrect: "A senha atual está incorreta.",
  form_password_pwned: "Essa senha apareceu em vazamentos de dados. Escolha outra, mais segura.",
  form_password_length_too_short: "A senha é curta demais. Use pelo menos 15 caracteres.",
  form_password_not_strong_enough: "A senha está fraca. Misture letras, números e símbolos.",
  form_password_size_in_bytes_exceeded: "A senha é longa demais.",
  form_password_validation_failed: "A senha não é aceita. Tente outra.",
  form_code_incorrect: "O código está incorreto. Confira e tente de novo.",
  incorrect_code: "O código está incorreto. Confira e tente de novo.",
  verification_expired: "O código expirou. Peça um novo.",
  verification_failed: "Não foi possível verificar o código. Peça um novo.",
  too_many_requests: "Muitas tentativas. Aguarde um pouco e tente de novo.",
  form_identifier_exists: "Já existe uma conta com esse dado.",
  form_param_format_invalid: "O formato informado não é válido.",
  form_param_nil: "Preencha o campo para continuar.",
  form_email_address_blocked: "Esse e-mail não pode ser usado.",
  form_param_value_invalid: "O valor informado não é válido.",
  image_too_large: "A imagem é grande demais. Use uma de até 10 MB.",
  file_size_exceeded: "A imagem é grande demais. Use uma de até 10 MB.",
  form_phone_number_invalid: "O número de telefone não é válido.",
  phone_number_invalid: "O número de telefone não é válido.",
  feature_not_enabled: "Este recurso ainda não está disponível para a sua conta.",
  not_allowed_access: "Esta ação não é permitida para a sua conta.",
  session_exists: "Você já está com a sessão aberta.",
  reverification_failed: "Não foi possível confirmar a sua identidade. Tente de novo.",
  reverification_cancelled: "Confirmação cancelada. Nada foi alterado.",
  additional_verification_required: "É preciso confirmar a sua identidade para continuar.",
  action_not_allowed: "Esta ação não é permitida para a sua conta.",
  totp_already_enabled: "A verificação em duas etapas já está ativa.",
  mfa_not_enabled: "A verificação em duas etapas não está ativa.",
};

export const GENERIC_CLERK_ERROR = "Não foi possível concluir agora. Tente novamente em instantes.";

interface ClerkLikeError {
  code?: unknown;
  longMessage?: unknown;
  message?: unknown;
}

function firstClerkError(error: unknown): ClerkLikeError | null {
  if (!error || typeof error !== "object") return null;
  const list = (error as { errors?: unknown }).errors;
  if (Array.isArray(list) && list.length > 0 && list[0] && typeof list[0] === "object") return list[0] as ClerkLikeError;
  return null;
}

/** Código do primeiro erro do Clerk (ex.: "form_password_pwned"), ou null quando não for um erro da API do Clerk. */
export function clerkErrorCode(error: unknown): string | null {
  const first = firstClerkError(error);
  return first && typeof first.code === "string" ? first.code : null;
}

/** Texto para mostrar à pessoa. */
export function describeClerkError(error: unknown): string {
  const code = clerkErrorCode(error);
  if (code && MESSAGES[code]) return MESSAGES[code];
  return GENERIC_CLERK_ERROR;
}
