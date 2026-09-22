export type SupplierStatus = "active" | "inactive";

export interface Supplier {
  id: string;
  company_id: string;
  name: string;
  legal_name: string | null;
  document: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  address: string | null;
  address_number: string | null;
  complement: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  notes: string | null;
  status: SupplierStatus;
  created_at: string;
  updated_at: string;
}

export interface SupplierFormFields {
  name: string;
  legal_name: string;
  document: string;
  email: string;
  phone: string;
  whatsapp: string;
  address: string;
  address_number: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
  postal_code: string;
  notes: string;
  status: SupplierStatus;
}