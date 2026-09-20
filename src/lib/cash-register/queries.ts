import "server-only";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { SalePaymentMethod } from "@/types/sale";
import type {
  CashRegister,
  CashMovement,
  CashRegisterWithNames,
  CashMovementWithName,
  CashRegisterSummary,
} from "@/types/cash-register";

const PAYMENT_METHODS: readonly SalePaymentMethod[] = ["cash", "pix", "debit", "credit", "other"];

/**
 * profiles_select_own (migration 001) restringe SELECT em `profiles` à
 * própria linha do usuário — um dono de empresa não consegue ler o nome
 * de um funcionário através do client normal (RLS), mesmo sendo membro da
 * mesma empresa (o mesmo padrão de "segundo lote de busca" usado em
 * src/lib/sales/queries.ts:attachResponsibleNames teria esse problema se
 * usasse o client comum — não é uma correção do Caixa, é uma limitação
 * pré-existente de profiles, fora do escopo desta fase).
 *
 * Por isso esta função usa o client admin (service_role) — só para ler
 * `full_name`, nunca para decidir autorização — e apenas para ids que já
 * vieram de linhas de cash_registers/cash_movements previamente
 * filtradas pela própria empresa (RLS já aplicado antes de chegar aqui),
 * então não há vazamento entre empresas: o único efeito é resolver o
 * nome de alguém que o chamador já sabe, por outro caminho, pertencer à
 * mesma empresa.
 *
 * Best-effort de propósito: uma busca de nome é puramente cosmética (o
 * chamador já trata ausência de nome com "—") e nunca deveria conseguir
 * derrubar a página inteira do Caixa — nem por uma falha transitória do
 * Supabase, nem por SUPABASE_SERVICE_ROLE_KEY não estar configurada no
 * ambiente atual (createAdminClient() lança se a variável estiver vazia).
 */
async function resolveNames(userIds: string[]): Promise<Record<string, string | null>> {
  const uniqueIds = Array.from(new Set(userIds));
  if (uniqueIds.length === 0) return {};

  let data: { user_id: string; full_name: string | null }[] | null = null;
  try {
    const admin = createAdminClient();
    ({ data } = await admin.from("profiles").select("user_id, full_name").in("user_id", uniqueIds));
  } catch (error) {
    console.error("[cash-register] falha ao resolver nomes de usuário (não bloqueia a página)", error);
  }

  const names: Record<string, string | null> = {};
  for (const profile of data ?? []) {
    names[profile.user_id] = profile.full_name;
  }
  return names;
}

/** O caixa aberto da empresa, ou null se nenhum estiver aberto. Nunca aceita company_id fora do resolvido por getCurrentCompany() no chamador. */
export async function getCurrentOpenCashRegister(companyId: string): Promise<CashRegisterWithNames | null> {
  const supabase = createClient();
  const { data } = await supabase
    .from("cash_registers")
    .select("*")
    .eq("company_id", companyId)
    .eq("status", "open")
    .maybeSingle();

  if (!data) return null;

  const names = await resolveNames([data.opened_by]);
  return { ...(data as CashRegister), opened_by_name: names[data.opened_by] ?? null, closed_by_name: null };
}

/** O último caixa fechado da empresa (mais recente por closed_at), ou null se nunca houve nenhum. */
export async function getLastClosedCashRegister(companyId: string): Promise<CashRegisterWithNames | null> {
  const supabase = createClient();
  const { data } = await supabase
    .from("cash_registers")
    .select("*")
    .eq("company_id", companyId)
    .eq("status", "closed")
    .order("closed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return null;

  const names = await resolveNames([data.opened_by, data.closed_by].filter((id): id is string => !!id));
  return {
    ...(data as CashRegister),
    opened_by_name: names[data.opened_by] ?? null,
    closed_by_name: data.closed_by ? names[data.closed_by] ?? null : null,
  };
}

/** Movimentações de um caixa, mais recente primeiro. */
export async function listCashMovements(cashRegisterId: string): Promise<CashMovementWithName[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("cash_movements")
    .select("*")
    .eq("cash_register_id", cashRegisterId)
    .order("created_at", { ascending: false });

  const rows = (data ?? []) as CashMovement[];
  const names = await resolveNames(rows.map((row) => row.created_by));

  return rows.map((row) => ({ ...row, created_by_name: names[row.created_by] ?? null }));
}

/**
 * Resumo calculado a partir das movimentações já buscadas — mesma
 * fórmula de close_cash_register (migration 021), como uma leitura ao
 * vivo. Não faz uma segunda consulta agregada: reaproveita a lista que a
 * página já busca para a tabela de movimentações.
 */
export function summarizeCashMovements(
  openingBalance: number,
  movements: CashMovement[]
): CashRegisterSummary {
  let totalIn = 0;
  let totalOut = 0;
  let cashIn = 0;
  let cashOut = 0;
  const inByMethod = Object.fromEntries(PAYMENT_METHODS.map((method) => [method, 0])) as Record<
    SalePaymentMethod,
    number
  >;

  for (const movement of movements) {
    const amount = Number(movement.amount);
    if (movement.direction === "in") {
      totalIn += amount;
      inByMethod[movement.method] += amount;
      if (movement.method === "cash") cashIn += amount;
    } else {
      totalOut += amount;
      if (movement.method === "cash") cashOut += amount;
    }
  }

  return {
    openingBalance,
    totalIn,
    totalOut,
    expectedCashBalance: openingBalance + cashIn - cashOut,
    inByMethod,
  };
}
