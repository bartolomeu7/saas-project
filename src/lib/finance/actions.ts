"use server";

import { revalidatePath } from "next/cache";
import { createSessionClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/auth/actions";
import { getCurrentCompany } from "@/lib/companies/queries";
import { todayDateSaoPaulo } from "@/lib/timezone";
import { FRACTION_OF_CENT_MESSAGE, hasFractionOfCent, isMoneyTooLarge, MONEY_TOO_LARGE_MESSAGE, parseMoneyInput } from "@/lib/parse-money";
import { cleanText, collapseSpaces } from "@/lib/validations/common";
import { nameInUse } from "@/lib/validations/name-in-use";
import { tooLongMessage } from "@/lib/text-input";
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

/** Texto do formulário sem caracteres de controle/direção invisível e sem espaços nas pontas. */
function textValue(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? cleanText(value).trim() : "";
}

const MAX_DESCRIPTION = 200;
const MAX_NOTES = 1000;
const MAX_NAME = 120;

/** Datas fora desta faixa quase sempre são erro de digitação (ano 0202, 2062...). */
function dateOutOfRange(isoDate: string): boolean {
  const year = Number(isoDate.slice(0, 4));
  const current = new Date().getFullYear();
  return !Number.isFinite(year) || year < current - 10 || year > current + 5;
}

/** Aceita "1234,56", "1.234,56" e "1234.56" (parseMoneyInput); só valores maiores que zero. */
function parseAmount(value: FormDataEntryValue | null): number | null {
  const amount = parseMoneyInput(textValue(value));
  return amount !== null && amount > 0 ? amount : null;
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
  const occurredOn = textValue(formData.get("occurredOn")) || todayDateSaoPaulo();
  const method = paymentMethod(formData.get("method"));
  const categoryId = textValue(formData.get("categoryId")) || undefined;
  const costCenterId = textValue(formData.get("costCenterId")) || undefined;
  const notes = textValue(formData.get("notes")) || undefined;

  if (direction !== "income" && direction !== "expense") {
    return { error: "Selecione receita ou despesa." };
  }
  if (!description) return { error: "Informe uma descrição." };
  if (description.length > MAX_DESCRIPTION) return { error: tooLongMessage("Descrição", MAX_DESCRIPTION) };
  if (notes && notes.length > MAX_NOTES) return { error: tooLongMessage("Observação", MAX_NOTES) };
  if (isMoneyTooLarge(textValue(formData.get("amount")))) return { error: MONEY_TOO_LARGE_MESSAGE };
  if (hasFractionOfCent(textValue(formData.get("amount")))) return { error: FRACTION_OF_CENT_MESSAGE };
  if (dateOutOfRange(occurredOn)) return { error: "Data fora do período permitido (de 10 anos atrás a 5 anos à frente)." };
  if (amount === null) return { error: "Informe um valor maior que zero." };
  if (!method) return { error: "Selecione a forma de pagamento." };

  const current = await getCurrentCompany();
  if (!current) return { error: "Nenhuma empresa encontrada." };

  const supabase = await createSessionClient();
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
  const paymentDate = textValue(formData.get("paymentDate")) || todayDateSaoPaulo();
  const notes = textValue(formData.get("notes")) || undefined;

  if (!payableId) return { error: "Conta a pagar inválida." };
  if (isMoneyTooLarge(textValue(formData.get("amount")))) return { error: MONEY_TOO_LARGE_MESSAGE };
  if (hasFractionOfCent(textValue(formData.get("amount")))) return { error: FRACTION_OF_CENT_MESSAGE };
  if (notes && notes.length > MAX_NOTES) return { error: tooLongMessage("Observação", MAX_NOTES) };
  if (dateOutOfRange(paymentDate)) return { error: "Data fora do período permitido." };
  if (amount === null) return { error: "Informe o valor do pagamento." };
  if (!method) return { error: "Selecione a forma de pagamento." };

  const current = await getCurrentCompany();
  if (!current) return { error: "Nenhuma empresa encontrada." };

  const supabase = await createSessionClient();
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
  if (isMoneyTooLarge(textValue(formData.get("amount")))) return { error: MONEY_TOO_LARGE_MESSAGE };
  if (amount === null) return { error: "Informe o valor recebido." };
  if (!method) return { error: "Selecione a forma de recebimento." };

  const current = await getCurrentCompany();
  if (!current) return { error: "Nenhuma empresa encontrada." };

  const supabase = await createSessionClient();
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
  const name = collapseSpaces(textValue(formData.get("name")));
  const kind = categoryKind(formData.get("kind"));
  if (!name) return { error: "Informe o nome da categoria." };
  if (name.length > MAX_NAME) return { error: tooLongMessage("Nome", MAX_NAME) };
  if (!/\p{L}/u.test(name)) return { error: "O nome da categoria precisa ter letras." };
  if (!kind) return { error: "Selecione o tipo da categoria." };

  const current = await getCurrentCompany();
  if (!current) return { error: "Nenhuma empresa encontrada." };

  const supabase = await createSessionClient();
  // antes: a tabela só impedia repetição EXATA e o banco ignorava o pedido em silêncio ("Categoria salva" sem salvar nada)
  if (await nameInUse(supabase, "financial_categories", current.company.id, name, undefined, { kind })) {
    return { error: `Já existe uma categoria de ${kind === "income" ? "receita" : "despesa"} com esse nome.` };
  }
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
  const name = collapseSpaces(textValue(formData.get("name")));
  if (!name) return { error: "Informe o nome do centro de custo." };
  if (name.length > MAX_NAME) return { error: tooLongMessage("Nome", MAX_NAME) };
  if (!/\p{L}/u.test(name)) return { error: "O nome do centro de custo precisa ter letras." };

  const current = await getCurrentCompany();
  if (!current) return { error: "Nenhuma empresa encontrada." };

  const supabase = await createSessionClient();
  if (await nameInUse(supabase, "cost_centers", current.company.id, name)) {
    return { error: "Já existe um centro de custo com esse nome." };
  }
  const { error } = await supabase.rpc("create_cost_center", { p_name: name });

  if (error) return { error: error.message || "Não foi possível salvar o centro de custo." };

  revalidatePath("/app/financeiro");
  return { success: "Centro de custo salvo." };
}


/** Estorna um lançamento manual (receita/despesa avulsa). O banco confere papel, origem e, se for dinheiro, o caixa aberto. */
export async function cancelFinancialEntryAction(entryId: string): Promise<{ error?: string } | void> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(entryId)) return { error: "Lançamento inválido." };
  const current = await getCurrentCompany();
  if (!current) return { error: "Nenhuma empresa encontrada." };

  const supabase = await createSessionClient();
  // a função é nova e ainda não consta nos tipos gerados do banco
  const { error } = await (supabase as any).rpc("cancel_manual_financial_entry", { p_entry_id: entryId, p_reason: "Estorno pelo Financeiro" });
  if (error) return { error: error.message || "Não foi possível estornar o lançamento." };

  revalidatePath("/app/financeiro");
  revalidatePath("/app/caixa");
  revalidatePath("/app/relatorios");
  revalidatePath("/app");
}
