import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { AuditLog } from "@/types/audit";

/**
 * Histórico de eventos de uma entidade específica (ex: um cliente),
 * mais recente primeiro. Reutilizável por qualquer módulo — só muda
 * entityType/entityId.
 */
export async function listAuditLogsForEntity(
  companyId: string,
  entityType: string,
  entityId: string,
  limit = 50
): Promise<AuditLog[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("audit_logs")
    .select("*")
    .eq("company_id", companyId)
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    return [];
  }

  return (data ?? []) as AuditLog[];
}
