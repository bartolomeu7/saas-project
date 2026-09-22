"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentCompany } from "@/lib/companies/queries";
import { getCurrentUser } from "@/lib/auth/session";
import { writeAuditLog } from "@/lib/audit/log";
import type { ActionResult } from "@/lib/auth/actions";
import type { Json } from "@/types/supabase";

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

  if (!supplierId) return { error: "Selecione um fornecedor." };
  if (!items) return { error: "Adicione pelo menos um produto ao pedido." };

  const current = await getCurrentCompany();
  if (!current) return { error: "Nenhuma empresa encontrada." };

  const supabase = createClient();
  const { data, error } = await supabase.rpc("create_purchase_order", {
    p_supplier_id: supplierId,
    p_items: items,
    p_expected_at: parseDateValue(formData.get("expectedAt")) ?? undefined,
    p_due_date: String(formData.get("dueDate") ?? "").trim() || undefined,
    p_notes: String(formData.get("notes") ?? "").trim() || undefined,
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

  const current = await getCurrentCompany();
  if (!current) return { error: "Nenhuma empresa encontrada." };

  const supabase = createClient();
  const { error } = await supabase.rpc("receive_purchase_order", {
    p_purchase_order_id: purchaseOrderId,
    p_items: items,
    p_notes: String(formData.get("notes") ?? "").trim() || undefined,
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
): Promise<void> {
  const current = await getCurrentCompany();
  if (!current) return;

  const supabase = createClient();
  const { error } = await supabase.rpc("cancel_purchase_order", {
    p_purchase_order_id: purchaseOrderId,
    p_reason: String(formData.get("reason") ?? "").trim() || undefined,
  });

  if (error) throw new Error(error.message);

  revalidatePath("/app/compras");
  revalidatePath("/app/compras/" + purchaseOrderId);
  redirect("/app/compras/" + purchaseOrderId);
}

export async function cancelPurchaseReceiptAction(
  purchaseReceiptId: string,
  purchaseOrderId: string,
  formData: FormData
): Promise<void> {
  const current = await getCurrentCompany();
  if (!current) return;

  const supabase = createClient();
  const { error } = await supabase.rpc("cancel_purchase_receipt", {
    p_purchase_receipt_id: purchaseReceiptId,
    p_reason: String(formData.get("reason") ?? "").trim() || undefined,
  });

  if (error) throw new Error(error.message);

  revalidatePath("/app");
  revalidatePath("/app/compras");
  revalidatePath("/app/compras/" + purchaseOrderId);
  revalidatePath("/app/estoque");
  revalidatePath("/app/produtos");
  redirect("/app/compras/" + purchaseOrderId);
}