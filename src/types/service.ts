/**
 * Tipos de domínio relacionados a serviços e categorias. Espelham as
 * tabelas criadas em supabase/migrations/007_services.sql.
 */

/** Espelha o enum public.service_status (reaproveitado por serviços e categorias). */
export type ServiceStatus = "active" | "inactive";

/** Espelha a tabela public.service_categories. */
export interface ServiceCategory {
  id: string;
  company_id: string;
  name: string;
  description: string | null;
  status: ServiceStatus;
  created_at: string;
  updated_at: string;
}

/** Espelha a tabela public.services. Catálogo apenas — sem execução (ver migration). */
export interface Service {
  id: string;
  company_id: string;
  category_id: string | null;
  name: string;
  description: string | null;
  cost_price: number;
  sale_price: number;
  duration_minutes: number;
  status: ServiceStatus;
  created_at: string;
  updated_at: string;
}

/** Serviço com o nome da categoria já resolvido, para listagem/detalhe. */
export interface ServiceWithCategory extends Service {
  category_name: string | null;
}

/** Campos que o formulário de serviço envia. company_id nunca vem do cliente. */
export type ServiceFormFields = Pick<
  Service,
  | "name"
  | "category_id"
  | "description"
  | "cost_price"
  | "sale_price"
  | "duration_minutes"
  | "status"
>;

export interface ServiceMargin {
  /** null quando sale_price é 0 (percentual não é matematicamente definido). */
  value: number;
  percentage: number | null;
}

/**
 * Margem sobre o preço de venda (não sobre o custo) — mesma fórmula do
 * módulo Produtos (ver calculateMargin em src/types/product.ts), para
 * manter o conceito consistente entre catálogos.
 */
export function calculateMargin(costPrice: number, salePrice: number): ServiceMargin {
  const value = salePrice - costPrice;
  const percentage = salePrice > 0 ? (value / salePrice) * 100 : null;
  return { value, percentage };
}

/** Formata minutos totais como "1h 30min", "45min" ou "2h" — nunca "1h 0min". */
export function formatDuration(totalMinutes: number): string {
  if (totalMinutes <= 0) return "Não informado";

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours === 0) return `${minutes}min`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}min`;
}
