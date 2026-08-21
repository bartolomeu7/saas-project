/**
 * Tipos de domínio relacionados a empresa (tenant) e ao vínculo
 * usuário↔empresa. Espelham exatamente os enums e tabelas criados em
 * supabase/migrations/002_create_companies_customers.sql.
 */

/** Espelha o enum public.business_type. */
export type BusinessType =
  | "bakery"
  | "car_wash"
  | "automotive_detailing"
  | "grocery"
  | "restaurant"
  | "snack_bar"
  | "beauty_salon"
  | "workshop"
  | "service_provider"
  | "other";

/** Espelha o enum public.company_status. */
export type CompanyStatus = "active" | "inactive";

/** Espelha o enum public.company_role. */
export type CompanyRole = "owner" | "admin" | "employee";

/** Espelha a tabela public.companies. */
export interface Company {
  id: string;
  name: string;
  business_type: BusinessType;
  status: CompanyStatus;
  created_at: string;
  updated_at: string;
}

/** Espelha a tabela public.company_members. */
export interface CompanyMember {
  id: string;
  company_id: string;
  user_id: string;
  role: CompanyRole;
  created_at: string;
}

/**
 * Resultado combinado usado pela aplicação: a empresa atual do usuário
 * autenticado, junto com a role que ele tem nela.
 */
export interface CurrentCompany {
  company: Company;
  role: CompanyRole;
}

/** Rótulos legíveis para exibição na UI. */
export const BUSINESS_TYPE_LABELS: Record<BusinessType, string> = {
  bakery: "Padaria",
  car_wash: "Lava-rápido",
  automotive_detailing: "Estética automotiva",
  grocery: "Mercadinho",
  restaurant: "Restaurante",
  snack_bar: "Lanchonete",
  beauty_salon: "Salão de beleza",
  workshop: "Oficina",
  service_provider: "Prestador de serviços",
  other: "Outro",
};
