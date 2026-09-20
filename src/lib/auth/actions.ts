"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { siteConfig } from "@/config/site";
import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
} from "@/lib/validations/auth";

export interface ActionResult {
  error?: string;
  success?: string;
}

/**
 * Mensagem de erro genérica para o usuário. Detalhes internos do Supabase
 * nunca são repassados diretamente ao cliente — evita vazar informação
 * sobre a existência ou não de uma conta, estrutura interna, etc.
 */
const GENERIC_AUTH_ERROR =
  "Não foi possível concluir a operação. Verifique os dados e tente novamente.";

/**
 * O middleware guarda em `next` a rota que o usuário tentou acessar antes
 * de ser redirecionado para /login (src/middleware.ts). Só aceitamos um
 * path relativo interno (começa com uma única "/", nunca "//" ou
 * "/\" — que navegadores tratam como protocol-relative — e nunca contém
 * ":") como destino pós-login, para nunca virar um open redirect a partir
 * de um valor de querystring.
 */
function safeNextPath(next: string | null | undefined): string | null {
  if (!next) return null;
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return null;
  if (next.includes(":")) return null;
  return next;
}

/**
 * Cadastro de novo usuário.
 * A criação do registro em public.profiles é feita automaticamente pelo
 * trigger on_auth_user_created (migration 001) — nenhuma lógica de
 * criação de perfil é duplicada aqui.
 */
export async function signUpAction(
  _prevState: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const parsed = registerSchema.safeParse({
    fullName: formData.get("fullName"),
    email: formData.get("email"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? GENERIC_AUTH_ERROR };
  }

  const { fullName, email, password } = parsed.data;
  const supabase = createClient();

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName },
      emailRedirectTo: `${siteConfig.url}/auth/callback?next=/app`,
    },
  });

  if (error) {
    return { error: GENERIC_AUTH_ERROR };
  }

  return {
    success:
      "Cadastro realizado. Verifique seu e-mail para confirmar a conta antes de entrar.",
  };
}

/**
 * Login com e-mail e senha. `next` (rota original antes do redirect para
 * /login feito pelo middleware) é passado via `.bind(null, next)` no
 * componente — por isso é o primeiro parâmetro, antes do par
 * (prevState, formData) que o useFormState exige.
 */
export async function signInAction(
  next: string | null,
  _prevState: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? GENERIC_AUTH_ERROR };
  }

  const supabase = createClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    return { error: "E-mail ou senha inválidos." };
  }

  // Best-effort: profiles.last_login_at existe no schema desde a
  // migration 001 mas nunca era escrito por nenhum código. Falha aqui
  // nunca deve impedir o login — por isso o erro é ignorado de propósito.
  if (data.user) {
    await supabase
      .from("profiles")
      .update({ last_login_at: new Date().toISOString() })
      .eq("user_id", data.user.id);
  }

  redirect(safeNextPath(next) ?? "/app");
}

/** Logout do usuário atual. */
export async function signOutAction(): Promise<void> {
  const supabase = createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

/**
 * Login/cadastro via Google. O trigger on_auth_user_created (migration 001)
 * cria o profile automaticamente, do mesmo jeito que no cadastro por
 * e-mail — nenhuma lógica adicional é necessária para novos usuários.
 *
 * Requer o provedor Google habilitado nas configurações de Auth do
 * Supabase (Client ID/Secret do Google Cloud Console); sem isso, o
 * Supabase retorna erro e o usuário é redirecionado de volta ao login.
 */
export async function signInWithGoogleAction(next: string | null): Promise<void> {
  const supabase = createClient();
  const target = safeNextPath(next) ?? "/app";

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${siteConfig.url}/auth/callback?next=${encodeURIComponent(target)}`,
    },
  });

  if (error || !data.url) {
    redirect("/login?error=google");
  }

  redirect(data.url);
}

/**
 * Início da recuperação de senha: envia e-mail com link para
 * /auth/callback, que troca o código pela sessão e redireciona para
 * /reset-password.
 *
 * A resposta é sempre genérica (não revela se o e-mail existe ou não
 * na base, para não permitir enumeração de contas).
 */
export async function forgotPasswordAction(
  _prevState: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const parsed = forgotPasswordSchema.safeParse({
    email: formData.get("email"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? GENERIC_AUTH_ERROR };
  }

  const supabase = createClient();
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${siteConfig.url}/auth/callback?next=/reset-password`,
  });

  return {
    success:
      "Se este e-mail estiver cadastrado, você receberá um link para redefinir sua senha.",
  };
}

/**
 * Conclusão da recuperação de senha. Só funciona se a sessão atual foi
 * criada pelo fluxo de recuperação por e-mail (link → /auth/callback),
 * nunca por uma sessão comum de usuário já autenticado — do contrário,
 * /reset-password seria a única tela do sistema capaz de trocar a
 * própria senha sem exigir a senha atual, para QUALQUER sessão logada
 * (ex.: um computador compartilhado com sessão esquecida).
 */
export async function resetPasswordAction(
  _prevState: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const parsed = resetPasswordSchema.safeParse({
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? GENERIC_AUTH_ERROR };
  }

  const supabase = createClient();

  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();

  if (claimsError || !claimsData) {
    return {
      error:
        "Link inválido ou expirado. Solicite uma nova recuperação de senha.",
    };
  }

  // amr (Authentication Method Reference) registra COMO esta sessão foi
  // criada. O GoTrue inclui "recovery" só para sessões originadas do link
  // de recuperação de senha (via /auth/callback → exchangeCodeForSession);
  // login normal por senha/Google usa outros métodos ("password"/"oauth").
  // Sem essa checagem, /reset-password trocaria a senha de QUALQUER sessão
  // autenticada, sem exigir a senha atual (ex.: computador compartilhado
  // com sessão esquecida).
  const amr = claimsData.claims.amr as Array<{ method?: string }> | undefined;
  const isRecoverySession = Array.isArray(amr) && amr.some((entry) => entry?.method === "recovery");

  if (!isRecoverySession) {
    return {
      error:
        "Esta ação só pode ser concluída a partir do link enviado por e-mail. Solicite uma nova recuperação de senha.",
    };
  }

  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });

  if (error) {
    return { error: GENERIC_AUTH_ERROR };
  }

  redirect("/app");
}
