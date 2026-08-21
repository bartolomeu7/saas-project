/**
 * Tipos de domínio relacionados a clientes. Espelham a tabela
 * public.customers criada em
 * supabase/migrations/002_create_companies_customers.sql.
 */

/** Espelha o enum public.customer_status. */
export type CustomerStatus = "active" | "inactive";

/** Espelha a tabela public.customers. */
export interface Customer {
  id: string;
  company_id: string;
  name: string;
  document: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  address: string | null;
  address_number: string | null;
  complement: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  notes: string | null;
  status: CustomerStatus;
  created_at: string;
  updated_at: string;
}

/**
 * Campos que o formulário de cliente envia. company_id nunca vem do
 * cliente — é resolvido no servidor a partir da empresa do usuário
 * autenticado (ver src/lib/customers/actions.ts).
 */
export type CustomerFormFields = Pick<
  Customer,
  | "name"
  | "document"
  | "phone"
  | "whatsapp"
  | "email"
  | "address"
  | "address_number"
  | "complement"
  | "neighborhood"
  | "city"
  | "state"
  | "postal_code"
  | "notes"
  | "status"
>;

export const CUSTOMER_STATUS_LABELS: Record<CustomerStatus, string> = {
  active: "Ativo",
  inactive: "Inativo",
};
