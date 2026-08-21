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

/** Login com e-mail e senha. */
export async function signInAction(
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
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    return { error: "E-mail ou senha inválidos." };
  }

  redirect("/app");
}

/** Logout do usuário atual. */
export async function signOutAction(): Promise<void> {
  const supabase = createClient();
  await supabase.auth.signOut();
  redirect("/login");
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
 * Conclusão da recuperação de senha. Só funciona se o usuário chegou
 * até aqui através do link de recuperação (que já criou uma sessão
 * temporária via /auth/callback).
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

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      error:
        "Link inválido ou expirado. Solicite uma nova recuperação de senha.",
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
