import type { QuoteItemType, QuoteStatus } from "@/lib/quotes/rules";

/** Espelha a tabela public.quotes (migration 20261121200000_quotes). Valores em reais (numeric vira number no PostgREST). */
export interface Quote {
  id: string;
  company_id: string;
  number: string;
  seq: number;
  year: number;
  status: QuoteStatus;
  customer_id: string | null;
  customer_name: string;
  customer_document: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  customer_address: string | null;
  title: string | null;
  issued_on: string;
  valid_until: string;
  subtotal: number;
  discount_amount: number;
  total_amount: number;
  payment_terms: string | null;
  delivery_terms: string | null;
  notes: string | null;
  footer: string | null;
  sent_at: string | null;
  approved_at: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
  sale_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** Espelha a tabela public.quote_items. */
export interface QuoteItem {
  id: string;
  quote_id: string;
  company_id: string;
  position: number;
  item_type: QuoteItemType;
  product_id: string | null;
  service_id: string | null;
  description: string;
  unit: string;
  quantity: number;
  unit_price: number;
  discount_amount: number;
  total_amount: number;
}

export type QuoteEventName = "created" | "updated" | "sent" | "approved" | "rejected" | "reopened" | "duplicated";

/** Espelha a tabela public.quote_events. */
export interface QuoteEvent {
  id: string;
  quote_id: string;
  company_id: string;
  event: QuoteEventName;
  note: string | null;
  created_by: string | null;
  created_at: string;
}

export const QUOTE_EVENT_LABELS: Record<QuoteEventName, string> = {
  created: "Orçamento criado",
  updated: "Orçamento editado",
  sent: "Marcado como enviado",
  approved: "Aprovado pelo cliente",
  rejected: "Recusado pelo cliente",
  reopened: "Voltou para rascunho",
  duplicated: "Criado a partir de uma cópia",
};
