"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createSessionClient } from "@/lib/supabase/server";
import { getCurrentCompany } from "@/lib/companies/queries";
import { getCurrentUser } from "@/lib/auth/session";
import { writeAuditLog } from "@/lib/audit/log";
import type { ActionResult } from "@/lib/auth/actions";
import type { Json } from "@/types/supabase";
import { cleanText, MAX_MONEY, MAX_QUANTITY } from "@/lib/validations/common";
import { purchaseDatesError } from "@/lib/validations/purchase-dates";
import { checkOrderItems } from "@/lib/validations/purchase-items";

const MAX_NOTES = 2000;

/** Texto de formulário sem caracteres de controle/direção invisível e sem espaços nas pontas. */
function cleanField(value: FormDataEntryValue | null): string {
  return cleanText(String(value ?? "")).trim();
}

/**
 * Confere os limites do banco (quantidade numeric(12,3), custo e total da linha numeric(12,2)) antes de chamar a RPC:
 * sem isso o usuário recebia "numeric field overflow". Devolve a mensagem de erro, ou null se estiver tudo certo.
 */
function itemLimitsError(items: Json): string | null {
  if (!Array.isArray(items)) return null;
  for (const raw of items) {
    const item = raw as { quantity?: unknown; unit_cost?: unknown; received_quantity?: unknown };
    const quantity = Number(item.quantity ?? item.received_quantity ?? 0);
    const unitCost = Number(item.unit_cost ?? 0);
    if (Number.isFinite(quantity) && quantity > MAX_QUANTITY) return "Quantidade muito alta em um dos itens.";
    if (Number.isFinite(unitCost) && unitCost > MAX_MONEY) return "Custo unitário muito alto em um dos itens.";
    if (Number.isFinite(quantity) && Number.isFinite(unitCost) && quantity * unitCost > MAX_MONEY) {
      return "O total de um dos itens passa do limite permitido (R$ 999.999.999,99).";
    }
  }
  return null;
}

function parseDateValue(value: FormDataEntryValue | null): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const parsed = new Date(raw + "T12:00:00");
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function parseItems(raw: FormDataEntryValue | null): Json | null {
  try {
    const parsed = JSON.parse(String(raw ?? ""));
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    return parsed as Json;
  } catch {
    return null;
  }
}

export async function createPurchaseOrderAction(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const supplierId = String(formData.get("supplierId") ?? "").trim();
  const items = parseItems(formData.get("items"));
  const notes = cleanField(formData.get("notes"));

  if (!supplierId) return { error: "Selecione um fornecedor." };
  if (!items) return { error: "Adicione pelo menos um produto ao pedido." };
  const limitsError = itemLimitsError(items);
  if (limitsError) return { error: limitsError };
  const checked = checkOrderItems(items);
  if ("error" in checked) return checked;
  if (notes.length > MAX_NOTES) return { error: `Observações: máximo de ${MAX_NOTES} caracteres.` };
  const datesProblem = purchaseDatesError(String(formData.get("expectedAt") ?? ""), String(formData.get("dueDate") ?? ""), new Date().getFullYear());
  if (datesProblem) return { error: datesProblem };

  const current = await getCurrentCompany();
  if (!current) return { error: "Nenhuma empresa encontrada." };

  const supabase = await createSessionClient();
  const { data, error } = await supabase.rpc("create_purchase_order", {
    p_supplier_id: supplierId,
    p_items: checked.items,
    p_expected_at: parseDateValue(formData.get("expectedAt")) ?? undefined,
    p_due_date: String(formData.get("dueDate") ?? "").trim() || undefined,
    p_notes: notes || undefined,
  });

  if (error || !data) {
    return {
      error:
        error?.message ??
        "Não foi possível criar o pedido de compra. Tente novamente.",
    };
  }

  const user = await getCurrentUser();
  await writeAuditLog(supabase, {
    companyId: current.company.id,
    actorUserId: user?.id ?? null,
    entityType: "purchase_order",
    entityId: data.id,
    action: "purchase_order.created",
    metadata: { totalAmount: data.total_amount },
  });

  revalidatePath("/app");
  revalidatePath("/app/compras");
  revalidatePath("/app/estoque");
  redirect("/app/compras/" + data.id);
}

export async function receivePurchaseOrderAction(
  purchaseOrderId: string,
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const items = parseItems(formData.get("items"));
  if (!items) return { error: "Informe pelo menos um item recebido." };
  const limitsError = itemLimitsError(items);
  if (limitsError) return { error: limitsError };
  const receiptNotes = cleanField(formData.get("notes"));
  if (receiptNotes.length > MAX_NOTES) return { error: `Observações: máximo de ${MAX_NOTES} caracteres.` };

  const current = await getCurrentCompany();
  if (!current) return { error: "Nenhuma empresa encontrada." };

  const supabase = await createSessionClient();
  const { error } = await supabase.rpc("receive_purchase_order", {
    p_purchase_order_id: purchaseOrderId,
    p_items: items,
    p_notes: receiptNotes || undefined,
  });

  if (error) {
    return {
      error:
        error.message ??
        "Não foi possível registrar o recebimento. Tente novamente.",
    };
  }

  revalidatePath("/app");
  revalidatePath("/app/compras");
  revalidatePath("/app/compras/" + purchaseOrderId);
  revalidatePath("/app/estoque");
  revalidatePath("/app/produtos");
  redirect("/app/compras/" + purchaseOrderId);
}

export async function cancelPurchaseOrderAction(
  purchaseOrderId: string,
  formData: FormData
): Promise<{ error?: string } | void> {
  const current = await getCurrentCompany();
  if (!current) return { error: "Nenhuma empresa encontrada." };

  const supabase = await createSessionClient();
  const { error } = await supabase.rpc("cancel_purchase_order", {
    p_purchase_order_id: purchaseOrderId,
    p_reason: String(formData.get("reason") ?? "").trim() || undefined,
  });

  if (error) return { error: error.message || "Não foi possível cancelar o pedido." };

  revalidatePath("/app/compras");
  revalidatePath("/app/compras/" + purchaseOrderId);
  redirect("/app/compras/" + purchaseOrderId);
}

export async function cancelPurchaseReceiptAction(
  purchaseReceiptId: string,
  purchaseOrderId: string,
  formData: FormData
): Promise<{ error?: string } | void> {
  const current = await getCurrentCompany();
  if (!current) return { error: "Nenhuma empresa encontrada." };

  const supabase = await createSessionClient();
  const { error } = await supabase.rpc("cancel_purchase_receipt", {
    p_purchase_receipt_id: purchaseReceiptId,
    p_reason: String(formData.get("reason") ?? "").trim() || undefined,
  });

  if (error) return { error: error.message || "Não foi possível estornar o recebimento." };

  revalidatePath("/app");
  revalidatePath("/app/compras");
  revalidatePath("/app/compras/" + purchaseOrderId);
  revalidatePath("/app/estoque");
  revalidatePath("/app/produtos");
  redirect("/app/compras/" + purchaseOrderId);
}