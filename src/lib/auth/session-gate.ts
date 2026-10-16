import "server-only";

import { auth, clerkClient } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createSessionClient } from "@/lib/supabase/server";
import {
  decideSessionAccess,
  GateNotProvisionedError,
  isMissingFunctionError,
  parseSlotStatus,
  type ActiveSessions,
  type RegisterResult,
  type SessionGateResult,
} from "@/lib/auth/session-gate-core";

/**
 * Limite de sessões simultâneas por conta (controle de APLICAÇÃO; o Clerk continua dono das sessões e não oferece um
 * limite "N por usuário": só o modo de sessão única, que não serve aqui).
 *
 * As regras de decisão e o comportamento diante de falhas estão em session-gate-core.ts (puro e testado). Aqui ficam só
 * as ligações com o mundo real:
 *  - `readStatus`  -> RPC session_slot_status com o token do próprio usuário (barato);
 *  - `listActiveSessions` -> API do Clerk NO SERVIDOR (nunca o navegador), até 100 sessões ativas, com sinalização de lista incompleta;
 *  - `register` -> RPC register_session_slot (service_role), atômica por usuário no banco.
 *
 * Onde é imposto: o middleware lê o estado (páginas, Server Actions e APIs do produto) e os layouts de /app e /admin
 * fazem a verificação completa. LIMITAÇÃO documentada: a recusa vale para a APLICAÇÃO; o token do Clerk da sessão
 * recusada continua válido até ela ser encerrada e o banco (RLS) autentica pelo token, não pelo registro de vagas.
 */

export { SESSION_LIMIT_PATH, SESSION_LIMIT_MESSAGE, SESSION_UNVERIFIED_MESSAGE } from "@/lib/auth/session-gate-core";

export type { SessionGateResult };

type RpcError = { message: string; code?: string } | null;
type StatusRpc = { rpc(fn: "session_slot_status", args: { p_session_id: string }): Promise<{ data: unknown; error: RpcError }> };
type RegisterRpc = {
  rpc(
    fn: "register_session_slot",
    args: { p_user_id: string; p_session_id: string; p_active_session_ids: string[]; p_list_complete: boolean }
  ): Promise<{ data: unknown; error: RpcError }>;
};

const CLERK_PAGE_LIMIT = 100;

/** Sessões ativas do usuário no Clerk (mais recentes primeiro) e se a lista veio completa. */
export async function listActiveClerkSessionsPage(clerkUserId: string) {
  const client = await clerkClient();
  const result = await client.sessions.getSessionList({ userId: clerkUserId, status: "active", limit: CLERK_PAGE_LIMIT });
  return { sessions: result.data, complete: result.data.length >= result.totalCount };
}

/** Compatível com a tela /acesso-sessoes e com o encerramento de sessões. */
export async function listActiveClerkSessions(clerkUserId: string) {
  return (await listActiveClerkSessionsPage(clerkUserId)).sessions;
}

export async function evaluateSessionGate(internalUserId: string): Promise<SessionGateResult> {
  try {
    const { sessionId, userId: clerkUserId } = await auth();
    // Sem sessão não há o que limitar (rotas protegidas já exigem login no middleware).
    if (!sessionId || !clerkUserId) return "allowed";

    const { result, reason } = await decideSessionAccess({
      async readStatus() {
        const supabase = (await createSessionClient()) as unknown as StatusRpc;
        const { data, error } = await supabase.rpc("session_slot_status", { p_session_id: sessionId });
        if (error) {
          if (isMissingFunctionError(error)) throw new GateNotProvisionedError();
          throw new Error("status indisponível");
        }
        return parseSlotStatus(data);
      },
      async listActiveSessions(): Promise<ActiveSessions> {
        const { sessions, complete } = await listActiveClerkSessionsPage(clerkUserId);
        // a sessão atual sempre entra na lista que o banco confere (se o Clerk não a lista, o banco responde "invalid")
        return { ids: Array.from(new Set(sessions.map((s) => s.id))), complete };
      },
      async register(activeIds, listComplete): Promise<RegisterResult> {
        // Configuração ausente é falha de implantação, não do usuário: nega a verificação (sem liberar em silêncio) e avisa.
        if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
          console.error("[session-gate] SUPABASE_SERVICE_ROLE_KEY ausente neste ambiente: sessões novas não podem ser verificadas.");
          throw new Error("service role ausente");
        }
        const admin = createAdminClient() as unknown as RegisterRpc;
        const { data, error } = await admin.rpc("register_session_slot", {
          p_user_id: internalUserId,
          p_session_id: sessionId,
          p_active_session_ids: activeIds,
          p_list_complete: listComplete,
        });
        if (error) {
          if (isMissingFunctionError(error)) throw new GateNotProvisionedError();
          throw new Error("registro indisponível");
        }
        const state = (data as { state?: unknown } | null)?.state;
        return state === "allowed" || state === "blocked" ? state : "invalid";
      },
      log(event, detail) {
        // sem tokens, cookies, ids de sessão ou dados pessoais: só o tipo do evento
        console.warn(`[session-gate] ${event}${detail ? ` (${detail})` : ""}`);
      },
    });
    if (result !== "allowed") console.warn(`[session-gate] decisão=${result} motivo=${reason}`);
    return result;
  } catch (error) {
    // Falha inesperada FORA do fluxo de decisão (ex.: auth() indisponível): a sessão não foi validada.
    console.error("[session-gate] erro inesperado:", error instanceof Error ? error.name : "desconhecido");
    return "unverified";
  }
}
