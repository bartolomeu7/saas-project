"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getCurrentCompany } from "@/lib/companies/queries";
import { getCurrentUser } from "@/lib/auth/session";
import {
  addSaleItemSchema,
  addSalePaymentSchema,
  cancelSaleSchema,
  updateDraftSaleSchema,
  updateSaleItemSchema,
} from "@/lib/validations/sale";
import { writeAuditLog } from "@/lib/audit/log";
import { AUDIT_ACTIONS } from "@/types/audit";
import {
  searchCustomersForSale,
  searchProductsForSale,
  searchServicesForSale,
} from "@/lib/sales/queries";
import type { ActionResult } from "@/lib/auth/actions";
import type { Database } from "@/types/supabase";
import type { CustomerPick, ProductPick, ServicePick } from "@/types/sale";
import {
  round2,
  ROUNDING_TOLERANCE,
  LOYALTY_DISCOUNT_EXCEEDS_SUBTOTAL_ERROR,
  recalculateSaleTotals,
} from "@/lib/sales/totals";

function formatBRL(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/**
 * Saldo restante de uma venda = total da venda - soma dos pagamentos com
 * status 'paid' (mesmo critério do trigger recompute_sale_payment_status
 * do banco). Retorna null se a leitura falhar — o chamador nunca deve
 * tratar null como "saldo zero" ou "saldo livre".
 */
async function getSaleRemainingBalance(
  supabase: SupabaseClient<Database>,
  saleId: string,
  totalAmount: number
): Promise<number | null> {
  const { data: payments, error } = await supabase
    .from("sale_payments")
    .select("amount")
    .eq("sale_id", saleId)
    .eq("status", "paid");

  if (error) {
    return null;
  }

  const totalPaid = round2((payments ?? []).reduce((sum, p) => sum + Number(p.amount), 0));
  return round2(totalAmount - totalPaid);
}

/**
 * Reconfere, depois do insert, se um pagamento específico ainda cabe
 * dentro do saldo da venda quando somado em ordem de inserção com os
 * demais pagamentos 'paid' já existentes — fecha a janela de corrida
 * entre a checagem de saldo e o insert em addSalePaymentAction (duas
 * requisições concorrentes podem ambas passar pela checagem antes de
 * qualquer uma inserir). Sem uma função de banco dedicada (fora do
 * escopo desta correção), este é o equivalente possível no nível da
 * aplicação: insert otimista + reconferência determinística +
 * compensação (delete) do pagamento que estourou o limite.
 */
async function confirmPaymentWithinBalance(
  supabase: SupabaseClient<Database>,
  saleId: string,
  paymentId: string,
  totalAmount: number
): Promise<boolean> {
  const { data: payments, error } = await supabase
    .from("sale_payments")
    .select("id, amount, created_at")
    .eq("sale_id", saleId)
    .eq("status", "paid")
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });

  if (error || !payments) {
    return false;
  }

  let running = 0;
  for (const payment of payments) {
    running = round2(running + Number(payment.amount));
    if (payment.id === paymentId) {
      return running <= totalAmount + ROUNDING_TOLERANCE;
    }
  }

  // O próprio pagamento não apareceu na releitura — trata como falha
  // (nunca assume "ok" sem ter confirmado).
  return false;
}

/** Garante que a venda existe, pertence à empresa e está em rascunho. */
async function getDraftSaleOrError(
  supabase: SupabaseClient<Database>,
  companyId: string,
  saleId: string
): Promise<
  | { error: string }
  | {
      sale: {
        id: string;
        status: string;
        subtotal: number;
        customer_id: string | null;
        loyalty_points_redeemed: number;
        loyalty_discount_amount: number;
      };
    }
> {
  const { data: sale } = await supabase
    .from("sales")
    .select("id, status, subtotal, customer_id, loyalty_points_redeemed, loyalty_discount_amount")
    .eq("id", saleId)
    .eq("company_id", companyId)
    .maybeSingle();

  if (!sale) {
    return { error: "Venda não encontrada." };
  }
  if (sale.status !== "draft") {
    return { error: "Só é possível alterar uma venda enquanto ela está em rascunho." };
  }
  return { sale };
}

/**
 * Buscas leves para os pickers de produto/serviço/cliente na tela de
 * montagem da venda — chamadas diretamente do client component (Server
 * Actions podem ser invocadas como funções normais, não só via form).
 * Sempre reconfirmam a empresa atual no servidor, nunca aceitam
 * companyId do cliente.
 */
export async function searchProductsAction(query: string): Promise<ProductPick[]> {
  const current = await getCurrentCompany();
  if (!current) return [];
  return searchProductsForSale(current.company.id, query);
}

export async function searchServicesAction(query: string): Promise<ServicePick[]> {
  const current = await getCurrentCompany();
  if (!current) return [];
  return searchServicesForSale(current.company.id, query);
}

export async function searchCustomersAction(query: string): Promise<CustomerPick[]> {
  const current = await getCurrentCompany();
  if (!current) return [];
  return searchCustomersForSale(current.company.id, query);
}

/** Cria uma venda em rascunho (venda balcão, sem cliente e sem itens) e leva para o construtor. */
export async function createSaleAction(_formData: FormData): Promise<void> {
  const current = await getCurrentCompany();
  if (!current) {
    redirect("/app/vendas");
  }

  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from("sales")
    .insert({ company_id: current.company.id, user_id: user.id })
    .select("id")
    .single();

  if (error || !data) {
    redirect("/app/vendas");
  }

  await writeAuditLog(supabase, {
    companyId: current.company.id,
    actorUserId: user.id,
    entityType: "sale",
    entityId: data.id,
    action: AUDIT_ACTIONS.SALE_CREATED,
  });

  revalidatePath("/app/vendas");
  redirect(`/app/vendas/${data.id}`);
}

/**
 * Atualiza campos de uma venda em rascunho: cliente e/ou desconto
 * global. Só altera os campos realmente presentes no FormData — permite
 * que o picker de cliente e o campo de desconto submetam
 * independentemente sem precisar reenviar tudo.
 */
export async function updateDraftSaleAction(
  saleId: string,
  _prevState: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const current = await getCurrentCompany();
  if (!current) {
    return { error: "Nenhuma empresa encontrada para o usuário atual." };
  }

  const supabase = createClient();
  const guard = await getDraftSaleOrError(supabase, current.company.id, saleId);
  if ("error" in guard) {
    return { error: guard.error };
  }

  const updates: { customer_id?: string | null; discount_amount?: number } = {};

  if (formData.has("customerId")) {
    const parsed = updateDraftSaleSchema.pick({ customerId: true }).safeParse({
      customerId: formData.get("customerId"),
    });
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Cliente inválido." };
    }

    // Trocar ou remover o cliente de uma venda com resgate de pontos ativo
    // deixaria o desconto de fidelidade "órfão" (pontos já debitados de um
    // cliente que deixou de ser o desta venda). Reselecionar o MESMO
    // cliente (no-op) continua permitido mesmo com resgate ativo.
    if (
      guard.sale.loyalty_points_redeemed > 0 &&
      parsed.data.customerId !== guard.sale.customer_id
    ) {
      return {
        error: "Remova o uso de pontos antes de alterar o cliente desta venda.",
      };
    }

    if (parsed.data.customerId) {
      const { data: customer } = await supabase
        .from("customers")
        .select("id")
        .eq("id", parsed.data.customerId)
        .eq("company_id", current.company.id)
        .maybeSingle();
      if (!customer) {
        return { error: "Cliente inválido." };
      }
    }
    updates.customer_id = parsed.data.customerId;
  }

  if (formData.has("discountAmount")) {
    const parsed = updateDraftSaleSchema.pick({ discountAmount: true }).safeParse({
      discountAmount: formData.get("discountAmount"),
    });
    if (!parsed.success || parsed.data.discountAmount === undefined) {
      return { error: parsed.error?.issues[0]?.message ?? "Desconto inválido." };
    }
    // O valor deste campo é só o desconto MANUAL — nunca sobrescreve
    // loyalty_discount_amount. A soma dos dois nunca pode ultrapassar o
    // subtotal (mesma regra de recalculateSaleTotals, checada aqui também
    // porque este campo não passa por lá antes de ser gravado).
    const combined = round2(parsed.data.discountAmount + guard.sale.loyalty_discount_amount);
    if (combined > guard.sale.subtotal + ROUNDING_TOLERANCE) {
      return {
        error:
          guard.sale.loyalty_discount_amount > 0
            ? `O desconto manual somado ao desconto de fidelidade (${formatBRL(guard.sale.loyalty_discount_amount)}) não pode ultrapassar o subtotal da venda (${formatBRL(guard.sale.subtotal)}).`
            : "O desconto não pode ser maior que o subtotal da venda.",
      };
    }
    updates.discount_amount = parsed.data.discountAmount;
  }

  if (Object.keys(updates).length > 0) {
    const { error } = await supabase
      .from("sales")
      .update(updates)
      .eq("id", saleId)
      .eq("company_id", current.company.id);
    if (error) {
      return { error: "Não foi possível salvar as alterações. Tente novamente." };
    }
  }

  const recalculated = await recalculateSaleTotals(supabase, saleId, current.company.id);
  if (!recalculated.ok) {
    return { error: recalculated.error };
  }

  const user = await getCurrentUser();
  await writeAuditLog(supabase, {
    companyId: current.company.id,
    actorUserId: user?.id ?? null,
    entityType: "sale",
    entityId: saleId,
    action: AUDIT_ACTIONS.SALE_UPDATED,
    metadata: updates,
  });

  revalidatePath(`/app/vendas/${saleId}`);
  return { success: "Venda atualizada." };
}

/**
 * Adiciona um item (produto ou serviço) a uma venda em rascunho. O
 * preço/custo NUNCA vem do formulário — sempre buscados no servidor a
 * partir do catálogo real no momento da adição, e então copiados
 * (snapshot) para o item.
 */
export async function addSaleItemAction(
  saleId: string,
  _prevState: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const parsed = addSaleItemSchema.safeParse({
    itemType: formData.get("itemType"),
    // ProductPicker/ServicePicker só enviam o id do tipo escolhido — a
    // chave do outro nunca é setada no FormData, e formData.get() de uma
    // chave ausente retorna null (não undefined). O schema aceita
    // string | undefined | "", mas nunca null, então isso sempre falhava
    // com o erro genérico de união do Zod ("Invalid input") antes de
    // chegar em qualquer validação de negócio. Normaliza aqui, no único
    // ponto de entrada, em vez de exigir que cada picker lembre de
    // mandar os dois campos.
    productId: formData.get("productId") ?? "",
    serviceId: formData.get("serviceId") ?? "",
    quantity: formData.get("quantity"),
    discountAmount: formData.get("discountAmount") || "0",
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const current = await getCurrentCompany();
  if (!current) {
    return { error: "Nenhuma empresa encontrada para o usuário atual." };
  }

  const supabase = createClient();
  const guard = await getDraftSaleOrError(supabase, current.company.id, saleId);
  if ("error" in guard) {
    return { error: guard.error };
  }

  let description: string;
  let unitPrice: number;
  let unitCost: number;

  if (parsed.data.itemType === "product") {
    // O .refine() do schema já garante productId preenchido quando
    // itemType === "product" — TypeScript não enxerga essa invariante.
    const { data: product } = await supabase
      .from("products")
      .select("id, name, sale_price, cost_price, status, stock_quantity")
      .eq("id", parsed.data.productId!)
      .eq("company_id", current.company.id)
      .maybeSingle();
    if (!product || product.status !== "active") {
      return { error: "Produto não encontrado ou inativo." };
    }
    // Validação de disponibilidade no momento de adicionar — não é uma
    // reserva de estoque (nada é debitado aqui; a baixa real e atômica
    // continua só em complete_sale) nem substitui a checagem final, só
    // evita montar/pagar uma venda inteira para só então descobrir falta
    // de estoque na conclusão.
    if (parsed.data.quantity > product.stock_quantity) {
      return {
        error:
          product.stock_quantity <= 0
            ? `"${product.name}" está sem estoque.`
            : `Estoque insuficiente para "${product.name}" (disponível: ${product.stock_quantity}).`,
      };
    }
    description = product.name;
    unitPrice = product.sale_price;
    unitCost = product.cost_price;
  } else {
    // Idem: .refine() garante serviceId preenchido quando itemType === "service".
    const { data: service } = await supabase
      .from("services")
      .select("id, name, sale_price, cost_price, status")
      .eq("id", parsed.data.serviceId!)
      .eq("company_id", current.company.id)
      .maybeSingle();
    if (!service || service.status !== "active") {
      return { error: "Serviço não encontrado ou inativo." };
    }
    description = service.name;
    unitPrice = service.sale_price;
    unitCost = service.cost_price;
  }

  const grossSubtotal = round2(parsed.data.quantity * unitPrice);
  if (parsed.data.discountAmount > grossSubtotal) {
    return { error: "O desconto do item não pode ser maior que o subtotal do item." };
  }
  const totalAmount = round2(grossSubtotal - parsed.data.discountAmount);

  const { error: insertError } = await supabase.from("sale_items").insert({
    company_id: current.company.id,
    sale_id: saleId,
    item_type: parsed.data.itemType,
    product_id: parsed.data.itemType === "product" ? parsed.data.productId : null,
    service_id: parsed.data.itemType === "service" ? parsed.data.serviceId : null,
    description,
    quantity: parsed.data.quantity,
    unit_price: unitPrice,
    unit_cost: unitCost,
    discount_amount: parsed.data.discountAmount,
    subtotal: grossSubtotal,
    total_amount: totalAmount,
  });

  if (insertError) {
    return { error: "Não foi possível adicionar o item. Tente novamente." };
  }

  const recalculated = await recalculateSaleTotals(supabase, saleId, current.company.id);
  if (!recalculated.ok) {
    return { error: recalculated.error };
  }

  const user = await getCurrentUser();
  await writeAuditLog(supabase, {
    companyId: current.company.id,
    actorUserId: user?.id ?? null,
    entityType: "sale",
    entityId: saleId,
    action: AUDIT_ACTIONS.SALE_UPDATED,
    metadata: { itemAdded: description, itemType: parsed.data.itemType },
  });

  revalidatePath(`/app/vendas/${saleId}`);
  return { success: `"${description}" adicionado à venda.` };
}

/** Altera quantidade/desconto de um item já existente numa venda em rascunho. */
export async function updateSaleItemAction(
  saleId: string,
  itemId: string,
  _prevState: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const parsed = updateSaleItemSchema.safeParse({
    quantity: formData.get("quantity"),
    discountAmount: formData.get("discountAmount") || "0",
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const current = await getCurrentCompany();
  if (!current) {
    return { error: "Nenhuma empresa encontrada para o usuário atual." };
  }

  const supabase = createClient();
  const guard = await getDraftSaleOrError(supabase, current.company.id, saleId);
  if ("error" in guard) {
    return { error: guard.error };
  }

  const { data: item } = await supabase
    .from("sale_items")
    .select("unit_price, total_amount, item_type, product_id")
    .eq("id", itemId)
    .eq("sale_id", saleId)
    .maybeSingle();
  if (!item) {
    return { error: "Item não encontrado." };
  }

  if (item.item_type === "product" && item.product_id) {
    const { data: product } = await supabase
      .from("products")
      .select("name, stock_quantity")
      .eq("id", item.product_id)
      .maybeSingle();
    if (product && parsed.data.quantity > product.stock_quantity) {
      return {
        error: `Estoque insuficiente para "${product.name}" (disponível: ${product.stock_quantity}).`,
      };
    }
  }

  const grossSubtotal = round2(parsed.data.quantity * item.unit_price);
  if (parsed.data.discountAmount > grossSubtotal) {
    return { error: "O desconto do item não pode ser maior que o subtotal do item." };
  }
  const totalAmount = round2(grossSubtotal - parsed.data.discountAmount);

  // Checagem antecipada (antes de gravar): evita persistir a alteração do
  // item e só depois rejeitar no recalculateSaleTotals, o que deixaria o
  // item já alterado com os totais da venda desatualizados até a próxima
  // mutação bem-sucedida. recalculateSaleTotals mantém a MESMA regra como
  // rede de segurança (ex.: corrida entre duas edições concorrentes).
  if (guard.sale.loyalty_discount_amount > 0) {
    const projectedSubtotal = round2(
      guard.sale.subtotal - Number(item.total_amount) + totalAmount
    );
    if (projectedSubtotal < guard.sale.loyalty_discount_amount - ROUNDING_TOLERANCE) {
      return { error: LOYALTY_DISCOUNT_EXCEEDS_SUBTOTAL_ERROR };
    }
  }

  const { error } = await supabase
    .from("sale_items")
    .update({
      quantity: parsed.data.quantity,
      discount_amount: parsed.data.discountAmount,
      subtotal: grossSubtotal,
      total_amount: totalAmount,
    })
    .eq("id", itemId)
    .eq("sale_id", saleId);

  if (error) {
    return { error: "Não foi possível atualizar o item. Tente novamente." };
  }

  const recalculated = await recalculateSaleTotals(supabase, saleId, current.company.id);
  if (!recalculated.ok) {
    return { error: recalculated.error };
  }

  const user = await getCurrentUser();
  await writeAuditLog(supabase, {
    companyId: current.company.id,
    actorUserId: user?.id ?? null,
    entityType: "sale",
    entityId: saleId,
    action: AUDIT_ACTIONS.SALE_UPDATED,
    metadata: { itemUpdated: itemId },
  });

  revalidatePath(`/app/vendas/${saleId}`);
  return { success: "Item atualizado." };
}

/**
 * Resultado de removeSaleItemAction — desde a Etapa 1D.6A a action deixou
 * de ser fire-and-forget (Promise<void>): remover um item pode ser
 * legitimamente rejeitado (desconto de fidelidade maior que o novo
 * subtotal) e isso precisa chegar até o usuário, nunca falhar em silêncio.
 */
export type RemoveSaleItemResult = { ok: true } | { ok: false; error: string };

/**
 * Remove um item de uma venda em rascunho. A RLS só permite este DELETE
 * quando a venda-pai está em `draft` (ver migration 008) — a checagem
 * de status aqui é defesa em profundidade, a garantia real é do banco.
 */
export async function removeSaleItemAction(
  saleId: string,
  itemId: string
): Promise<RemoveSaleItemResult> {
  const current = await getCurrentCompany();
  if (!current) {
    return { ok: false, error: "Nenhuma empresa encontrada para o usuário atual." };
  }

  const supabase = createClient();
  const guard = await getDraftSaleOrError(supabase, current.company.id, saleId);
  if ("error" in guard) {
    revalidatePath(`/app/vendas/${saleId}`);
    return { ok: false, error: guard.error };
  }

  // Checagem antecipada (antes de excluir): remover o item primeiro e só
  // depois rejeitar no recalculateSaleTotals apagaria o item sem
  // possibilidade de desfazer o DELETE — pior que rejeitar a alteração de
  // quantidade (updateSaleItemAction), onde a linha do item ainda existe.
  // recalculateSaleTotals mantém a mesma regra como rede de segurança.
  if (guard.sale.loyalty_discount_amount > 0) {
    const { data: item } = await supabase
      .from("sale_items")
      .select("total_amount")
      .eq("id", itemId)
      .eq("sale_id", saleId)
      .maybeSingle();
    if (item) {
      const projectedSubtotal = round2(guard.sale.subtotal - Number(item.total_amount));
      if (projectedSubtotal < guard.sale.loyalty_discount_amount - ROUNDING_TOLERANCE) {
        return { ok: false, error: LOYALTY_DISCOUNT_EXCEEDS_SUBTOTAL_ERROR };
      }
    }
  }

  const { error: deleteError } = await supabase
    .from("sale_items")
    .delete()
    .eq("id", itemId)
    .eq("sale_id", saleId)
    .eq("company_id", current.company.id);

  if (deleteError) {
    console.error("[removeSaleItemAction] falha ao remover item", { saleId, itemId, deleteError });
    revalidatePath(`/app/vendas/${saleId}`);
    return { ok: false, error: "Não foi possível remover o item. Tente novamente." };
  }

  const recalculated = await recalculateSaleTotals(supabase, saleId, current.company.id);
  if (!recalculated.ok) {
    // O item já foi excluído (delete já comitado) — mesma limitação
    // pré-existente de add/updateSaleItemAction (a escrita do item e o
    // recálculo dos totais não são uma única transação). A checagem
    // antecipada acima cobre o caso normal; isto só é alcançado numa
    // corrida real entre duas requisições concorrentes.
    console.error("[removeSaleItemAction] falha ao recalcular totais", { saleId, itemId });
    revalidatePath(`/app/vendas/${saleId}`);
    return { ok: false, error: recalculated.error };
  }

  const user = await getCurrentUser();
  await writeAuditLog(supabase, {
    companyId: current.company.id,
    actorUserId: user?.id ?? null,
    entityType: "sale",
    entityId: saleId,
    action: AUDIT_ACTIONS.SALE_UPDATED,
    metadata: { itemRemoved: itemId },
  });

  revalidatePath(`/app/vendas/${saleId}`);
  return { ok: true };
}

/** Registra um pagamento para a venda. Não permite pagamento em venda cancelada. */
export async function addSalePaymentAction(
  saleId: string,
  _prevState: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const parsed = addSalePaymentSchema.safeParse({
    method: formData.get("method"),
    amount: formData.get("amount"),
    notes: formData.get("notes"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const current = await getCurrentCompany();
  if (!current) {
    return { error: "Nenhuma empresa encontrada para o usuário atual." };
  }

  const supabase = createClient();
  const { data: sale } = await supabase
    .from("sales")
    .select("id, status, total_amount")
    .eq("id", saleId)
    .eq("company_id", current.company.id)
    .maybeSingle();

  if (!sale) {
    return { error: "Venda não encontrada." };
  }
  if (sale.status === "cancelled") {
    return { error: "Não é possível registrar pagamento em uma venda cancelada." };
  }

  // Saldo restante = total da venda - soma dos pagamentos já 'paid'.
  // Lido de novo (nunca aceito do frontend) logo antes do insert, para
  // reduzir a janela de corrida, e reconferido depois do insert (abaixo)
  // para os casos em que duas requisições passam por esta checagem ao
  // mesmo tempo.
  const remaining = await getSaleRemainingBalance(supabase, saleId, Number(sale.total_amount));
  if (remaining === null) {
    return { error: "Não foi possível verificar o saldo da venda. Tente novamente." };
  }
  if (parsed.data.amount > remaining + ROUNDING_TOLERANCE) {
    return {
      error: `O valor do pagamento (${formatBRL(parsed.data.amount)}) excede o saldo restante da venda (${formatBRL(remaining)}).`,
    };
  }

  const { data: inserted, error: insertError } = await supabase
    .from("sale_payments")
    .insert({
      company_id: current.company.id,
      sale_id: saleId,
      method: parsed.data.method,
      amount: parsed.data.amount,
      status: "paid",
      paid_at: new Date().toISOString(),
      notes: parsed.data.notes,
    })
    .select("id")
    .single();

  if (insertError || !inserted) {
    return { error: "Não foi possível registrar o pagamento. Tente novamente." };
  }

  // Reconfere depois do insert: se outra requisição concorrente também
  // passou pela checagem acima antes de qualquer uma das duas ter
  // inserido, a soma dos pagamentos 'paid' agora pode ultrapassar o
  // total da venda. Desempate determinístico por ordem de inserção
  // (created_at, id): mantém os pagamentos que couberem no saldo nessa
  // ordem e desfaz (delete) este pagamento se ele for o que estourou o
  // limite — nunca deixa o total pago passar do total da venda.
  const survived = await confirmPaymentWithinBalance(
    supabase,
    saleId,
    inserted.id,
    Number(sale.total_amount)
  );

  if (!survived) {
    await supabase.from("sale_payments").delete().eq("id", inserted.id);
    return {
      error:
        "Outro pagamento foi registrado ao mesmo tempo e o saldo da venda já foi atingido. Atualize a página e tente novamente.",
    };
  }

  const user = await getCurrentUser();
  await writeAuditLog(supabase, {
    companyId: current.company.id,
    actorUserId: user?.id ?? null,
    entityType: "sale",
    entityId: saleId,
    action: AUDIT_ACTIONS.SALE_PAYMENT_ADDED,
    metadata: { method: parsed.data.method, amount: parsed.data.amount },
  });

  revalidatePath(`/app/vendas/${saleId}`);
  return { success: "Pagamento registrado." };
}

/**
 * Conclui a venda chamando a função transacional complete_sale no
 * banco — toda validação de estoque, recálculo de totais e baixa
 * atômica de estoque acontece lá, nunca aqui. A mensagem de erro do
 * Postgres já é escrita para o usuário final (ver migration 008).
 */
export async function completeSaleAction(
  saleId: string,
  _prevState: ActionResult,
  _formData: FormData
): Promise<ActionResult> {
  const current = await getCurrentCompany();
  if (!current) {
    return { error: "Nenhuma empresa encontrada para o usuário atual." };
  }

  const supabase = createClient();
  const { error } = await supabase.rpc("complete_sale", { p_sale_id: saleId });

  if (error) {
    return {
      error:
        error.message ||
        "Não foi possível concluir a venda. Verifique os itens e tente novamente.",
    };
  }

  revalidatePath("/app");
  revalidatePath("/app/vendas");
  revalidatePath(`/app/vendas/${saleId}`);
  return { success: "Venda concluída com sucesso." };
}

/**
 * Cancela a venda chamando a função transacional cancel_sale no banco —
 * validação de permissão (owner/admin sempre; employee só a própria) e
 * restauração de estoque acontecem lá.
 */
export async function cancelSaleAction(
  saleId: string,
  _prevState: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const parsed = cancelSaleSchema.safeParse({ reason: formData.get("reason") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Informe o motivo do cancelamento." };
  }

  const current = await getCurrentCompany();
  if (!current) {
    return { error: "Nenhuma empresa encontrada para o usuário atual." };
  }

  const supabase = createClient();
  const { error } = await supabase.rpc("cancel_sale", {
    p_sale_id: saleId,
    p_reason: parsed.data.reason,
  });

  if (error) {
    return { error: error.message || "Não foi possível cancelar a venda." };
  }

  revalidatePath("/app");
  revalidatePath("/app/vendas");
  revalidatePath(`/app/vendas/${saleId}`);
  return { success: "Venda cancelada. O estoque foi restaurado quando aplicável." };
}
