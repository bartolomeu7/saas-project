import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/types/supabase";

interface WriteAuditLogParams {
  companyId: string;
  actorUserId: string | null;
  entityType: string;
  entityId: string;
  action: string;
  metadata?: Record<string, unknown>;
}

/**
 * Grava um evento no log de auditoria genérico (public.audit_logs).
 * Reutilizável por qualquer módulo — só passar entity_type/action
 * próprios, sem precisar de tabela ou policy nova.
 *
 * Recebe o client Supabase já autenticado do chamador (em vez de criar
 * um novo) para reaproveitar a sessão da Server Action que está
 * registrando o evento.
 *
 * Nunca lança: falha ao gravar auditoria não pode derrubar a ação
 * principal (ex.: criar um cliente não pode falhar só porque o log
 * falhou). O erro é registrado no console do servidor.
 */
export async function writeAuditLog(
  supabase: SupabaseClient<Database>,
  params: WriteAuditLogParams
): Promise<void> {
  // O papel `authenticated` não tem INSERT em audit_logs (migrations 036 e
  // 20260923115135). A RPC write_audit_log (migration 041) grava com o ator
  // sempre igual a auth.uid() quando há sessão de usuário (e só aceita as
  // ações permitidas a usuário). Com o cliente service_role (billing) não há
  // auth.uid(): o ator vai em p_actor_user_id e o banco só aceita eventos de
  // assinatura/pagamento nesse contexto.
  const { error } = await supabase.rpc("write_audit_log", {
    p_company_id: params.companyId,
    p_entity_type: params.entityType,
    p_entity_id: params.entityId,
    p_action: params.action,
    p_metadata: (params.metadata ?? {}) as Json,
    p_actor_user_id: params.actorUserId ?? undefined,
  });

  if (error) {
    console.error("[audit] falha ao gravar audit_logs", error, params);
  }
}
