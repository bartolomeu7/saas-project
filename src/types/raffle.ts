/** Espelha public.customer_raffles / public.customer_raffle_entries. */
export interface CustomerRaffle {
  id: string;
  company_id: string;
  name: string | null;
  criteria: Record<string, unknown>;
  participant_count: number;
  winner_count: number;
  executed_by: string;
  executed_at: string;
}

export interface CustomerRaffleEntry {
  id: string;
  raffle_id: string;
  company_id: string;
  customer_id: string | null;
  customer_name_snapshot: string;
  customer_phone_snapshot: string | null;
  customer_email_snapshot: string | null;
  is_winner: boolean;
  winner_position: number | null;
}
