"use server";

import { revalidatePath } from "next/cache";
import { createSessionClient } from "@/lib/supabase/server";
import { getCurrentCompany } from "@/lib/companies/queries";
import type { ActionResult } from "@/lib/auth/actions";
import { isMoneyTooLarge, MONEY_TOO_LARGE_MESSAGE, parseMoneyInput } from "@/lib/parse-money";
import { readText, tooLongMessage } from "@/lib/text-input";
import type { CashMovementDirection } from "@/types/cash-register";
import type { SalePaymentMethod } from "@/types/sale";

const SALE_PAYMENT_METHODS: readonly SalePaymentMethod[] = ["cash", "pix", "debit", "credit", "other"];

/**
 * Toda a autorização real (owner/admin) e toda a regra de negócio (caixa
 * único aberto por empresa, saldo não-negativo, etc.) vivem dentro das
 * RPCs (supabase/migrations/021_cash_register_foundation.sql) — nunca
 * aceitam company_id/cash_register_id do cliente quando conseguem
 * resolver isso sozinhas a partir de current_profile_user_id(). Estas Server Actions só
 * validam formato de formulário e traduzem o erro do Postgres (que já
 * vem em português, lançado pela própria RPC) para o usuário.
 *
 * getCurrentCompany() é chamado antes de cada RPC só para dar um erro
 * amigável mais cedo ("nenhuma empresa encontrada") sem gastar uma
 * chamada de rede — a RPC resolve a empresa de novo, de forma
 * independente, e é ela quem de fato garante a autorização.
 */

function parsePositiveAmount(value: FormDataEntryValue | null): number | null {
  const parsed = typeof value === "string" ? parseMoneyInput(value) : null;
  return parsed !== null && parsed > 0 ? parsed : null;
}

function parseNonNegativeAmount(value: FormDataEntryValue | null): number | null {
  return typeof value === "string" ? parseMoneyInput(value) : null;
}

function parsePaymentMethod(value: FormDataEntryValue | null): SalePaymentMethod | null {
  if (typeof value !== "string") return null;
  return (SALE_PAYMENT_METHODS as string[]).includes(value) ? (value as SalePaymentMethod) : null;
}

/** Abre um novo caixa para a empresa do usuário atual. Só owner/admin (reforçado na RPC). */
export async function openCashRegisterAction(
  _prevState: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  if (isMoneyTooLarge(String(formData.get("openingBalance") ?? ""))) return { error: MONEY_TOO_LARGE_MESSAGE };
  const openingBalance = parseNonNegativeAmount(formData.get("openingBalance"));
  if (openingBalance === null) {
    return { error: "Informe um saldo inicial válido (maior ou igual a zero)." };
  }

  const notesField = readText(formData, "notes", 500);
  if (notesField.tooLong) return { error: tooLongMessage("Observação", 500) };
  const notes = notesField.value !== "" ? notesField.value : null;

  const current = await getCurrentCompany();
  if (!current) {
    return { error: "Nenhuma empresa encontrada para o usuário atual." };
  }

  const supabase = await createSessionClient();
  const { error } = await supabase.rpc("open_cash_register", {
    p_opening_balance: openingBalance,
    // O gerador de tipos do Supabase não expressa nullability de
    // argumentos de função com DEFAULT NULL — a RPC aceita NULL de
    // verdade, o `?? undefined` só contorna essa limitação de tipagem.
    p_notes: notes ?? undefined,
  });

  if (error) {
    return { error: error.message || "Não foi possível abrir o caixa. Tente novamente." };
  }

  revalidatePath("/app/caixa");
  return { success: "Caixa aberto." };
}

/** Fecha um caixa aberto. Só owner/admin (reforçado na RPC). */
export async function closeCashRegisterAction(
  cashRegisterId: string,
  _prevState: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  if (isMoneyTooLarge(String(formData.get("informedCashBalance") ?? ""))) return { error: MONEY_TOO_LARGE_MESSAGE };
  const informedCashBalance = parseNonNegativeAmount(formData.get("informedCashBalance"));
  if (informedCashBalance === null) {
    return { error: "Informe o saldo em espécie conferido (maior ou igual a zero)." };
  }

  const notesField = readText(formData, "notes", 500);
  if (notesField.tooLong) return { error: tooLongMessage("Observação", 500) };
  const notes = notesField.value !== "" ? notesField.value : null;

  const current = await getCurrentCompany();
  if (!current) {
    return { error: "Nenhuma empresa encontrada para o usuário atual." };
  }

  const supabase = await createSessionClient();
  const { error } = await supabase.rpc("close_cash_register", {
    p_cash_register_id: cashRegisterId,
    p_informed_cash_balance: informedCashBalance,
    p_notes: notes ?? undefined,
  });

  if (error) {
    return { error: error.message || "Não foi possível fechar o caixa. Tente novamente." };
  }

  revalidatePath("/app/caixa");
  return { success: "Caixa fechado." };
}

/** Lançamento manual de entrada/saída (sangria, suprimento, despesa avulsa). Só owner/admin, só com caixa aberto (reforçado na RPC). */
export async function createCashMovementAction(
  _prevState: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const directionRaw = formData.get("direction");
  const direction: CashMovementDirection | null =
    directionRaw === "in" || directionRaw === "out" ? directionRaw : null;
  if (!direction) {
    return { error: "Selecione entrada ou saída." };
  }

  if (isMoneyTooLarge(String(formData.get("amount") ?? ""))) return { error: MONEY_TOO_LARGE_MESSAGE };
  const amount = parsePositiveAmount(formData.get("amount"));
  if (amount === null) {
    return { error: "Informe um valor maior que zero." };
  }

  const method = parsePaymentMethod(formData.get("method"));
  if (!method) {
    return { error: "Selecione uma forma de pagamento válida." };
  }

  const descriptionField = readText(formData, "description", 200);
  const description = descriptionField.value;
  if (description.length === 0) {
    return { error: "Informe uma descrição para a movimentação." };
  }
  if (descriptionField.tooLong) return { error: tooLongMessage("Descrição", 200) };

  const current = await getCurrentCompany();
  if (!current) {
    return { error: "Nenhuma empresa encontrada para o usuário atual." };
  }

  const supabase = await createSessionClient();
  const { error } = await supabase.rpc("create_cash_movement", {
    p_direction: direction,
    p_amount: amount,
    p_method: method,
    p_description: description,
  });

  if (error) {
    return { error: error.message || "Não foi possível registrar a movimentação. Tente novamente." };
  }

  revalidatePath("/app/caixa");
  return { success: "Movimentação registrada." };
}
