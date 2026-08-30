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

/**
 * Ações já em uso pelos módulos de Clientes (Fase 1), Produtos (Fase 2),
 * Serviços (Fase 3) e Vendas (Fase 4).
 *
 * SALE_COMPLETED, SALE_CANCELLED e SALE_STOCK_ADJUSTED são gravadas
 * dentro das funções transacionais do banco (complete_sale/cancel_sale,
 * migration 008) — os valores aqui precisam bater exatamente com as
 * strings usadas lá ('sale.completed', 'sale.cancelled',
 * 'sale.stock_adjusted'), não com uma nova gravação da aplicação.
 */
export const AUDIT_ACTIONS = {
  CUSTOMER_CREATED: "customer.created",
  CUSTOMER_UPDATED: "customer.updated",
  CUSTOMER_DEACTIVATED: "customer.deactivated",
  CUSTOMER_REACTIVATED: "customer.reactivated",
  CUSTOMER_BIRTH_DATE_UPDATED: "customer.birth_date_updated",
  CUSTOMER_PREFERENCES_UPDATED: "customer.preferences_updated",
  CUSTOMER_DOCUMENT_UPLOADED: "customer_document.uploaded",
  CUSTOMER_DOCUMENT_DELETED: "customer_document.deleted",
  RAFFLE_EXECUTED: "raffle.executed",
  PRODUCT_CREATED: "product.created",
  PRODUCT_UPDATED: "product.updated",
  PRODUCT_ACTIVATED: "product.activated",
  PRODUCT_DEACTIVATED: "product.deactivated",
  PRODUCT_STOCK_ADJUSTED: "product.stock_adjusted",
  CATEGORY_CREATED: "category.created",
  CATEGORY_UPDATED: "category.updated",
  CATEGORY_ACTIVATED: "category.activated",
  CATEGORY_DEACTIVATED: "category.deactivated",
  SERVICE_CREATED: "service.created",
  SERVICE_UPDATED: "service.updated",
  SERVICE_ACTIVATED: "service.activated",
  SERVICE_DEACTIVATED: "service.deactivated",
  SERVICE_CATEGORY_CREATED: "service_category.created",
  SERVICE_CATEGORY_UPDATED: "service_category.updated",
  SERVICE_CATEGORY_ACTIVATED: "service_category.activated",
  SERVICE_CATEGORY_DEACTIVATED: "service_category.deactivated",
  SALE_CREATED: "sale.created",
  SALE_UPDATED: "sale.updated",
  SALE_COMPLETED: "sale.completed",
  SALE_CANCELLED: "sale.cancelled",
  SALE_PAYMENT_ADDED: "sale.payment_added",
  SALE_PAYMENT_UPDATED: "sale.payment_updated",
  SALE_PAYMENT_CANCELLED: "sale.payment_cancelled",
  SALE_STOCK_ADJUSTED: "sale.stock_adjusted",
  SUBSCRIPTION_CREATED: "subscription.created",
  SUBSCRIPTION_RENEWED: "subscription.renewed",
  SUBSCRIPTION_EXPIRED: "subscription.expired",
  PAYMENT_CREATED: "subscription_payment.created",
  PAYMENT_PAID: "subscription_payment.paid",
  PAYMENT_FAILED: "subscription_payment.failed",
  PAYMENT_EXPIRED: "subscription_payment.expired",
  PAYMENT_CANCELLED: "subscription_payment.cancelled",
  PAYMENT_REFUNDED: "subscription_payment.refunded",
  PAYMENT_WEBHOOK_PROCESSED: "subscription_payment.webhook_processed",
} as const;
