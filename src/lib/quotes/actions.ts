"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createSessionClient } from "@/lib/supabase/server";
import { getCurrentCompany } from "@/lib/companies/queries";
import type { ActionResult } from "@/lib/auth/actions";
import { cleanText } from "@/lib/validations/common";
import { readQuoteForm } from "@/lib/quotes/form";
import { todayDateSaoPaulo } from "@/lib/timezone";

// As funções novas ainda não constam nos tipos gerados do banco: a chamada passa por um tipo mínimo.
type LooseRpc = {
  rpc(fn: string, args?: Record<string, unknown>): Promise<{ data: unknown; error: { message: string; code?: string } | null }>;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** O banco responde em português com erro "P0001" (regra de negócio): essas mensagens podem ir direto à tela; as demais, não. */
function friendly(error: { message: string; code?: string }, fallback: string): string {
  if (error.code === "P0001" && error.message) return error.message;
  console.error("[orcamento] função falhou:", error.code, error.message);
  return fallback;
}

export async function createQuoteAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const parsed = readQuoteForm(formData, todayDateSaoPaulo());
  if ("error" in parsed) return { error: parsed.error, field: parsed.field };
  const current = await getCurrentCompany();
  if (!current) return { error: "Nenhuma empresa encontrada." };

  const supabase = (await createSessionClient()) as unknown as LooseRpc;
  const { data, error } = await supabase.rpc("create_quote", parsed.args as unknown as Record<string, unknown>);
  if (error || typeof data !== "string") return { error: error ? friendly(error, "Não foi possível criar o orçamento. Tente novamente.") : "Não foi possível criar o orçamento. Tente novamente." };

  revalidatePath("/app/orcamentos");
  redirect(`/app/orcamentos/${data}`);
}

export async function updateQuoteAction(quoteId: string, _prev: ActionResult, formData: FormData): Promise<ActionResult> {
  if (!UUID.test(quoteId)) return { error: "Orçamento não encontrado." };
  const parsed = readQuoteForm(formData, todayDateSaoPaulo());
  if ("error" in parsed) return { error: parsed.error, field: parsed.field };
  const current = await getCurrentCompany();
  if (!current) return { error: "Nenhuma empresa encontrada." };

  const supabase = (await createSessionClient()) as unknown as LooseRpc;
  const { error } = await supabase.rpc("update_quote", { p_id: quoteId, ...(parsed.args as unknown as Record<string, unknown>) });
  if (error) return { error: friendly(error, "Não foi possível salvar o orçamento. Tente novamente.") };

  revalidatePath("/app/orcamentos");
  revalidatePath(`/app/orcamentos/${quoteId}`);
  redirect(`/app/orcamentos/${quoteId}`);
}

const TARGETS = ["sent", "approved", "rejected", "draft"] as const;
type Target = (typeof TARGETS)[number];

const STATUS_DONE: Record<Target, string> = {
  sent: "Orçamento marcado como enviado.",
  approved: "Orçamento aprovado.",
  rejected: "Orçamento marcado como recusado.",
  draft: "Orçamento voltou para rascunho.",
};

/** Muda a situação (enviar, aprovar, recusar, reabrir). O banco confere se a mudança é permitida e se a validade está em dia. */
export async function setQuoteStatusAction(quoteId: string, to: string, reason?: string): Promise<ActionResult> {
  if (!UUID.test(quoteId)) return { error: "Orçamento não encontrado." };
  if (!(TARGETS as readonly string[]).includes(to)) return { error: "Situação inválida." };
  const note = cleanText(reason ?? "").trim();
  if (note.length > 300) return { error: "O motivo pode ter no máximo 300 caracteres." };
  const current = await getCurrentCompany();
  if (!current) return { error: "Nenhuma empresa encontrada." };

  const supabase = (await createSessionClient()) as unknown as LooseRpc;
  const { error } = await supabase.rpc("set_quote_status", { p_id: quoteId, p_to: to, p_reason: note || null });
  if (error) return { error: friendly(error, "Não foi possível mudar a situação do orçamento. Tente novamente.") };

  revalidatePath("/app/orcamentos");
  revalidatePath(`/app/orcamentos/${quoteId}`);
  return { success: STATUS_DONE[to as Target] };
}

export async function deleteQuoteAction(quoteId: string): Promise<ActionResult> {
  if (!UUID.test(quoteId)) return { error: "Orçamento não encontrado." };
  const current = await getCurrentCompany();
  if (!current) return { error: "Nenhuma empresa encontrada." };

  const supabase = (await createSessionClient()) as unknown as LooseRpc;
  const { error } = await supabase.rpc("delete_quote", { p_id: quoteId });
  if (error) return { error: friendly(error, "Não foi possível excluir o orçamento. Tente novamente.") };

  revalidatePath("/app/orcamentos");
  redirect("/app/orcamentos");
}

export async function duplicateQuoteAction(quoteId: string): Promise<ActionResult> {
  if (!UUID.test(quoteId)) return { error: "Orçamento não encontrado." };
  const current = await getCurrentCompany();
  if (!current) return { error: "Nenhuma empresa encontrada." };

  const supabase = (await createSessionClient()) as unknown as LooseRpc;
  const { data, error } = await supabase.rpc("duplicate_quote", { p_id: quoteId });
  if (error || typeof data !== "string") return { error: error ? friendly(error, "Não foi possível duplicar o orçamento. Tente novamente.") : "Não foi possível duplicar o orçamento. Tente novamente." };

  revalidatePath("/app/orcamentos");
  redirect(`/app/orcamentos/${data}/editar`);
}
