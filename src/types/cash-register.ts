/**
 * Tipos de domínio do módulo Caixa. Espelham as tabelas criadas em
 * supabase/migrations/021_cash_register_foundation.sql.
 *
 * `method` reaproveita SalePaymentMethod (src/types/sale.ts) — a mesma
 * estrutura de forma de pagamento que Vendas já usa, sem duplicar.
 */
import type { SalePaymentMethod } from "@/types/sale";

export type CashRegisterStatus = "open" | "closed";
export type CashMovementDirection = "in" | "out";
export type CashMovementSource = "sale_payment" | "manual";

/** Espelha a tabela public.cash_registers. */
export interface CashRegister {
  id: string;
  company_id: string;
  status: CashRegisterStatus;
  opened_by: string;
  opened_at: string;
  opening_balance: number;
  closed_by: string | null;
  closed_at: string | null;
  /** Só dinheiro (method='cash') — Pix/débito/crédito não entram na conferência de gaveta. */
  expected_cash_balance: number | null;
  informed_cash_balance: number | null;
  cash_difference: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/** Espelha a tabela public.cash_movements — imutável (sem UPDATE/DELETE). */
export interface CashMovement {
  id: string;
  company_id: string;
  cash_register_id: string;
  direction: CashMovementDirection;
  amount: number;
  method: SalePaymentMethod;
  description: string;
  /** 'sale_payment' = gerado automaticamente pelo trigger; 'manual' = lançado pelo usuário. */
  source: CashMovementSource;
  sale_payment_id: string | null;
  created_by: string;
  created_at: string;
}

export const CASH_MOVEMENT_DIRECTION_LABELS: Record<CashMovementDirection, string> = {
  in: "Entrada",
  out: "Saída",
};

/** CashRegister + nome do responsável (profiles.full_name) já resolvido, para exibição. */
export interface CashRegisterWithNames extends CashRegister {
  opened_by_name: string | null;
  closed_by_name: string | null;
}

/** CashMovement + nome do responsável, para exibição. */
export interface CashMovementWithName extends CashMovement {
  created_by_name: string | null;
}

/**
 * Resumo calculado a partir das movimentações de um caixa — espelha
 * exatamente a mesma fórmula de close_cash_register (migration 021), só
 * que como uma leitura ao vivo (o caixa pode ainda estar aberto). Nunca é
 * a fonte de verdade do fechamento — isso continua sendo,
 * exclusivamente, o cálculo feito dentro da própria RPC no momento de
 * fechar.
 */
export interface CashRegisterSummary {
  openingBalance: number;
  /** Soma de todas as entradas, qualquer forma de pagamento. */
  totalIn: number;
  /** Soma de todas as saídas, qualquer forma de pagamento. */
  totalOut: number;
  /** opening_balance + entradas em dinheiro - saídas em dinheiro. Nunca inclui Pix/débito/crédito. */
  expectedCashBalance: number;
  /** Soma das ENTRADAS por forma de pagamento (Pix conta aqui, mas não em expectedCashBalance). */
  inByMethod: Record<import("@/types/sale").SalePaymentMethod, number>;
}
