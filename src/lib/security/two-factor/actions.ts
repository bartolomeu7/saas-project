"use server";

import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/session";
import { safeAfterTwoFactorPath } from "@/lib/security/two-factor/gate";
import { describeFailure } from "@/lib/security/two-factor/messages";
import { beginSetup, confirmSetup, disableTwoFactor, regenerateBackupCodes, verifyForLogin } from "@/lib/security/two-factor/service";

/**
 * Server Actions da verificação em duas etapas. O usuário e a sessão vêm SEMPRE do Clerk no servidor (auth() +
 * getCurrentUser()); do navegador só chega o código digitado (e o ?next= da verificação, sanitizado).
 */

export interface TwoFactorActionState {
  error?: string;
  success?: string;
  /** Segredo e URI do app autenticador (só na resposta de "começar a ativação"). */
  setup?: { secret: string; uri: string };
  /** Códigos de backup, mostrados UMA vez. */
  backupCodes?: string[];
}

async function context(): Promise<{ userId: string; sessionId: string; email: string | null } | null> {
  const [{ sessionId, userId: clerkUserId }, user] = await Promise.all([auth(), getCurrentUser().catch(() => null)]);
  if (!sessionId || !clerkUserId || !user) return null;
  return { userId: user.id, sessionId, email: user.email };
}

const text = (formData: FormData, name: string) => {
  const value = formData.get(name);
  return typeof value === "string" ? value.slice(0, 64) : "";
};

const EXPIRED = { error: "Sessão expirada. Faça login novamente." } satisfies TwoFactorActionState;

/** Passo 1 da ativação: gera o segredo (cifrado no banco, ainda inativo) e devolve QR/URI/chave para o app autenticador. */
export async function startTwoFactorSetupAction(): Promise<TwoFactorActionState> {
  const ctx = await context();
  if (!ctx) return EXPIRED;
  const result = await beginSetup(ctx.userId, ctx.email ?? "conta");
  if (!result.ok) return { error: describeFailure(result) };
  return { setup: { secret: result.secret, uri: result.uri } };
}

/** Passo 2: confere o primeiro código do app, ativa e devolve os códigos de backup. */
export async function confirmTwoFactorSetupAction(_prev: TwoFactorActionState, formData: FormData): Promise<TwoFactorActionState> {
  const ctx = await context();
  if (!ctx) return EXPIRED;
  const result = await confirmSetup(ctx.userId, ctx.sessionId, text(formData, "code"));
  if (!result.ok) return { error: describeFailure(result) };
  revalidatePath("/app/configuracoes/seguranca");
  revalidatePath("/admin/account");
  return { success: "Verificação em duas etapas ativada.", backupCodes: result.backupCodes };
}

/** Segunda etapa do login (página /verificacao-2fa). Aceita código do app ou de backup. */
export async function verifyTwoFactorAction(_prev: TwoFactorActionState, formData: FormData): Promise<TwoFactorActionState> {
  const ctx = await context();
  if (!ctx) return EXPIRED;
  const result = await verifyForLogin(ctx.userId, ctx.sessionId, text(formData, "code"));
  if (!result.ok) {
    // Não exigido (sem segunda etapa ativa) só acontece se o estado mudou entre o redirecionamento e o envio.
    if (result.code === "not_enabled") redirect(safeAfterTwoFactorPath(text(formData, "next")));
    return { error: describeFailure(result) };
  }
  redirect(safeAfterTwoFactorPath(text(formData, "next")));
}

/** Desativa (exige um código válido). */
export async function disableTwoFactorAction(_prev: TwoFactorActionState, formData: FormData): Promise<TwoFactorActionState> {
  const ctx = await context();
  if (!ctx) return EXPIRED;
  const result = await disableTwoFactor(ctx.userId, text(formData, "code"));
  if (!result.ok) return { error: describeFailure(result) };
  revalidatePath("/app/configuracoes/seguranca");
  revalidatePath("/admin/account");
  return { success: "Verificação em duas etapas desativada." };
}

/** Gera códigos de backup novos (exige um código do app); os antigos deixam de valer. */
export async function regenerateBackupCodesAction(_prev: TwoFactorActionState, formData: FormData): Promise<TwoFactorActionState> {
  const ctx = await context();
  if (!ctx) return EXPIRED;
  const result = await regenerateBackupCodes(ctx.userId, text(formData, "code"));
  if (!result.ok) return { error: describeFailure(result) };
  revalidatePath("/app/configuracoes/seguranca");
  revalidatePath("/admin/account");
  return { success: "Novos códigos de backup gerados. Os anteriores deixaram de valer.", backupCodes: result.backupCodes };
}
