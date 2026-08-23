/**
 * Tipos de domínio do log de auditoria. Espelha a tabela
 * public.audit_logs criada em supabase/migrations/005_customer_engagement.sql.
 *
 * entity_type/action são strings livres de propósito — cada módulo
 * define as próprias constantes (ver AUDIT_ACTIONS abaixo) em vez de um
 * enum de banco, para não exigir uma migration toda vez que um módulo
 * novo precisar logar um evento diferente.
 */
export interface AuditLog {
  id: string;
  company_id: string;
  actor_user_id: string | null;
  entity_type: string;
  entity_id: string;
  action: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

/** Ações já em uso pelo módulo de Clientes (Fase 1). */
export const AUDIT_ACTIONS = {
  CUSTOMER_CREATED: "customer.created",
  CUSTOMER_UPDATED: "customer.updated",
  CUSTOMER_DEACTIVATED: "customer.deactivated",
  CUSTOMER_REACTIVATED: "customer.reactivated",
  RAFFLE_EXECUTED: "raffle.executed",
} as const;
