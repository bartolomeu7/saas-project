"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSessionClient } from "@/lib/supabase/server";
import { requirePlatformAdmin } from "@/lib/admin/queries";
import type { ActionResult } from "@/lib/auth/actions";

/**
 * Server Actions das operações administrativas sensíveis (papel e status de
 * usuário). Cada uma só repassa o pedido para a RPC SECURITY DEFINER, que é a
 * AUTORIDADE: ela revalida o ator pela sessão do Clerk (is_platform_admin() /
 * is_super_admin(), com status active), o alvo, a hierarquia e grava a
 * auditoria. Nada aqui concede permissão — esconder botão na UI não é segurança,
 * e estas actions também não confiam em nenhum dado de papel vindo do cliente.
 */

const uuid = z.string().uuid();
const userStatus = z.enum(["active", "inactive", "suspended"]);
const userRole = z.enum(["user", "admin", "super_admin"]);

/** Mensagens das RPCs que são seguras (e úteis) de mostrar ao administrador. */
const SAFE_PREFIXES = [
  "Não é permitido",
  "Sem permissão",
  "O usuário já",
  "Usuário não encontrado",
  "A plataforma precisa",
  "Parâmetros inválidos",
];

function toUserMessage(rpcMessage: string): string {
  if (rpcMessage === "not authorized") {
    return "Você não tem permissão para realizar esta operação.";
  }
  if (SAFE_PREFIXES.some((prefix) => rpcMessage.startsWith(prefix))) {
    return rpcMessage;
  }
  return "Não foi possível concluir a operação. Tente novamente.";
}

/** Suspender, reativar ou inativar um usuário. admin só age sobre usuários comuns. */
export async function setUserStatusAction(
  targetUserId: string,
  status: string
): Promise<ActionResult> {
  await requirePlatformAdmin();

  const parsed = z.object({ id: uuid, status: userStatus }).safeParse({ id: targetUserId, status });
  if (!parsed.success) {
    return { error: "Parâmetros inválidos." };
  }

  const supabase = await createSessionClient();
  const { error } = await supabase.rpc("set_platform_user_status", {
    p_target_user_id: parsed.data.id,
    p_status: parsed.data.status,
  });

  if (error) {
    console.error("[admin] set_platform_user_status() falhou:", error.message);
    return { error: toUserMessage(error.message) };
  }

  revalidatePath("/admin/users");
  revalidatePath("/admin/administrators");
  return { success: "Status do usuário atualizado." };
}

/** Promover ou rebaixar o papel de um usuário. SUPER_ADMIN ONLY (revalidado no banco). */
export async function setUserRoleAction(targetUserId: string, role: string): Promise<ActionResult> {
  await requirePlatformAdmin();

  const parsed = z.object({ id: uuid, role: userRole }).safeParse({ id: targetUserId, role });
  if (!parsed.success) {
    return { error: "Parâmetros inválidos." };
  }

  const supabase = await createSessionClient();
  const { error } = await supabase.rpc("set_platform_user_role", {
    p_target_user_id: parsed.data.id,
    p_role: parsed.data.role,
  });

  if (error) {
    console.error("[admin] set_platform_user_role() falhou:", error.message);
    return { error: toUserMessage(error.message) };
  }

  revalidatePath("/admin/users");
  revalidatePath("/admin/administrators");
  return { success: "Papel do usuário atualizado." };
}
