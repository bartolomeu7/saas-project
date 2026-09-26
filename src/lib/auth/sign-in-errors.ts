/**
 * Traduz o erro do Supabase Auth (`signInWithPassword`) para uma mensagem
 * útil ao usuário SEM revelar se uma conta existe.
 *
 * O GoTrue só devolve `email_not_confirmed` depois de validar a senha, então
 * essa mensagem não permite enumerar contas — e evita o falso diagnóstico
 * "senha inválida" para quem simplesmente ainda não confirmou o e-mail.
 * Qualquer outro erro (rate limit, indisponibilidade, configuração) também
 * deixa de ser mascarado como "credenciais inválidas".
 */
export interface SignInErrorLike {
  code?: string | null;
  status?: number | null;
}

export interface SignInErrorResult {
  error: string;
  code: "invalid_credentials" | "email_not_confirmed" | "rate_limited" | "unavailable";
}

export function mapSignInError(error: SignInErrorLike): SignInErrorResult {
  if (error.code === "email_not_confirmed") {
    return {
      code: "email_not_confirmed",
      error:
        "Seu e-mail ainda não foi confirmado. Abra o link enviado no cadastro (veja também o spam) ou reenvie a confirmação abaixo.",
    };
  }

  if (error.code === "over_request_rate_limit" || error.status === 429) {
    return {
      code: "rate_limited",
      error: "Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente novamente.",
    };
  }

  if (error.code === "invalid_credentials" || error.status === 400) {
    return { code: "invalid_credentials", error: "E-mail ou senha inválidos." };
  }

  return {
    code: "unavailable",
    error: "Não foi possível entrar agora. Tente novamente em instantes.",
  };
}
