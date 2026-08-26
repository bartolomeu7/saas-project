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

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Recalcula subtotal/custo/total/margem de uma venda a partir dos itens
 * reais no banco — nunca a partir de um valor vindo do frontend. Único
 * caminho de escrita para esses campos agregados enquanto a venda é
 * rascunho (chamado depois de toda mutação de item ou de desconto).
 *
 * Se o desconto atual da venda ficar maior que o novo subtotal (ex:
 * usuário removeu um item depois de já ter aplicado um desconto maior),
 * o desconto é reduzido automaticamente para não violar a constraint
 * `discount_amount <= subtotal` do banco.
 */
async function recalculateSaleTotals(
  supabase: SupabaseClient<Database>,
  saleId: string,
  companyId: string
): Promise<void> {
  const { data: items } = await supabase
    .from("sale_items")
    .select("total_amount, quantity, unit_cost")
    .eq("sale_id", saleId);

  const rows = items ?? [];
  const subtotal = round2(rows.reduce((sum, row) => sum + Number(row.total_amount), 0));
  const totalCost = round2(
    rows.reduce((sum, row) => sum + Number(row.quantity) * Number(row.unit_cost), 0)
  );

  const { data: sale } = await supabase
    .from("sales")
    .select("discount_amount")
    .eq("id", saleId)
    .single();

  const discountAmount = Math.min(Number(sale?.discount_amount ?? 0), subtotal);
  const totalAmount = round2(subtotal - discountAmount);
  const estimatedMargin = round2(totalAmount - totalCost);

  await supabase
    .from("sales")
    .update({
      subtotal,
      discount_amount: discountAmount,
      total_amount: totalAmount,
      total_cost: totalCost,
      estimated_margin: estimatedMargin,
    })
    .eq("id", saleId)
    .eq("company_id", companyId);
}

/** Garante que a venda existe, pertence à empresa e está em rascunho. */
async function getDraftSaleOrError(
  supabase: SupabaseClient<Database>,
  companyId: string,
  saleId: string
): Promise<{ error: string } | { sale: { id: string; status: string; subtotal: number } }> {
  const { data: sale } = await supabase
    .from("sales")
    .select("id, status, subtotal")
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
    if (parsed.data.discountAmount > guard.sale.subtotal) {
      return { error: "O desconto não pode ser maior que o subtotal da venda." };
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

  await recalculateSaleTotals(supabase, saleId, current.company.id);

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
    productId: formData.get("productId"),
    serviceId: formData.get("serviceId"),
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
      .select("id, name, sale_price, cost_price, status")
      .eq("id", parsed.data.productId!)
      .eq("company_id", current.company.id)
      .maybeSingle();
    if (!product || product.status !== "active") {
      return { error: "Produto não encontrado ou inativo." };
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

  await recalculateSaleTotals(supabase, saleId, current.company.id);

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
    .select("unit_price")
    .eq("id", itemId)
    .eq("sale_id", saleId)
    .maybeSingle();
  if (!item) {
    return { error: "Item não encontrado." };
  }

  const grossSubtotal = round2(parsed.data.quantity * item.unit_price);
  if (parsed.data.discountAmount > grossSubtotal) {
    return { error: "O desconto do item não pode ser maior que o subtotal do item." };
  }
  const totalAmount = round2(grossSubtotal - parsed.data.discountAmount);

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

  await recalculateSaleTotals(supabase, saleId, current.company.id);

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
 * Remove um item de uma venda em rascunho. A RLS só permite este DELETE
 * quando a venda-pai está em `draft` (ver migration 008) — a checagem
 * de status aqui é defesa em profundidade, a garantia real é do banco.
 */
export async function removeSaleItemAction(saleId: string, itemId: string): Promise<void> {
  const current = await getCurrentCompany();
  if (!current) return;

  const supabase = createClient();
  const guard = await getDraftSaleOrError(supabase, current.company.id, saleId);
  if ("error" in guard) {
    revalidatePath(`/app/vendas/${saleId}`);
    return;
  }

  await supabase
    .from("sale_items")
    .delete()
    .eq("id", itemId)
    .eq("sale_id", saleId)
    .eq("company_id", current.company.id);

  await recalculateSaleTotals(supabase, saleId, current.company.id);

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
    .select("id, status")
    .eq("id", saleId)
    .eq("company_id", current.company.id)
    .maybeSingle();

  if (!sale) {
    return { error: "Venda não encontrada." };
  }
  if (sale.status === "cancelled") {
    return { error: "Não é possível registrar pagamento em uma venda cancelada." };
  }

  const { error } = await supabase.from("sale_payments").insert({
    company_id: current.company.id,
    sale_id: saleId,
    method: parsed.data.method,
    amount: parsed.data.amount,
    status: "paid",
    paid_at: new Date().toISOString(),
    notes: parsed.data.notes,
  });

  if (error) {
    return { error: "Não foi possível registrar o pagamento. Tente novamente." };
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
