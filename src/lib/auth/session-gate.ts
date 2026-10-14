import "server-only";

import { auth, clerkClient } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createSessionClient } from "@/lib/supabase/server";

/**
 * Limite de sessões simultâneas por conta (controle de APLICAÇÃO; o Clerk continua dono das sessões).
 *
 * O Clerk não limita sessões ativas por usuário, então o app decide quem entra. A lista de sessões ativas vem do SERVIDOR
 * (API do Clerk), nunca do navegador. A decisão fica no banco, de forma atômica por usuário (register_session_slot,
 * somente service_role): sessões já aceitas NUNCA são derrubadas por uma sessão nova — a sessão nova é que é recusada,
 * até que alguém encerre uma sessão (ou ela expire). O caminho comum custa uma leitura barata (session_slot_status);
 * a API do Clerk só é consultada na primeira vez que uma sessão aparece (ou a cada 20 s enquanto estiver recusada).
 *
 * LIMITAÇÃO documentada: o gate roda na renderização do layout de /app e /admin. Chamadas diretas de API/Server Action
 * feitas por uma sessão recusada não passam por ele; a sessão recusada continua autenticada no Clerk e não ganha nenhum
 * privilégio além dos que o próprio usuário já tem. Falha de infraestrutura (Clerk/banco/chave ausente) => "allowed"
 * (não trancamos clientes por indisponibilidade), registrado em log sem dados sensíveis.
 */

export const SESSION_LIMIT_PATH = "/acesso-sessoes";
export const SESSION_LIMIT_MESSAGE =
  "Você atingiu o limite de sessões simultâneas permitido pela sua conta. Encerre uma sessão ativa ou entre em contato com o suporte para obter ajuda.";

const RECHECK_BLOCKED_AFTER_SECONDS = 20;

export type SessionGateResult = "allowed" | "blocked";

type StatusRpc = {
  rpc(fn: "session_slot_status", args: { p_session_id: string }): Promise<{ data: { state?: string; verified_age_seconds?: number } | null; error: { message: string } | null }>;
};

/** Sessões ativas do usuário no Clerk (ids, mais recentes primeiro). */
export async function listActiveClerkSessions(clerkUserId: string) {
  const client = await clerkClient();
  const result = await client.sessions.getSessionList({ userId: clerkUserId, status: "active", limit: 100 });
  return result.data;
}

export async function evaluateSessionGate(internalUserId: string): Promise<SessionGateResult> {
  try {
    const { sessionId, userId: clerkUserId } = await auth();
    if (!sessionId || !clerkUserId) return "allowed";

    const supabase = (await createSessionClient()) as unknown as StatusRpc;
    const { data: status } = await supabase.rpc("session_slot_status", { p_session_id: sessionId });
    if (status?.state === "allowed") return "allowed";
    if (status?.state === "blocked" && (status.verified_age_seconds ?? Infinity) < RECHECK_BLOCKED_AFTER_SECONDS) return "blocked";

    // Primeira vez (ou recusada há mais de 20 s): confere no Clerk quais sessões estão realmente ativas e decide no banco.
    const active = await listActiveClerkSessions(clerkUserId);
    const ids = Array.from(new Set([sessionId, ...active.map((s) => s.id)]));
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("register_session_slot", {
      p_user_id: internalUserId,
      p_session_id: sessionId,
      p_active_session_ids: ids,
    });
    if (error) throw new Error(error.message);
    return (data as { state?: string } | null)?.state === "blocked" ? "blocked" : "allowed";
  } catch (error) {
    console.error("[session-gate] verificação indisponível (liberado):", error instanceof Error ? error.message : "erro desconhecido");
    return "allowed";
  }
}
