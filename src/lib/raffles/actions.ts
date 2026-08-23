"use server";

import { randomInt } from "crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentCompany } from "@/lib/companies/queries";
import { getCurrentUser } from "@/lib/auth/session";
import { writeAuditLog } from "@/lib/audit/log";
import { AUDIT_ACTIONS } from "@/types/audit";
import type { ActionResult } from "@/lib/auth/actions";

const MAX_WINNERS = 50;

/**
 * Escolhe `count` índices únicos entre [0, poolSize) por embaralhamento
 * parcial de Fisher-Yates usando `crypto.randomInt` (criptograficamente
 * seguro) — nunca `Math.random`, e sempre executado aqui no servidor
 * (Server Action), nunca no navegador.
 */
function pickRandomIndexes(poolSize: number, count: number): number[] {
  const indexes = Array.from({ length: poolSize }, (_, i) => i);

  for (let i = 0; i < count; i++) {
    const remaining = indexes.length - i;
    const j = i + randomInt(0, remaining);
    const temp = indexes[i]!;
    indexes[i] = indexes[j]!;
    indexes[j] = temp;
  }

  return indexes.slice(0, count);
}

/**
 * Define os critérios, busca os clientes elegíveis e executa o sorteio
 * — tudo em uma única operação atômica no servidor. O resultado é
 * gravado (customer_raffles + customer_raffle_entries, com snapshot dos
 * dados do cliente) e nunca pode ser alterado depois: as tabelas não
 * têm policy de update/delete para usuários comuns.
 *
 * "Compraram no período" e "valor mínimo gasto" não são critérios
 * disponíveis ainda — dependem do módulo de Vendas, que não existe
 * nesta fase.
 */
export async function runRaffleAction(
  _prevState: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const name = (formData.get("name") as string | null)?.trim() || null;
  const activeOnly = formData.get("activeOnly") === "on";
  const registeredFrom = (formData.get("registeredFrom") as string | null) || null;
  const registeredTo = (formData.get("registeredTo") as string | null) || null;
  const winnerCount = Number(formData.get("winnerCount"));

  if (!Number.isInteger(winnerCount) || winnerCount < 1 || winnerCount > MAX_WINNERS) {
    return { error: `Informe uma quantidade de vencedores entre 1 e ${MAX_WINNERS}.` };
  }

  const current = await getCurrentCompany();
  if (!current) {
    return { error: "Nenhuma empresa encontrada para o usuário atual." };
  }

  const user = await getCurrentUser();
  if (!user) {
    return { error: "Sessão expirada. Faça login novamente." };
  }

  const supabase = createClient();

  let eligibleQuery = supabase
    .from("customers")
    .select("id, name, phone, email")
    .eq("company_id", current.company.id);

  if (activeOnly) {
    eligibleQuery = eligibleQuery.eq("status", "active");
  }
  if (registeredFrom) {
    eligibleQuery = eligibleQuery.gte("created_at", new Date(registeredFrom).toISOString());
  }
  if (registeredTo) {
    const end = new Date(registeredTo);
    end.setHours(23, 59, 59, 999);
    eligibleQuery = eligibleQuery.lte("created_at", end.toISOString());
  }

  const { data: eligible, error: eligibleError } = await eligibleQuery;

  if (eligibleError) {
    return { error: "Não foi possível buscar os clientes elegíveis. Tente novamente." };
  }

  const pool = eligible ?? [];

  if (pool.length === 0) {
    return { error: "Nenhum cliente elegível encontrado com esses critérios." };
  }

  if (winnerCount > pool.length) {
    return {
      error: `Só há ${pool.length} cliente(s) elegível(is) com esses critérios — reduza a quantidade de vencedores.`,
    };
  }

  const winnerIndexes = pickRandomIndexes(pool.length, winnerCount);
  const winnerPositionByIndex = new Map(winnerIndexes.map((index, position) => [index, position + 1]));

  const criteria = {
    activeOnly,
    registeredFrom,
    registeredTo,
    winnerCount,
  };

  const { data: raffle, error: raffleError } = await supabase
    .from("customer_raffles")
    .insert({
      company_id: current.company.id,
      name,
      criteria,
      participant_count: pool.length,
      winner_count: winnerCount,
      executed_by: user.id,
    })
    .select("id")
    .single();

  if (raffleError || !raffle) {
    return { error: "Não foi possível registrar o sorteio. Tente novamente." };
  }

  const entries = pool.map((customer, index) => ({
    raffle_id: raffle.id,
    company_id: current.company.id,
    customer_id: customer.id,
    customer_name_snapshot: customer.name,
    customer_phone_snapshot: customer.phone,
    customer_email_snapshot: customer.email,
    is_winner: winnerPositionByIndex.has(index),
    winner_position: winnerPositionByIndex.get(index) ?? null,
  }));

  const { error: entriesError } = await supabase
    .from("customer_raffle_entries")
    .insert(entries);

  if (entriesError) {
    return {
      error:
        "O sorteio foi registrado, mas houve um problema ao salvar a lista de participantes. Contate o suporte.",
    };
  }

  await writeAuditLog(supabase, {
    companyId: current.company.id,
    actorUserId: user.id,
    entityType: "customer_raffle",
    entityId: raffle.id,
    action: AUDIT_ACTIONS.RAFFLE_EXECUTED,
    metadata: { name, participantCount: pool.length, winnerCount },
  });

  revalidatePath("/app/clientes/sorteio");
  redirect(`/app/clientes/sorteio/${raffle.id}`);
}
