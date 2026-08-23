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
  const { error } = await supabase.from("audit_logs").insert({
    company_id: params.companyId,
    actor_user_id: params.actorUserId,
    entity_type: params.entityType,
    entity_id: params.entityId,
    action: params.action,
    metadata: (params.metadata ?? {}) as Json,
  });

  if (error) {
    console.error("[audit] falha ao gravar audit_logs", error, params);
  }
}
