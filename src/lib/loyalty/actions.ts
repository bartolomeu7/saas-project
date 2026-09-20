"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getCurrentCompany } from "@/lib/companies/queries";
import { recalculateSaleTotals } from "@/lib/sales/totals";
import type { ActionResult } from "@/lib/auth/actions";
import type { Database } from "@/types/supabase";

/** Número obrigatório vindo do formulário; null se ausente/inválido (NaN/Infinity incluídos). */
function parseRequiredNumber(
  value: FormDataEntryValue | null,
  { min, max, integer }: { min?: number; max?: number; integer?: boolean } = {}
): number | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  if (integer && !Number.isInteger(parsed)) return null;
  if (min !== undefined && parsed < min) return null;
  if (max !== undefined && parsed > max) return null;
  return parsed;
}

/** Número opcional (campo vazio = null); mesmas checagens de parseRequiredNumber quando preenchido. */
function parseOptionalNumber(
  value: FormDataEntryValue | null,
  { min, max }: { min?: number; max?: number } = {}
): number | null | undefined {
  if (typeof value !== "string" || value.trim() === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return undefined; // undefined = valor inválido, diferente de "vazio"
  if (min !== undefined && parsed <= min) return undefined;
  if (max !== undefined && parsed > max) return undefined;
  return parsed;
}

/**
 * Resgata pontos de fidelidade como desconto numa venda em rascunho.
 * Toda validação (saldo, mínimo, limite percentual, FIFO) acontece dentro
 * de public.redeem_loyalty_points — esta Server Action só repassa a
 * chamada e traduz o erro do Postgres para o usuário.
 *
 * Achado na Etapa 1D.6C: redeem_loyalty_points só grava
 * loyalty_points_redeemed/loyalty_discount_amount, nunca total_amount
 * (mesma divisão de responsabilidade de removeLoyaltyRedemptionFromDraftAction,
 * documentada na migration 014) — sem chamar recalculateSaleTotals aqui, o
 * "Total" do resumo da venda ficaria desatualizado (ainda sem o desconto)
 * até a próxima mutação de item/desconto, mesmo com o resgate já aplicado
 * corretamente no banco. Corrigido chamando a mesma função já usada por
 * todo o resto do fluxo da venda, nunca uma segunda implementação da
 * fórmula de totais.
 */
export async function redeemLoyaltyPointsAction(
  saleId: string,
  _prevState: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const points = Number(formData.get("points"));

  if (!Number.isInteger(points) || points <= 0) {
    return { error: "Informe uma quantidade de pontos válida." };
  }

  const current = await getCurrentCompany();
  if (!current) {
    return { error: "Nenhuma empresa encontrada para o usuário atual." };
  }

  const supabase = createClient();
  const { error } = await supabase.rpc("redeem_loyalty_points", {
    p_sale_id: saleId,
    p_points: points,
  });

  if (error) {
    return { error: error.message || "Não foi possível usar os pontos de fidelidade." };
  }

  const recalculated = await recalculateSaleTotals(supabase, saleId, current.company.id);
  if (!recalculated.ok) {
    return { error: recalculated.error };
  }

  revalidatePath(`/app/vendas/${saleId}`);
  revalidatePath("/app/vendas/nova");
  return { success: "Pontos aplicados como desconto." };
}

/**
 * Desfaz o(s) resgate(s) de pontos de fidelidade de uma venda ainda em
 * rascunho — a "saída" que o usuário precisa para poder trocar/remover o
 * cliente ou reduzir os itens abaixo do desconto de fidelidade (guards em
 * lib/sales/actions.ts). Toda a restauração (FIFO, trava de linha,
 * ledger, idempotência) acontece dentro de
 * public.undo_loyalty_redemption_for_draft_sale (Etapa 1D.6A) — esta
 * Server Action só chama a função e recalcula os totais da venda depois,
 * mesmo padrão de redeemLoyaltyPointsAction para o caminho inverso.
 */
export async function removeLoyaltyRedemptionFromDraftAction(
  saleId: string
): Promise<ActionResult> {
  const current = await getCurrentCompany();
  if (!current) {
    return { error: "Nenhuma empresa encontrada para o usuário atual." };
  }

  const supabase = createClient();
  const { error } = await supabase.rpc("undo_loyalty_redemption_for_draft_sale", {
    p_sale_id: saleId,
  });

  if (error) {
    return { error: error.message || "Não foi possível remover o resgate de pontos." };
  }

  const recalculated = await recalculateSaleTotals(supabase, saleId, current.company.id);
  if (!recalculated.ok) {
    return { error: recalculated.error };
  }

  revalidatePath(`/app/vendas/${saleId}`);
  return { success: "Resgate de pontos removido." };
}

/**
 * Ajuste manual de pontos — só owner/admin (checado dentro de
 * public.adjust_loyalty_points, já que a função é SECURITY DEFINER e
 * ignora RLS). Motivo obrigatório.
 */
export async function adjustLoyaltyPointsAction(
  customerId: string,
  _prevState: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const points = Number(formData.get("points"));
  const reason = (formData.get("reason") as string | null)?.trim() || "";

  if (!Number.isInteger(points) || points === 0) {
    return { error: "Informe uma quantidade de pontos diferente de zero." };
  }
  if (!reason) {
    return { error: "Informe o motivo do ajuste." };
  }

  const current = await getCurrentCompany();
  if (!current) {
    return { error: "Nenhuma empresa encontrada para o usuário atual." };
  }

  const supabase = createClient();
  const { error } = await supabase.rpc("adjust_loyalty_points", {
    p_customer_id: customerId,
    p_points: points,
    p_reason: reason,
  });

  if (error) {
    return { error: error.message || "Não foi possível ajustar os pontos." };
  }

  revalidatePath(`/app/clientes/${customerId}`);
  return { success: "Pontos ajustados." };
}

/**
 * Cria/atualiza a configuração de fidelidade da empresa atual (1 linha em
 * loyalty_settings). Só owner/admin — checado aqui no servidor, nunca
 * confiando no que a UI esconde/desabilita. company_id nunca vem do
 * formulário: sempre resolvido a partir do usuário autenticado.
 *
 * grant_on é sempre gravado como 'completion' — a única opção com gatilho
 * implementado nesta fase (full_payment ainda não existe) — mesmo que,
 * por algum motivo, outro valor chegasse no FormData.
 */
export async function upsertLoyaltySettingsAction(
  _prevState: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const current = await getCurrentCompany();
  if (!current) {
    return { error: "Nenhuma empresa encontrada para o usuário atual." };
  }
  if (current.role === "employee") {
    return { error: "Apenas owner/admin podem alterar as configurações de fidelidade." };
  }

  const enabled = formData.get("enabled") === "on";
  const pointsExpire = formData.get("pointsExpire") === "on";

  const pointsPerCurrencyUnit = parseRequiredNumber(formData.get("pointsPerCurrencyUnit"));
  if (pointsPerCurrencyUnit === null || pointsPerCurrencyUnit <= 0) {
    return { error: "Pontos por unidade monetária deve ser um número maior que zero." };
  }

  const redemptionValuePerPoint = parseRequiredNumber(formData.get("redemptionValuePerPoint"));
  if (redemptionValuePerPoint === null || redemptionValuePerPoint <= 0) {
    return { error: "O valor de cada ponto no resgate deve ser maior que zero." };
  }

  const minPurchaseAmountForPoints = parseRequiredNumber(formData.get("minPurchaseAmountForPoints"), {
    min: 0,
  });
  if (minPurchaseAmountForPoints === null) {
    return { error: "Valor mínimo de compra inválido." };
  }

  const minPointsToRedeem = parseRequiredNumber(formData.get("minPointsToRedeem"), {
    min: 0,
    integer: true,
  });
  if (minPointsToRedeem === null) {
    return { error: "Mínimo de pontos para resgate deve ser um número inteiro maior ou igual a zero." };
  }

  const maxRedeemPercentPerSale = parseOptionalNumber(formData.get("maxRedeemPercentPerSale"), {
    min: 0,
    max: 100,
  });
  if (maxRedeemPercentPerSale === undefined) {
    return {
      error: "O percentual máximo por venda deve ser maior que 0 e no máximo 100, ou deixado em branco.",
    };
  }

  const birthdayBonusPoints = parseRequiredNumber(formData.get("birthdayBonusPoints"), {
    min: 0,
    integer: true,
  });
  if (birthdayBonusPoints === null) {
    return { error: "Bônus de aniversário deve ser um número inteiro maior ou igual a zero." };
  }

  const firstPurchaseBonusPoints = parseRequiredNumber(formData.get("firstPurchaseBonusPoints"), {
    min: 0,
    integer: true,
  });
  if (firstPurchaseBonusPoints === null) {
    return { error: "Bônus de primeira compra deve ser um número inteiro maior ou igual a zero." };
  }

  let pointsExpireAfterDays: number | null = null;
  if (pointsExpire) {
    const days = parseRequiredNumber(formData.get("pointsExpireAfterDays"), { min: 1, integer: true });
    if (days === null) {
      return { error: "Informe um número de dias maior que zero para a expiração de pontos." };
    }
    pointsExpireAfterDays = days;
  }

  const supabase = createClient();
  const { error } = await supabase.from("loyalty_settings").upsert(
    {
      company_id: current.company.id,
      enabled,
      points_per_currency_unit: pointsPerCurrencyUnit,
      redemption_value_per_point: redemptionValuePerPoint,
      min_purchase_amount_for_points: minPurchaseAmountForPoints,
      min_points_to_redeem: minPointsToRedeem,
      max_redeem_percent_per_sale: maxRedeemPercentPerSale,
      points_expire: pointsExpire,
      points_expire_after_days: pointsExpireAfterDays,
      birthday_bonus_points: birthdayBonusPoints,
      first_purchase_bonus_points: firstPurchaseBonusPoints,
      grant_on: "completion",
    },
    { onConflict: "company_id" }
  );

  if (error) {
    return { error: error.message || "Não foi possível salvar as configurações. Tente novamente." };
  }

  revalidatePath("/app/fidelidade");
  return { success: "Configurações de fidelidade salvas." };
}

function normalizeTierName(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Recalcula sort_order de todos os níveis da empresa a partir de
 * min_lifetime_points crescente — a ordem nunca é editável diretamente
 * pelo usuário, sempre derivada dos pontos, para tornar estruturalmente
 * impossível salvar níveis fora de ordem. Usa um offset temporário bem
 * acima de qualquer valor real (sort_order >= 0 é exigido pelo banco,
 * por isso não dá para usar negativos) para nunca violar
 * UNIQUE(company_id, sort_order) ao reatribuir posições — ex.: dois
 * níveis trocando de posição entre si.
 */
async function resequenceLoyaltyTierThresholds(
  supabase: SupabaseClient<Database>,
  companyId: string
): Promise<void> {
  const { data: rows } = await supabase
    .from("loyalty_tier_thresholds")
    .select("id")
    .eq("company_id", companyId)
    .order("min_lifetime_points", { ascending: true });

  if (!rows || rows.length === 0) return;

  await Promise.all(
    rows.map((row, index) =>
      supabase
        .from("loyalty_tier_thresholds")
        .update({ sort_order: 100000 + index })
        .eq("id", row.id)
    )
  );
  await Promise.all(
    rows.map((row, index) =>
      supabase.from("loyalty_tier_thresholds").update({ sort_order: index }).eq("id", row.id)
    )
  );
}

/** Cria um novo nível de fidelidade — só owner/admin. Ordem final é sempre recalculada a partir dos pontos, nunca informada pelo formulário. */
export async function createLoyaltyTierThresholdAction(
  _prevState: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const current = await getCurrentCompany();
  if (!current) {
    return { error: "Nenhuma empresa encontrada para o usuário atual." };
  }
  if (current.role === "employee") {
    return { error: "Apenas owner/admin podem configurar níveis de fidelidade." };
  }

  const name = normalizeTierName(formData.get("name"));
  if (!name) {
    return { error: "Informe o nome do nível." };
  }

  const minLifetimePoints = parseRequiredNumber(formData.get("minLifetimePoints"), {
    min: 0,
    integer: true,
  });
  if (minLifetimePoints === null) {
    return { error: "Pontos mínimos deve ser um número inteiro maior ou igual a zero." };
  }

  const supabase = createClient();

  const { data: existing } = await supabase
    .from("loyalty_tier_thresholds")
    .select("name, min_lifetime_points")
    .eq("company_id", current.company.id);

  const rows = existing ?? [];
  if (rows.some((row) => row.name.toLowerCase() === name.toLowerCase())) {
    return { error: "Já existe um nível com esse nome." };
  }
  if (rows.some((row) => row.min_lifetime_points === minLifetimePoints)) {
    return { error: "Já existe um nível com essa mesma quantidade de pontos mínimos." };
  }

  const { error: insertError } = await supabase.from("loyalty_tier_thresholds").insert({
    company_id: current.company.id,
    name,
    min_lifetime_points: minLifetimePoints,
    // Provisório: maior que qualquer índice existente (0..rows.length-1),
    // nunca colide — resequenceLoyaltyTierThresholds ajusta a posição real.
    sort_order: rows.length,
  });

  if (insertError) {
    // Checagem em código (acima) cobre o caso comum; a constraint UNIQUE
    // (company_id, min_lifetime_points) — migration 020 — é quem garante
    // a regra sob concorrência real (duplo clique/duas abas).
    if (insertError.code === "23505") {
      return { error: "Já existe um nível com essa mesma quantidade de pontos mínimos." };
    }
    return { error: insertError.message || "Não foi possível criar o nível. Tente novamente." };
  }

  await resequenceLoyaltyTierThresholds(supabase, current.company.id);

  revalidatePath("/app/fidelidade");
  return { success: "Nível criado." };
}

/** Atualiza nome/pontos de um nível existente — só owner/admin. */
export async function updateLoyaltyTierThresholdAction(
  thresholdId: string,
  _prevState: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const current = await getCurrentCompany();
  if (!current) {
    return { error: "Nenhuma empresa encontrada para o usuário atual." };
  }
  if (current.role === "employee") {
    return { error: "Apenas owner/admin podem configurar níveis de fidelidade." };
  }

  const name = normalizeTierName(formData.get("name"));
  if (!name) {
    return { error: "Informe o nome do nível." };
  }

  const minLifetimePoints = parseRequiredNumber(formData.get("minLifetimePoints"), {
    min: 0,
    integer: true,
  });
  if (minLifetimePoints === null) {
    return { error: "Pontos mínimos deve ser um número inteiro maior ou igual a zero." };
  }

  const supabase = createClient();

  const { data: existing } = await supabase
    .from("loyalty_tier_thresholds")
    .select("id, name, min_lifetime_points")
    .eq("company_id", current.company.id);

  const rows = existing ?? [];
  if (!rows.some((row) => row.id === thresholdId)) {
    return { error: "Nível não encontrado." };
  }

  const others = rows.filter((row) => row.id !== thresholdId);
  if (others.some((row) => row.name.toLowerCase() === name.toLowerCase())) {
    return { error: "Já existe um nível com esse nome." };
  }
  if (others.some((row) => row.min_lifetime_points === minLifetimePoints)) {
    return { error: "Já existe um nível com essa mesma quantidade de pontos mínimos." };
  }

  const { error: updateError } = await supabase
    .from("loyalty_tier_thresholds")
    .update({ name, min_lifetime_points: minLifetimePoints })
    .eq("id", thresholdId)
    .eq("company_id", current.company.id);

  if (updateError) {
    if (updateError.code === "23505") {
      return { error: "Já existe um nível com essa mesma quantidade de pontos mínimos." };
    }
    return { error: updateError.message || "Não foi possível salvar o nível. Tente novamente." };
  }

  await resequenceLoyaltyTierThresholds(supabase, current.company.id);

  revalidatePath("/app/fidelidade");
  return { success: "Nível atualizado." };
}

/**
 * Exclui um nível — só owner/admin. Nenhuma outra tabela referencia
 * loyalty_tier_thresholds (sem FK apontando para cá), então a exclusão é
 * sempre estruturalmente segura; o único limite é de negócio: nunca
 * deixar a empresa sem nenhum nível configurado (calculateLoyaltyTier
 * cairia no fallback de DEFAULT_TIER_THRESHOLDS silenciosamente, o que
 * confundiria mais do que ajudaria).
 */
export async function deleteLoyaltyTierThresholdAction(thresholdId: string): Promise<ActionResult> {
  const current = await getCurrentCompany();
  if (!current) {
    return { error: "Nenhuma empresa encontrada para o usuário atual." };
  }
  if (current.role === "employee") {
    return { error: "Apenas owner/admin podem configurar níveis de fidelidade." };
  }

  const supabase = createClient();

  const { count } = await supabase
    .from("loyalty_tier_thresholds")
    .select("id", { count: "exact", head: true })
    .eq("company_id", current.company.id);

  if ((count ?? 0) <= 1) {
    return { error: "Mantenha ao menos um nível configurado." };
  }

  const { error: deleteError } = await supabase
    .from("loyalty_tier_thresholds")
    .delete()
    .eq("id", thresholdId)
    .eq("company_id", current.company.id);

  if (deleteError) {
    return { error: deleteError.message || "Não foi possível excluir o nível. Tente novamente." };
  }

  await resequenceLoyaltyTierThresholds(supabase, current.company.id);

  revalidatePath("/app/fidelidade");
  return { success: "Nível excluído." };
}

const DUPLICATE_MULTIPLIER_ERROR =
  "Este item já possui um multiplicador. Edite o multiplicador existente em vez de criar um novo.";

/**
 * Cria um multiplicador de pontos para um produto OU serviço (nunca
 * ambos — mesma exclusividade de public.loyalty_multipliers) — só
 * owner/admin. Verifica duplicidade antes do insert (evita uma segunda
 * linha para o mesmo item) e também trata a violação UNIQUE do banco
 * (código 23505) como a mesma mensagem amigável, cobrindo o caso de
 * concorrência (dois cliques/duas abas criando ao mesmo tempo).
 */
export async function createLoyaltyMultiplierAction(
  _prevState: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const current = await getCurrentCompany();
  if (!current) {
    return { error: "Nenhuma empresa encontrada para o usuário atual." };
  }
  if (current.role === "employee") {
    return { error: "Apenas owner/admin podem configurar multiplicadores de fidelidade." };
  }

  const targetType = formData.get("targetType");
  if (targetType !== "product" && targetType !== "service") {
    return { error: "Selecione produto ou serviço." };
  }

  const targetId = formData.get("targetId");
  if (typeof targetId !== "string" || !targetId) {
    return { error: "Selecione um item." };
  }

  const multiplier = parseRequiredNumber(formData.get("multiplier"), { min: 0, max: 100 });
  if (multiplier === null) {
    return { error: "O multiplicador deve ser um número entre 0 e 100." };
  }

  const supabase = createClient();

  // Confirma que o item existe e pertence à empresa atual — nunca
  // confiado só pelo que o formulário envia.
  const { data: item } = await supabase
    .from(targetType === "product" ? "products" : "services")
    .select("id")
    .eq("id", targetId)
    .eq("company_id", current.company.id)
    .maybeSingle();

  if (!item) {
    return {
      error:
        targetType === "product"
          ? "Produto não encontrado ou não pertence a esta empresa."
          : "Serviço não encontrado ou não pertence a esta empresa.",
    };
  }

  const { data: existing } = await supabase
    .from("loyalty_multipliers")
    .select("id")
    .eq("company_id", current.company.id)
    .eq(targetType === "product" ? "product_id" : "service_id", targetId)
    .maybeSingle();

  if (existing) {
    return { error: DUPLICATE_MULTIPLIER_ERROR };
  }

  const { error: insertError } = await supabase.from("loyalty_multipliers").insert({
    company_id: current.company.id,
    product_id: targetType === "product" ? targetId : null,
    service_id: targetType === "service" ? targetId : null,
    multiplier,
  });

  if (insertError) {
    if (insertError.code === "23505") {
      return { error: DUPLICATE_MULTIPLIER_ERROR };
    }
    return { error: insertError.message || "Não foi possível criar o multiplicador. Tente novamente." };
  }

  revalidatePath("/app/fidelidade");
  return { success: "Multiplicador criado." };
}

/** Atualiza só o valor do multiplicador (o item de destino não muda depois de criado) — só owner/admin. */
export async function updateLoyaltyMultiplierAction(
  multiplierId: string,
  _prevState: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const current = await getCurrentCompany();
  if (!current) {
    return { error: "Nenhuma empresa encontrada para o usuário atual." };
  }
  if (current.role === "employee") {
    return { error: "Apenas owner/admin podem configurar multiplicadores de fidelidade." };
  }

  const multiplier = parseRequiredNumber(formData.get("multiplier"), { min: 0, max: 100 });
  if (multiplier === null) {
    return { error: "O multiplicador deve ser um número entre 0 e 100." };
  }

  const supabase = createClient();
  const { error: updateError } = await supabase
    .from("loyalty_multipliers")
    .update({ multiplier })
    .eq("id", multiplierId)
    .eq("company_id", current.company.id);

  if (updateError) {
    return { error: updateError.message || "Não foi possível salvar o multiplicador. Tente novamente." };
  }

  revalidatePath("/app/fidelidade");
  return { success: "Multiplicador atualizado." };
}

/**
 * Remove a regra de multiplicador — nunca o produto/serviço em si.
 * Vendas futuras desse item simplesmente voltam a usar o multiplicador
 * padrão (1x, ausência de override); vendas passadas e o ledger de
 * pontos (loyalty_transactions) já gravado não são tocados — a regra é
 * só de cálculo futuro, sem histórico próprio.
 */
export async function deleteLoyaltyMultiplierAction(multiplierId: string): Promise<ActionResult> {
  const current = await getCurrentCompany();
  if (!current) {
    return { error: "Nenhuma empresa encontrada para o usuário atual." };
  }
  if (current.role === "employee") {
    return { error: "Apenas owner/admin podem configurar multiplicadores de fidelidade." };
  }

  const supabase = createClient();
  const { error: deleteError } = await supabase
    .from("loyalty_multipliers")
    .delete()
    .eq("id", multiplierId)
    .eq("company_id", current.company.id);

  if (deleteError) {
    return { error: deleteError.message || "Não foi possível remover o multiplicador. Tente novamente." };
  }

  revalidatePath("/app/fidelidade");
  return { success: "Multiplicador removido." };
}

type CampaignInput = {
  name: string;
  description: string | null;
  multiplier: number | null;
  bonusPoints: number | null;
  startsAt: string;
  endsAt: string;
  status: "active" | "inactive";
};

/**
 * Valida os campos de campanha comuns a criar/editar. Datas usam <input
 * type="date"> (mesmo padrão de registeredFrom/registeredTo em
 * raffles/actions.ts): starts_at vira início do dia, ends_at vira fim do
 * dia (23:59:59.999) no fuso local — assim uma campanha de 1 dia só
 * (startsAt === endsAt) já satisfaz ends_at > starts_at naturalmente.
 *
 * Escopo (product_id/service_id) não é um campo aqui: esta versão só cria
 * campanhas de venda inteira, já que grant_loyalty_points_for_sale()
 * ignora por completo qualquer campanha com product_id/service_id
 * preenchido — nunca oferecer no formulário uma regra que o backend não
 * aplica.
 */
function parseCampaignInput(formData: FormData): CampaignInput | { error: string } {
  const name = (formData.get("name") as string | null)?.trim() ?? "";
  if (!name) {
    return { error: "Informe o nome da campanha." };
  }
  if (name.length > 100) {
    return { error: "O nome da campanha deve ter no máximo 100 caracteres." };
  }

  const descriptionRaw = (formData.get("description") as string | null)?.trim() ?? "";
  if (descriptionRaw.length > 500) {
    return { error: "A descrição deve ter no máximo 500 caracteres." };
  }
  const description = descriptionRaw || null;

  // parseOptionalNumber trata `min` como limite exclusivo (parsed <= min é
  // rejeitado) — não serve aqui, já que o banco exige multiplier >= 0
  // (inclusive). Validado manualmente para respeitar o limite exato do
  // constraint (multiplier >= 0 and multiplier <= 100).
  const multiplierRaw = parseOptionalNumber(formData.get("multiplier"));
  if (
    multiplierRaw === undefined ||
    (multiplierRaw !== null && (multiplierRaw < 0 || multiplierRaw > 100))
  ) {
    return { error: "O multiplicador deve ser um número entre 0 e 100, ou deixado em branco." };
  }
  const multiplier = multiplierRaw;

  const bonusPointsRaw = parseOptionalNumber(formData.get("bonusPoints"));
  if (
    bonusPointsRaw === undefined ||
    (bonusPointsRaw !== null && (!Number.isInteger(bonusPointsRaw) || bonusPointsRaw < 0))
  ) {
    return { error: "O bônus em pontos deve ser um número inteiro maior ou igual a zero, ou deixado em branco." };
  }
  const bonusPoints = bonusPointsRaw;

  if (multiplier === null && bonusPoints === null) {
    return { error: "Informe um multiplicador, um bônus em pontos, ou ambos." };
  }

  const startsAtRaw = formData.get("startsAt") as string | null;
  if (!startsAtRaw) {
    return { error: "Informe a data inicial da campanha." };
  }
  const startsAtDate = new Date(startsAtRaw);
  if (Number.isNaN(startsAtDate.getTime())) {
    return { error: "Data inicial inválida." };
  }

  const endsAtRaw = formData.get("endsAt") as string | null;
  if (!endsAtRaw) {
    return { error: "Informe a data final da campanha." };
  }
  const endsAtDate = new Date(endsAtRaw);
  if (Number.isNaN(endsAtDate.getTime())) {
    return { error: "Data final inválida." };
  }
  endsAtDate.setHours(23, 59, 59, 999);

  if (endsAtDate.getTime() <= startsAtDate.getTime()) {
    return { error: "A data final deve ser depois da data inicial." };
  }

  const statusRaw = formData.get("status");
  const status = statusRaw === "inactive" ? "inactive" : "active";

  return {
    name,
    description,
    multiplier,
    bonusPoints,
    startsAt: startsAtDate.toISOString(),
    endsAt: endsAtDate.toISOString(),
    status,
  };
}

/**
 * Cria uma campanha de fidelidade — só owner/admin. Sempre grava
 * product_id/service_id como null (escopo "venda inteira"): esta versão
 * não expõe nenhuma forma de escolher produto/serviço no formulário, então
 * não há como o cliente enviar um escopo específico, mas os dois campos
 * são fixados aqui mesmo assim como reforço (nunca confiar só na ausência
 * de um input na UI).
 */
export async function createLoyaltyCampaignAction(
  _prevState: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const current = await getCurrentCompany();
  if (!current) {
    return { error: "Nenhuma empresa encontrada para o usuário atual." };
  }
  if (current.role === "employee") {
    return { error: "Apenas owner/admin podem configurar campanhas de fidelidade." };
  }

  const parsed = parseCampaignInput(formData);
  if ("error" in parsed) {
    return parsed;
  }

  const supabase = createClient();
  const { error: insertError } = await supabase.from("loyalty_campaigns").insert({
    company_id: current.company.id,
    name: parsed.name,
    description: parsed.description,
    multiplier: parsed.multiplier,
    bonus_points: parsed.bonusPoints,
    product_id: null,
    service_id: null,
    starts_at: parsed.startsAt,
    ends_at: parsed.endsAt,
    status: parsed.status,
  });

  if (insertError) {
    return { error: insertError.message || "Não foi possível criar a campanha. Tente novamente." };
  }

  revalidatePath("/app/fidelidade");
  return { success: "Campanha criada." };
}

/**
 * Atualiza uma campanha existente — só owner/admin. Não altera
 * product_id/service_id (a coluna nem entra no UPDATE): se uma linha
 * legada já tivesse escopo específico, editar nome/data/multiplicador por
 * aqui não muda isso. Editar uma campanha já usada em vendas passadas não
 * toca loyalty_transactions nem qualquer venda concluída — a campanha só é
 * lida no momento da conclusão da venda (grant_loyalty_points_for_sale),
 * nunca depois.
 */
export async function updateLoyaltyCampaignAction(
  campaignId: string,
  _prevState: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const current = await getCurrentCompany();
  if (!current) {
    return { error: "Nenhuma empresa encontrada para o usuário atual." };
  }
  if (current.role === "employee") {
    return { error: "Apenas owner/admin podem configurar campanhas de fidelidade." };
  }

  const parsed = parseCampaignInput(formData);
  if ("error" in parsed) {
    return parsed;
  }

  const supabase = createClient();
  const { error: updateError } = await supabase
    .from("loyalty_campaigns")
    .update({
      name: parsed.name,
      description: parsed.description,
      multiplier: parsed.multiplier,
      bonus_points: parsed.bonusPoints,
      starts_at: parsed.startsAt,
      ends_at: parsed.endsAt,
      status: parsed.status,
    })
    .eq("id", campaignId)
    .eq("company_id", current.company.id);

  if (updateError) {
    return { error: updateError.message || "Não foi possível salvar a campanha. Tente novamente." };
  }

  revalidatePath("/app/fidelidade");
  return { success: "Campanha atualizada." };
}

/**
 * Ativa/desativa uma campanha — só owner/admin. Nunca exclui (histórico é
 * preservado); apenas muda o status lido por
 * grant_loyalty_points_for_sale() na próxima venda concluída dentro do
 * período.
 */
export async function setLoyaltyCampaignStatusAction(
  campaignId: string,
  status: "active" | "inactive"
): Promise<ActionResult> {
  const current = await getCurrentCompany();
  if (!current) {
    return { error: "Nenhuma empresa encontrada para o usuário atual." };
  }
  if (current.role === "employee") {
    return { error: "Apenas owner/admin podem configurar campanhas de fidelidade." };
  }

  const supabase = createClient();
  const { error: updateError } = await supabase
    .from("loyalty_campaigns")
    .update({ status })
    .eq("id", campaignId)
    .eq("company_id", current.company.id);

  if (updateError) {
    return { error: updateError.message || "Não foi possível atualizar o status da campanha. Tente novamente." };
  }

  revalidatePath("/app/fidelidade");
  return { success: status === "active" ? "Campanha ativada." : "Campanha desativada." };
}
