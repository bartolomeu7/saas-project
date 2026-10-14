"use server";

import { auth, clerkClient } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/auth/session";
import { listActiveClerkSessions } from "@/lib/auth/session-gate";
import type { ActionResult } from "@/lib/auth/actions";

/**
 * Encerra OUTRA sessão ativa do próprio usuário (para liberar uma vaga do limite). Só aceita ids que o Clerk lista como
 * sessões ativas DESTE usuário (um id de outra conta é tratado como inexistente) e nunca a sessão atual (para sair, use
 * "Sair"). Nada do que vem do navegador é confiado: o id é conferido no servidor contra o Clerk.
 */
export async function revokeOtherSessionAction(sessionId: string): Promise<ActionResult> {
  if (typeof sessionId !== "string" || sessionId.length < 5 || sessionId.length > 200) return { error: "Sessão inválida." };

  const [{ sessionId: currentSessionId, userId: clerkUserId }, user] = await Promise.all([auth(), getCurrentUser().catch(() => null)]);
  if (!clerkUserId || !user) return { error: "Sessão expirada. Faça login novamente." };
  if (sessionId === currentSessionId) return { error: "Esta é a sua sessão atual. Use “Sair” para encerrá-la." };

  try {
    const active = await listActiveClerkSessions(clerkUserId);
    if (!active.some((s) => s.id === sessionId)) return { error: "Sessão não encontrada ou já encerrada." };

    const client = await clerkClient();
    await client.sessions.revokeSession(sessionId);
    await createAdminClient().rpc("release_session_slot", { p_user_id: user.id, p_session_id: sessionId });
    return { success: "Sessão encerrada." };
  } catch (error) {
    console.error("[session-actions] não foi possível encerrar a sessão:", error instanceof Error ? error.message : "erro desconhecido");
    return { error: "Não foi possível encerrar a sessão agora. Tente novamente." };
  }
}
