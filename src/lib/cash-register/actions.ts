"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentCompany } from "@/lib/companies/queries";
import type { ActionResult } from "@/lib/auth/actions";
import type { CashMovementDirection } from "@/types/cash-register";
import type { SalePaymentMethod } from "@/types/sale";

const SALE_PAYMENT_METHODS: readonly SalePaymentMethod[] = ["cash", "pix", "debit", "credit", "other"];

/**
 * Toda a autorização real (owner/admin) e toda a regra de negócio (caixa
 * único aberto por empresa, saldo não-negativo, etc.) vivem dentro das
 * RPCs (supabase/migrations/021_cash_register_foundation.sql) — nunca
 * aceitam company_id/cash_register_id do cliente quando conseguem
 * resolver isso sozinhas a partir de auth.uid(). Estas Server Actions só
 * validam formato de formulário e traduzem o erro do Postgres (que já
 * vem em português, lançado pela própria RPC) para o usuário.
 *
 * getCurrentCompany() é chamado antes de cada RPC só para dar um erro
 * amigável mais cedo ("nenhuma empresa encontrada") sem gastar uma
 * chamada de rede — a RPC resolve a empresa de novo, de forma
 * independente, e é ela quem de fato garante a autorização.
 */

function parsePositiveAmount(value: FormDataEntryValue | null): number | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const parsed = Number(value.replace(",", "."));
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

function parseNonNegativeAmount(value: FormDataEntryValue | null): number | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const parsed = Number(value.replace(",", "."));
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
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
  const openingBalance = parseNonNegativeAmount(formData.get("openingBalance"));
  if (openingBalance === null) {
    return { error: "Informe um saldo inicial válido (maior ou igual a zero)." };
  }

  const notesRaw = formData.get("notes");
  const notes = typeof notesRaw === "string" && notesRaw.trim() !== "" ? notesRaw.trim() : null;

  const current = await getCurrentCompany();
  if (!current) {
    return { error: "Nenhuma empresa encontrada para o usuário atual." };
  }

  const supabase = createClient();
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
  const informedCashBalance = parseNonNegativeAmount(formData.get("informedCashBalance"));
  if (informedCashBalance === null) {
    return { error: "Informe o saldo em espécie conferido (maior ou igual a zero)." };
  }

  const notesRaw = formData.get("notes");
  const notes = typeof notesRaw === "string" && notesRaw.trim() !== "" ? notesRaw.trim() : null;

  const current = await getCurrentCompany();
  if (!current) {
    return { error: "Nenhuma empresa encontrada para o usuário atual." };
  }

  const supabase = createClient();
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

  const amount = parsePositiveAmount(formData.get("amount"));
  if (amount === null) {
    return { error: "Informe um valor maior que zero." };
  }

  const method = parsePaymentMethod(formData.get("method"));
  if (!method) {
    return { error: "Selecione uma forma de pagamento válida." };
  }

  const descriptionRaw = formData.get("description");
  const description = typeof descriptionRaw === "string" ? descriptionRaw.trim() : "";
  if (description.length === 0) {
    return { error: "Informe uma descrição para a movimentação." };
  }

  const current = await getCurrentCompany();
  if (!current) {
    return { error: "Nenhuma empresa encontrada para o usuário atual." };
  }

  const supabase = createClient();
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
