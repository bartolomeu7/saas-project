import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { CustomerRaffle, CustomerRaffleEntry } from "@/types/raffle";

/** Sorteios já realizados pela empresa, mais recente primeiro. */
export async function listRaffles(
  companyId: string,
  limit = 20
): Promise<CustomerRaffle[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("customer_raffles")
    .select("*")
    .eq("company_id", companyId)
    .order("executed_at", { ascending: false })
    .limit(limit);

  if (error) {
    return [];
  }

  return (data ?? []) as CustomerRaffle[];
}

/** Um sorteio específico com a lista completa de participantes (snapshot). */
export async function getRaffleById(
  companyId: string,
  id: string
): Promise<{ raffle: CustomerRaffle; entries: CustomerRaffleEntry[] } | null> {
  const supabase = createClient();

  const { data: raffle, error: raffleError } = await supabase
    .from("customer_raffles")
    .select("*")
    .eq("company_id", companyId)
    .eq("id", id)
    .maybeSingle();

  if (raffleError || !raffle) {
    return null;
  }

  const { data: entries, error: entriesError } = await supabase
    .from("customer_raffle_entries")
    .select("*")
    .eq("raffle_id", id)
    .eq("company_id", companyId)
    .order("is_winner", { ascending: false })
    .order("customer_name_snapshot", { ascending: true });

  if (entriesError) {
    return { raffle: raffle as CustomerRaffle, entries: [] };
  }

  return {
    raffle: raffle as CustomerRaffle,
    entries: (entries ?? []) as CustomerRaffleEntry[],
  };
}
