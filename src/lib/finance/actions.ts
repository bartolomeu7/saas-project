"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/auth/actions";
import { getCurrentCompany } from "@/lib/companies/queries";
import type { Database } from "@/types/supabase";

type FinancialDirection = Database["public"]["Enums"]["financial_entry_direction"];
type FinancialCategoryKind = Database["public"]["Enums"]["financial_category_kind"];
type SalePaymentMethod = Database["public"]["Enums"]["sale_payment_method"];

const PAYMENT_METHODS: readonly SalePaymentMethod[] = [
  "cash",
  "pix",
  "debit",
  "credit",
  "other",
];

const categoryKinds: readonly FinancialCategoryKind[] = ["income", "expense"];

function textValue(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value.trim() : "";
}

function parseAmount(value: FormDataEntryValue | null): number | null {
  const raw = textValue(value).replace(",", ".");
  if (!raw) return null;
  const amount = Number(raw);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

function paymentMethod(value: FormDataEntryValue | null): SalePaymentMethod | null {
  const raw = textValue(value);
  return PAYMENT_METHODS.includes(raw as SalePaymentMethod) ? (raw as SalePaymentMethod) : null;
}

function categoryKind(value: FormDataEntryValue | null): FinancialCategoryKind | null {
  const raw = textValue(value);
  return categoryKinds.includes(raw as FinancialCategoryKind)
    ? (raw as FinancialCategoryKind)
    : null;
}

export async function createFinancialEntryAction(
  _prevState: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const direction = textValue(formData.get("direction")) as FinancialDirection;
  const description = textValue(formData.get("description"));
  const amount = parseAmount(formData.get("amount"));
  const occurredOn = textValue(formData.get("occurredOn")) || new Date().toISOString().slice(0, 10);
  const method = paymentMethod(formData.get("method"));
  const categoryId = textValue(formData.get("categoryId")) || undefined;
  const costCenterId = textValue(formData.get("costCenterId")) || undefined;
  const notes = textValue(formData.get("notes")) || undefined;

  if (direction !== "income" && direction !== "expense") {
    return { error: "Selecione receita ou despesa." };
  }
  if (!description) return { error: "Informe uma descrição." };
  if (amount === null) return { error: "Informe um valor maior que zero." };
  if (!method) return { error: "Selecione a forma de pagamento." };

  const current = await getCurrentCompany();
  if (!current) return { error: "Nenhuma empresa encontrada." };

  const supabase = createClient();
  const { error } = await supabase.rpc("create_financial_entry", {
    p_direction: direction,
    p_description: description,
    p_amount: amount,
    p_occurred_on: occurredOn,
    p_method: method,
    p_category_id: categoryId,
    p_cost_center_id: costCenterId,
    p_notes: notes,
  });

  if (error) return { error: error.message || "Não foi possível registrar o lançamento." };

  revalidatePath("/app/financeiro");
  return { success: "Lançamento registrado." };
}

export async function payAccountsPayableAction(
  _prevState: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const payableId = textValue(formData.get("payableId"));
  const amount = parseAmount(formData.get("amount"));
  const method = paymentMethod(formData.get("method"));
  const paymentDate = textValue(formData.get("paymentDate")) || new Date().toISOString().slice(0, 10);
  const notes = textValue(formData.get("notes")) || undefined;

  if (!payableId) return { error: "Conta a pagar inválida." };
  if (amount === null) return { error: "Informe o valor do pagamento." };
  if (!method) return { error: "Selecione a forma de pagamento." };

  const current = await getCurrentCompany();
  if (!current) return { error: "Nenhuma empresa encontrada." };

  const supabase = createClient();
  const { error } = await supabase.rpc("pay_accounts_payable", {
    p_payable_id: payableId,
    p_amount: amount,
    p_method: method,
    p_payment_date: paymentDate,
    p_notes: notes,
  });

  if (error) return { error: error.message || "Não foi possível baixar a conta." };

  revalidatePath("/app/financeiro");
  revalidatePath("/app/caixa");
  revalidatePath("/app/compras");
  return { success: "Pagamento registrado." };
}

export async function receiveSalePaymentAction(
  _prevState: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const saleId = textValue(formData.get("saleId"));
  const amount = parseAmount(formData.get("amount"));
  const method = paymentMethod(formData.get("method"));
  const paidAtRaw = textValue(formData.get("paidAt"));

  if (!saleId) return { error: "Recebível inválido." };
  if (amount === null) return { error: "Informe o valor recebido." };
  if (!method) return { error: "Selecione a forma de recebimento." };

  const current = await getCurrentCompany();
  if (!current) return { error: "Nenhuma empresa encontrada." };

  const supabase = createClient();
  const { error } = await supabase.rpc("receive_sale_payment", {
    p_sale_id: saleId,
    p_amount: amount,
    p_method: method,
    p_paid_at: paidAtRaw ? new Date(paidAtRaw).toISOString() : undefined,
    p_notes: undefined,
  });

  if (error) return { error: error.message || "Não foi possível registrar o recebimento." };

  revalidatePath("/app/financeiro");
  revalidatePath("/app/caixa");
  revalidatePath("/app/vendas");
  return { success: "Recebimento registrado." };
}

export async function createFinancialCategoryAction(
  _prevState: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const name = textValue(formData.get("name"));
  const kind = categoryKind(formData.get("kind"));
  if (!name) return { error: "Informe o nome da categoria." };
  if (!kind) return { error: "Selecione o tipo da categoria." };

  const current = await getCurrentCompany();
  if (!current) return { error: "Nenhuma empresa encontrada." };

  const supabase = createClient();
  const { error } = await supabase.rpc("create_financial_category", {
    p_name: name,
    p_kind: kind,
  });

  if (error) return { error: error.message || "Não foi possível salvar a categoria." };

  revalidatePath("/app/financeiro");
  return { success: "Categoria salva." };
}

export async function createCostCenterAction(
  _prevState: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const name = textValue(formData.get("name"));
  if (!name) return { error: "Informe o nome do centro de custo." };

  const current = await getCurrentCompany();
  if (!current) return { error: "Nenhuma empresa encontrada." };

  const supabase = createClient();
  const { error } = await supabase.rpc("create_cost_center", { p_name: name });

  if (error) return { error: error.message || "Não foi possível salvar o centro de custo." };

  revalidatePath("/app/financeiro");
  return { success: "Centro de custo salvo." };
}

