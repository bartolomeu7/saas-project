import type { Database } from "@/types/supabase";

export type FinancialCategory = Database["public"]["Tables"]["financial_categories"]["Row"];
export type CostCenter = Database["public"]["Tables"]["cost_centers"]["Row"];
export type FinancialEntry = Database["public"]["Tables"]["financial_entries"]["Row"];
export type AccountsPayable = Database["public"]["Tables"]["accounts_payable"]["Row"];
export type SalePaymentMethod = Database["public"]["Enums"]["sale_payment_method"];
export type FinancialCategoryKind = Database["public"]["Enums"]["financial_category_kind"];

export interface AccountReceivable {
  sale_id: string;
  customer_id: string | null;
  customer_name: string | null;
  sold_at: string;
  due_date: string | null;
  total_amount: number;
  paid_amount: number;
  outstanding_amount: number;
  payment_status: string;
}

export interface FinanceDashboard {
  revenue: number;
  costOfGoods: number;
  grossProfit: number;
  operatingExpenses: number;
  netResult: number;
  cashIn: number;
  cashOut: number;
  cashNet: number;
  accountsPayable: number;
  accountsReceivable: number;
  overduePayableCount: number;
  overdueReceivableCount: number;
}
