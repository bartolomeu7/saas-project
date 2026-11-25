"use server";

import { clerkClient } from "@clerk/nextjs/server";
import { purgeTwoFactor } from "@/lib/security/two-factor/service";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/auth/session";
import type { ActionResult } from "@/lib/auth/actions";
import {
  BLOCKED_MESSAGES,
  isDeletionConfirmed,
  mapDeletionError,
  parseDeletionPreview,
  summarizeDeletion,
} from "@/lib/account/deletion-core";
import { sendAccountDeletedEmail } from "@/lib/account/email";


/** Clientes das RPCs novas (ainda fora do types/supabase.ts gerado). */
type DeletionRpcClient = {
  rpc(fn: "account_deletion_preview", args: { p_user_id: string }): Promise<{ data: unknown; error: { message: string } | null }>;
  rpc(fn: "delete_account_data", args: { p_user_id: string }): Promise<{ data: unknown; error: { message: string } | null }>;
};

export interface DeleteAccountResult extends ActionResult {
  /** A conta foi excluída (a tela leva para a página de despedida). */
  done?: boolean;
  emailSent?: boolean;
}

/**
 * Exclui a conta de QUEM ESTÁ LOGADO (nunca um id vindo do formulário): confirma a palavra digitada, confere os impedimentos,
 * executa a exclusão no banco (transação; os anexos saem junto), remove o usuário no Clerk e envia o e-mail de
 * confirmação (se configurado). A regra do que é apagado e do que a lei manda guardar está na migration.
 */
export async function deleteMyAccountAction(_prev: DeleteAccountResult, formData: FormData): Promise<DeleteAccountResult> {
  if (!isDeletionConfirmed(formData.get("confirmation"))) {
    return { error: "Digite EXCLUIR para confirmar.", field: "confirmation" };
  }

  let user;
  try {
    user = await getCurrentUser();
  } catch {
    return { error: "Não foi possível confirmar a sua sessão. Entre novamente." };
  }
  if (!user) return { error: "Sessão expirada. Faça login novamente." };

  const admin = createAdminClient() as unknown as DeletionRpcClient;
  const { data: rawPreview, error: previewError } = await admin.rpc("account_deletion_preview", { p_user_id: user.id });
  const preview = previewError ? null : parseDeletionPreview(rawPreview);
  if (!preview) return { error: "Não foi possível verificar a sua conta agora. Nada foi apagado. Tente novamente em instantes." };
  if (preview.blockedReason) return { error: BLOCKED_MESSAGES[preview.blockedReason], code: preview.blockedReason };

  const { data: deleted, error: deleteError } = await admin.rpc("delete_account_data", { p_user_id: user.id });
  if (deleteError) {
    console.error("[account-deletion] falha no banco:", deleteError.message);
    return mapDeletionError(deleteError.message);
  }

  const result = (deleted ?? {}) as { companies_deleted?: number; companies_left?: number; clerk_user_id?: string | null };

  // A segunda etapa só é apagada DEPOIS que a exclusão deu certo (uma falha acima não pode enfraquecer a conta que continua).
  // O perfil é anonimizado (não apagado) para guardar o aceite dos termos; por isso o segredo e os códigos são apagados aqui.
  await purgeTwoFactor(user.id).catch((error) => {
    console.error("[account-deletion] não foi possível apagar a segunda etapa:", error instanceof Error ? error.message : "erro desconhecido");
  });

  // A partir daqui os dados já foram apagados: falhas só são registradas, nunca desfazem nem escondem a exclusão.
  if (result.clerk_user_id) {
    try {
      await (await clerkClient()).users.deleteUser(result.clerk_user_id);
    } catch (error) {
      console.error("[account-deletion] não foi possível remover o usuário no Clerk:", error instanceof Error ? error.message : "erro desconhecido");
    }
  }

  const emailSent = await sendAccountDeletedEmail({
    to: preview.email ?? user.email,
    fullName: preview.fullName,
    companiesDeleted: result.companies_deleted ?? 0,
    companiesLeft: result.companies_left ?? 0,
  });

  return { success: "Conta excluída.", done: true, emailSent };
}
