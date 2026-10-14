"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSessionClient } from "@/lib/supabase/server";
import { requirePlatformAdmin, requireSuperAdmin } from "@/lib/admin/queries";
import { confirmPaymentFromProvider } from "@/lib/billing/confirm-payment";
import type { ActionResult } from "@/lib/auth/actions";
import { buildPlanPayload } from "@/lib/admin/plan-form";
import type { Json } from "@/types/supabase";

/**
 * Server Actions do painel da PLATAFORMA. Cada uma só valida o formato do pedido
 * (zod) e repassa para uma RPC SECURITY DEFINER, que é a AUTORIDADE: ela revalida
 * o ator pela sessão do Clerk (is_platform_admin() / is_super_admin(), com status
 * active), o alvo, a hierarquia, os limites e grava a auditoria. Nada aqui concede
 * permissão — esconder botão na UI não é segurança, e estas actions também não
 * confiam em nenhum dado de papel vindo do cliente. Os helpers requirePlatformAdmin
 * / requireSuperAdmin são só a primeira camada (e evitam chamadas inúteis).
 */

const uuid = z.string().uuid();
const userStatus = z.enum(["active", "inactive", "suspended"]);
const userRole = z.enum(["user", "admin", "super_admin"]);
const companyStatus = z.enum(["active", "inactive"]);
const paymentMethod = z.enum(["pix", "transfer", "cash", "card_external", "other"]);

/** Mensagens fixas de RPCs antigas que também são seguras de mostrar. */
const SAFE_PREFIXES = [
  "Não é permitido",
  "Sem permissão",
  "O usuário já",
  "Usuário não encontrado",
  "A plataforma precisa",
  "Parâmetros inválidos",
];

/**
 * Mensagem para o administrador. As RPCs lançam P0001 (raise exception) apenas
 * com textos curados em português; qualquer outro código (permissão do Postgres,
 * constraint, rede) vira uma mensagem genérica — nunca vaza detalhe interno.
 */
function toUserMessage(error: { message: string; code?: string }): string {
  if (error.message === "not authorized") {
    return "Você não tem permissão para realizar esta operação.";
  }
  if (error.code === "P0001" || SAFE_PREFIXES.some((prefix) => error.message.startsWith(prefix))) {
    return error.message;
  }
  return "Não foi possível concluir a operação. Tente novamente.";
}

function formString(formData: FormData, name: string): string | undefined {
  const value = formData.get(name);
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

function invalid(issue?: z.ZodIssue): ActionResult {
  return { error: issue?.message && issue.message !== "Required" ? issue.message : "Parâmetros inválidos." };
}

function revalidateCompany(companyId: string) {
  revalidatePath("/admin");
  revalidatePath("/admin/companies");
  revalidatePath(`/admin/companies/${companyId}`);
  revalidatePath("/admin/users");
  revalidatePath("/admin/subscriptions");
  revalidatePath("/admin/payments");
  revalidatePath("/admin/audit");
}

/* ----------------------------------------------------------------- usuários */

/** Suspender, reativar ou inativar um usuário. admin só age sobre usuários comuns. */
export async function setUserStatusAction(
  targetUserId: string,
  status: string
): Promise<ActionResult> {
  await requirePlatformAdmin();

  const parsed = z.object({ id: uuid, status: userStatus }).safeParse({ id: targetUserId, status });
  if (!parsed.success) {
    return { error: "Parâmetros inválidos." };
  }

  const supabase = await createSessionClient();
  const { error } = await supabase.rpc("set_platform_user_status", {
    p_target_user_id: parsed.data.id,
    p_status: parsed.data.status,
  });

  if (error) {
    console.error("[admin] set_platform_user_status() falhou:", error.message);
    return { error: toUserMessage(error) };
  }

  revalidatePath("/admin");
  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${parsed.data.id}`);
  revalidatePath("/admin/administrators");
  revalidatePath("/admin/audit");
  return { success: "Status do usuário atualizado." };
}

/** Promover ou rebaixar o papel de um usuário. SUPER_ADMIN ONLY (revalidado no banco). */
export async function setUserRoleAction(targetUserId: string, role: string): Promise<ActionResult> {
  await requirePlatformAdmin();

  const parsed = z.object({ id: uuid, role: userRole }).safeParse({ id: targetUserId, role });
  if (!parsed.success) {
    return { error: "Parâmetros inválidos." };
  }

  const supabase = await createSessionClient();
  const { error } = await supabase.rpc("set_platform_user_role", {
    p_target_user_id: parsed.data.id,
    p_role: parsed.data.role,
  });

  if (error) {
    console.error("[admin] set_platform_user_role() falhou:", error.message);
    return { error: toUserMessage(error) };
  }

  revalidatePath("/admin");
  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${parsed.data.id}`);
  revalidatePath("/admin/administrators");
  revalidatePath("/admin/audit");
  return { success: "Papel do usuário atualizado." };
}

/** Único campo de perfil editável por administrador: o nome. E-mail e vínculo Clerk são do Clerk. */
export async function updateUserProfileAction(userId: string, formData: FormData): Promise<ActionResult> {
  await requirePlatformAdmin();

  const parsed = z
    .object({ id: uuid, fullName: z.string().trim().min(1, "Informe o nome.").max(160, "Nome muito longo.") })
    .safeParse({ id: userId, fullName: formString(formData, "fullName") });
  if (!parsed.success) return invalid(parsed.error.issues[0]);

  const supabase = await createSessionClient();
  const { error } = await supabase.rpc("admin_update_user_profile", {
    p_user_id: parsed.data.id,
    p_full_name: parsed.data.fullName,
  });

  if (error) {
    console.error("[admin] admin_update_user_profile() falhou:", error.message);
    return { error: toUserMessage(error) };
  }

  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${parsed.data.id}`);
  revalidatePath("/admin/audit");
  return { success: "Nome atualizado." };
}

/**
 * SUPER_ADMIN: promove (ou rebaixa) um perfil EXISTENTE localizado pelo e-mail.
 * Nunca cria identidade — quem não tem conta precisa se cadastrar pelo Clerk antes.
 */
export async function changeRoleByEmailAction(formData: FormData): Promise<ActionResult> {
  await requireSuperAdmin();

  const parsed = z
    .object({ email: z.string().trim().toLowerCase().email("E-mail inválido.").max(254), role: userRole })
    .safeParse({ email: formString(formData, "email"), role: formString(formData, "role") });
  if (!parsed.success) return invalid(parsed.error.issues[0]);

  const supabase = await createSessionClient();
  const { data: found, error: findError } = await supabase.rpc("admin_find_user_by_email", {
    p_email: parsed.data.email,
  });

  if (findError || !found?.[0]) {
    if (findError) console.error("[admin] admin_find_user_by_email() falhou:", findError.message);
    return { error: findError ? toUserMessage(findError) : "Usuário não encontrado." };
  }

  const { error } = await supabase.rpc("set_platform_user_role", {
    p_target_user_id: found[0].user_id,
    p_role: parsed.data.role,
  });

  if (error) {
    console.error("[admin] set_platform_user_role() falhou:", error.message);
    return { error: toUserMessage(error) };
  }

  revalidatePath("/admin");
  revalidatePath("/admin/users");
  revalidatePath("/admin/administrators");
  revalidatePath("/admin/audit");
  return { success: `Papel de ${found[0].email} atualizado.` };
}

/* ------------------------------------------------------------------- acesso */

const reason = z.string().trim().min(3, "Informe o motivo (mínimo 3 caracteres).").max(500, "Motivo muito longo.");
const optionalDays = z
  .string()
  .regex(/^\d{1,4}$/, "Quantidade de dias inválida.")
  .transform(Number)
  .optional();

export async function grantAccessDaysAction(companyId: string, formData: FormData): Promise<ActionResult> {
  await requirePlatformAdmin();

  const parsed = z
    .object({
      companyId: uuid,
      days: z.string().regex(/^\d{1,3}$/, "Informe a quantidade de dias.").transform(Number),
      planId: uuid.optional(),
      reason,
    })
    .safeParse({
      companyId,
      days: formString(formData, "days"),
      planId: formString(formData, "planId"),
      reason: formString(formData, "reason"),
    });
  if (!parsed.success) return invalid(parsed.error.issues[0]);

  const supabase = await createSessionClient();
  const { error } = await supabase.rpc("admin_grant_access_days", {
    p_company_id: parsed.data.companyId,
    p_days: parsed.data.days,
    p_plan_id: parsed.data.planId,
    p_reason: parsed.data.reason,
  });

  if (error) {
    console.error("[admin] admin_grant_access_days() falhou:", error.message);
    return { error: toUserMessage(error) };
  }

  revalidateCompany(parsed.data.companyId);
  return { success: `${parsed.data.days} dia(s) de acesso concedido(s).` };
}

export async function release30DaysAction(companyId: string, formData: FormData): Promise<ActionResult> {
  await requirePlatformAdmin();

  const parsed = z
    .object({ companyId: uuid, planId: uuid.optional(), reason })
    .safeParse({
      companyId,
      planId: formString(formData, "planId"),
      reason: formString(formData, "reason"),
    });
  if (!parsed.success) return invalid(parsed.error.issues[0]);

  const supabase = await createSessionClient();
  const { error } = await supabase.rpc("admin_release_30_days", {
    p_company_id: parsed.data.companyId,
    p_plan_id: parsed.data.planId,
    p_reason: parsed.data.reason,
  });

  if (error) {
    console.error("[admin] admin_release_30_days() falhou:", error.message);
    return { error: toUserMessage(error) };
  }

  revalidateCompany(parsed.data.companyId);
  return { success: "30 dias de acesso liberados." };
}

/** SUPER_ADMIN: corrige o vencimento (inclusive para encurtar acesso concedido por engano). */
export async function adjustAccessExpiryAction(companyId: string, formData: FormData): Promise<ActionResult> {
  await requireSuperAdmin();

  const parsed = z
    .object({
      companyId: uuid,
      expiresAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe a nova data de vencimento."),
      reason,
    })
    .safeParse({
      companyId,
      expiresAt: formString(formData, "expiresAt"),
      reason: formString(formData, "reason"),
    });
  if (!parsed.success) return invalid(parsed.error.issues[0]);

  // Fim do dia no horário de Brasília (UTC-3, sem horário de verão desde 2019).
  const expires = new Date(`${parsed.data.expiresAt}T23:59:59-03:00`);
  if (Number.isNaN(expires.getTime())) return { error: "Data de vencimento inválida." };

  const supabase = await createSessionClient();
  const { error } = await supabase.rpc("admin_adjust_access_expiry", {
    p_company_id: parsed.data.companyId,
    p_expires_at: expires.toISOString(),
    p_reason: parsed.data.reason,
  });

  if (error) {
    console.error("[admin] admin_adjust_access_expiry() falhou:", error.message);
    return { error: toUserMessage(error) };
  }

  revalidateCompany(parsed.data.companyId);
  return { success: "Vencimento ajustado." };
}

/* ------------------------------------------------- pagamentos e assinaturas */

export async function recordManualPaymentAction(companyId: string, formData: FormData): Promise<ActionResult> {
  await requirePlatformAdmin();

  const parsed = z
    .object({
      companyId: uuid,
      planId: uuid,
      amount: z
        .string()
        .transform((value) => Number(value.replace(",", ".")))
        .pipe(z.number({ invalid_type_error: "Valor inválido." }).min(0, "Valor inválido.").max(1_000_000, "Valor inválido.")),
      method: paymentMethod,
      reference: z.string().trim().max(120, "Referência muito longa.").optional(),
      notes: z.string().trim().max(1000, "Observação muito longa.").optional(),
      paidAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data do pagamento inválida.").optional(),
      applyAccess: z.boolean(),
      requestKey: uuid.optional(),
    })
    .safeParse({
      companyId,
      planId: formString(formData, "planId"),
      amount: formString(formData, "amount"),
      method: formString(formData, "method"),
      reference: formString(formData, "reference"),
      notes: formString(formData, "notes"),
      paidAt: formString(formData, "paidAt"),
      applyAccess: formData.get("applyAccess") === "on",
      requestKey: formString(formData, "requestKey"),
    });
  if (!parsed.success) return invalid(parsed.error.issues[0]);

  const paidAt = parsed.data.paidAt ? new Date(`${parsed.data.paidAt}T12:00:00-03:00`) : undefined;
  if (paidAt && Number.isNaN(paidAt.getTime())) return { error: "Data do pagamento inválida." };

  const supabase = await createSessionClient();
  const { data, error } = await supabase.rpc("admin_record_manual_payment", {
    p_company_id: parsed.data.companyId,
    p_plan_id: parsed.data.planId,
    p_amount: parsed.data.amount,
    p_method: parsed.data.method,
    p_reference: parsed.data.reference,
    p_notes: parsed.data.notes,
    p_paid_at: paidAt?.toISOString(),
    p_apply_access: parsed.data.applyAccess,
    p_request_key: parsed.data.requestKey,
  });

  if (error) {
    console.error("[admin] admin_record_manual_payment() falhou:", error.message);
    return { error: toUserMessage(error) };
  }

  revalidateCompany(parsed.data.companyId);
  if ((data as { replayed?: boolean } | null)?.replayed) {
    return { success: "Este pagamento já havia sido registrado nesta operação; nada foi duplicado." };
  }
  return {
    success: parsed.data.applyAccess
      ? "Pagamento manual registrado e acesso estendido."
      : "Pagamento manual registrado (sem alterar o acesso).",
  };
}

/** SUPER_ADMIN: anula um pagamento manual (não apaga a linha e não reverte o acesso). */
export async function voidManualPaymentAction(paymentId: string, formData: FormData): Promise<ActionResult> {
  await requireSuperAdmin();

  const parsed = z
    .object({ paymentId: uuid, reason })
    .safeParse({ paymentId, reason: formString(formData, "reason") });
  if (!parsed.success) return invalid(parsed.error.issues[0]);

  const supabase = await createSessionClient();
  const { error } = await supabase.rpc("admin_void_manual_payment", {
    p_payment_id: parsed.data.paymentId,
    p_reason: parsed.data.reason,
  });

  if (error) {
    console.error("[admin] admin_void_manual_payment() falhou:", error.message);
    return { error: toUserMessage(error) };
  }

  revalidatePath("/admin");
  revalidatePath("/admin/payments");
  revalidatePath(`/admin/payments/${parsed.data.paymentId}`);
  revalidatePath("/admin/audit");
  return { success: "Pagamento manual anulado. O acesso concedido não foi alterado." };
}

export async function assignPlanAction(companyId: string, formData: FormData): Promise<ActionResult> {
  await requirePlatformAdmin();

  const parsed = z
    .object({ companyId: uuid, planId: uuid, days: optionalDays, reason })
    .safeParse({
      companyId,
      planId: formString(formData, "planId"),
      days: formString(formData, "days"),
      reason: formString(formData, "reason"),
    });
  if (!parsed.success) return invalid(parsed.error.issues[0]);

  const supabase = await createSessionClient();
  const { error } = await supabase.rpc("admin_assign_plan", {
    p_company_id: parsed.data.companyId,
    p_plan_id: parsed.data.planId,
    p_days: parsed.data.days,
    p_reason: parsed.data.reason,
  });

  if (error) {
    console.error("[admin] admin_assign_plan() falhou:", error.message);
    return { error: toUserMessage(error) };
  }

  revalidateCompany(parsed.data.companyId);
  return { success: "Plano atribuído." };
}

/** SUPER_ADMIN: cancela a assinatura (o acesso deixa de valer imediatamente). */
export async function cancelSubscriptionAction(companyId: string, formData: FormData): Promise<ActionResult> {
  await requireSuperAdmin();

  const parsed = z
    .object({ companyId: uuid, reason })
    .safeParse({ companyId, reason: formString(formData, "reason") });
  if (!parsed.success) return invalid(parsed.error.issues[0]);

  const supabase = await createSessionClient();
  const { error } = await supabase.rpc("admin_cancel_subscription", {
    p_company_id: parsed.data.companyId,
    p_reason: parsed.data.reason,
  });

  if (error) {
    console.error("[admin] admin_cancel_subscription() falhou:", error.message);
    return { error: toUserMessage(error) };
  }

  revalidateCompany(parsed.data.companyId);
  return { success: "Assinatura cancelada." };
}

export async function reactivateSubscriptionAction(companyId: string, formData: FormData): Promise<ActionResult> {
  await requirePlatformAdmin();

  const parsed = z
    .object({ companyId: uuid, days: optionalDays, reason })
    .safeParse({
      companyId,
      days: formString(formData, "days"),
      reason: formString(formData, "reason"),
    });
  if (!parsed.success) return invalid(parsed.error.issues[0]);

  const supabase = await createSessionClient();
  const { error } = await supabase.rpc("admin_reactivate_subscription", {
    p_company_id: parsed.data.companyId,
    p_days: parsed.data.days,
    p_reason: parsed.data.reason,
  });

  if (error) {
    console.error("[admin] admin_reactivate_subscription() falhou:", error.message);
    return { error: toUserMessage(error) };
  }

  revalidateCompany(parsed.data.companyId);
  return { success: "Assinatura reativada." };
}

/**
 * Reverifica um pagamento EvoPay: refaz o GET /pix na EvoPay (nunca confia em
 * payload) via o mesmo caminho do webhook e do "Já paguei". O service_role só é
 * usado dentro de confirmPaymentFromProvider, no servidor, DEPOIS de o ator ser
 * validado como admin; o resultado é auditado via RPC.
 */
export async function reverifyPaymentAction(paymentId: string): Promise<ActionResult> {
  await requirePlatformAdmin();

  const parsed = uuid.safeParse(paymentId);
  if (!parsed.success) return { error: "Parâmetros inválidos." };

  // A leitura passa pela RPC de detalhe: garante que o ator enxerga o pagamento e que ele existe.
  const supabase = await createSessionClient();
  const { data: detail, error: detailError } = await supabase.rpc("get_platform_payment_detail", {
    p_payment_id: parsed.data,
  });
  if (detailError) {
    console.error("[admin] get_platform_payment_detail() falhou:", detailError.message);
    return { error: toUserMessage(detailError) };
  }
  const provider = (detail as unknown as { payment: { provider: string } }).payment.provider;
  if (provider !== "evopay") {
    return { error: "Somente pagamentos da EvoPay podem ser reverificados." };
  }

  let result: Awaited<ReturnType<typeof confirmPaymentFromProvider>>;
  try {
    result = await confirmPaymentFromProvider(parsed.data, { recheckPaid: true });
  } catch (error) {
    // Ex.: service role/EvoPay não configurados neste ambiente. Nunca expõe o erro cru.
    console.error("[admin] reverificação falhou:", error instanceof Error ? error.message : "erro desconhecido");
    result = { ok: false, status: "pending", message: "Não foi possível consultar a EvoPay neste ambiente agora." };
  }

  const { error: auditError } = await supabase.rpc("admin_audit_payment_reverify", {
    p_payment_id: parsed.data,
    p_outcome: result.ok ? result.status : "error",
  });
  if (auditError) {
    console.error("[admin] admin_audit_payment_reverify() falhou:", auditError.message);
  }

  revalidatePath("/admin");
  revalidatePath("/admin/payments");
  revalidatePath(`/admin/payments/${parsed.data}`);
  revalidatePath("/admin/subscriptions");
  revalidatePath("/admin/integrations");

  if (!result.ok) {
    return { error: result.message ?? "Não foi possível reverificar o pagamento agora." };
  }
  return { success: `Reverificado na EvoPay: ${result.status === "paid" ? "pagamento confirmado" : `situação "${result.status}"`}.` };
}

/* -------------------------------------------------------------------- planos */

export type SavePlanResult = ActionResult & { planId?: string };

/**
 * SUPER_ADMIN: cria (planId = null) ou edita um plano em UMA operação atômica (RPC admin_save_plan). O zod só valida o
 * FORMATO; preço mínimo, desconto válido, plano personalizado sem preço, janela de promoção, benefícios etc. são
 * regras do banco (e a autorização também: usuário comum/admin recebem "not authorized"). Planos nunca são excluídos.
 * Mudar o preço NÃO altera cobranças já criadas nem assinaturas existentes; limites só propagam com confirmação explícita.
 */
export async function savePlanAction(planId: string | null, input: unknown): Promise<SavePlanResult> {
  await requireSuperAdmin();

  if (planId !== null && !uuid.safeParse(planId).success) return { error: "Parâmetros inválidos." };
  const built = buildPlanPayload(input, { creating: planId === null });
  if (!built.ok) return { error: built.error };

  const supabase = await createSessionClient();
  const { data, error } = await supabase.rpc("admin_save_plan", {
    p_plan_id: planId as unknown as string, // NULL = criar (o gerador de tipos não expressa NULL em argumentos)
    p_payload: built.payload as unknown as Json,
  });

  if (error) {
    console.error("[admin] admin_save_plan() falhou:", error.message);
    return { error: toUserMessage(error) };
  }

  revalidatePath("/admin/plans");
  revalidatePath("/admin/audit");
  revalidatePath("/app/assinatura/planos");
  revalidatePath("/"); // a home lê o catálogo público (revalida também por tempo)
  return { success: planId === null ? "Plano criado." : "Plano atualizado.", planId: typeof data === "string" ? data : (planId ?? undefined) };
}

export async function setPlanStatusAction(planId: string, status: string): Promise<ActionResult> {
  await requireSuperAdmin();

  const parsed = z
    .object({ planId: uuid, status: z.enum(["active", "inactive"]) })
    .safeParse({ planId, status });
  if (!parsed.success) return { error: "Parâmetros inválidos." };

  const supabase = await createSessionClient();
  const { error } = await supabase.rpc("set_platform_plan_status", {
    p_plan_id: parsed.data.planId,
    p_status: parsed.data.status,
  });

  if (error) {
    console.error("[admin] set_platform_plan_status() falhou:", error.message);
    return { error: toUserMessage(error) };
  }

  revalidatePath("/admin/plans");
  revalidatePath("/app/assinatura/planos");
  revalidatePath("/admin/audit");
  revalidatePath("/");
  return { success: parsed.data.status === "active" ? "Plano ativado." : "Plano desativado." };
}

/* ------------------------------------------------------------------ empresas */

export async function updateCompanyAction(companyId: string, formData: FormData): Promise<ActionResult> {
  await requirePlatformAdmin();

  const parsed = z
    .object({
      companyId: uuid,
      name: z.string().trim().min(1, "Informe o nome da empresa.").max(120, "Nome muito longo."),
      businessType: z.enum([
        "bakery",
        "car_wash",
        "automotive_detailing",
        "grocery",
        "restaurant",
        "snack_bar",
        "beauty_salon",
        "workshop",
        "service_provider",
        "other",
      ]),
    })
    .safeParse({
      companyId,
      name: formString(formData, "name"),
      businessType: formString(formData, "businessType"),
    });
  if (!parsed.success) return invalid(parsed.error.issues[0]);

  const supabase = await createSessionClient();
  const { error } = await supabase.rpc("admin_update_company", {
    p_company_id: parsed.data.companyId,
    p_name: parsed.data.name,
    p_business_type: parsed.data.businessType,
  });

  if (error) {
    console.error("[admin] admin_update_company() falhou:", error.message);
    return { error: toUserMessage(error) };
  }

  revalidateCompany(parsed.data.companyId);
  return { success: "Empresa atualizada." };
}

/** SUPER_ADMIN: ativa/inativa uma empresa (inativa = sem acesso ao produto). */
export async function setCompanyStatusAction(companyId: string, status: string): Promise<ActionResult> {
  await requireSuperAdmin();

  const parsed = z.object({ companyId: uuid, status: companyStatus }).safeParse({ companyId, status });
  if (!parsed.success) return { error: "Parâmetros inválidos." };

  const supabase = await createSessionClient();
  const { error } = await supabase.rpc("set_platform_company_status", {
    p_company_id: parsed.data.companyId,
    p_status: parsed.data.status,
  });

  if (error) {
    console.error("[admin] set_platform_company_status() falhou:", error.message);
    return { error: toUserMessage(error) };
  }

  revalidateCompany(parsed.data.companyId);
  return { success: parsed.data.status === "active" ? "Empresa ativada." : "Empresa inativada." };
}

/* ------------------------------------------------------- configurações/tools */

/** SUPER_ADMIN: altera uma configuração real da plataforma (faixa validada no banco). */
export async function setPlatformSettingAction(key: string, formData: FormData): Promise<ActionResult> {
  await requireSuperAdmin();

  const parsed = z
    .object({
      key: z.string().regex(/^[a-z_]{3,60}$/, "Configuração inválida."),
      value: z.string().regex(/^\d{1,6}$/, "Informe um número inteiro.").transform(Number),
      reason: z.string().trim().max(500, "Motivo muito longo.").optional(),
    })
    .safeParse({ key, value: formString(formData, "value"), reason: formString(formData, "reason") });
  if (!parsed.success) return invalid(parsed.error.issues[0]);

  const supabase = await createSessionClient();
  const { error } = await supabase.rpc("set_platform_setting", {
    p_key: parsed.data.key,
    p_value: parsed.data.value,
    p_reason: parsed.data.reason,
  });

  if (error) {
    console.error("[admin] set_platform_setting() falhou:", error.message);
    return { error: toUserMessage(error) };
  }

  revalidatePath("/admin/settings");
  revalidatePath("/admin/audit");
  return { success: "Configuração salva." };
}

export async function syncEntitlementsAction(companyId: string): Promise<ActionResult> {
  await requirePlatformAdmin();

  const parsed = uuid.safeParse(companyId);
  if (!parsed.success) return { error: "Parâmetros inválidos." };

  const supabase = await createSessionClient();
  const { error } = await supabase.rpc("admin_sync_company_entitlements", { p_company_id: parsed.data });

  if (error) {
    console.error("[admin] admin_sync_company_entitlements() falhou:", error.message);
    return { error: toUserMessage(error) };
  }

  revalidateCompany(parsed.data);
  revalidatePath("/admin/tools");
  return { success: "Entitlements sincronizados com a assinatura." };
}

export async function markExpiredSubscriptionsAction(): Promise<ActionResult> {
  await requirePlatformAdmin();

  const supabase = await createSessionClient();
  const { data, error } = await supabase.rpc("admin_mark_expired_subscriptions");

  if (error) {
    console.error("[admin] admin_mark_expired_subscriptions() falhou:", error.message);
    return { error: toUserMessage(error) };
  }

  revalidatePath("/admin");
  revalidatePath("/admin/tools");
  revalidatePath("/admin/subscriptions");
  revalidatePath("/admin/audit");
  return { success: data === 0 ? "Nenhuma assinatura precisava ser atualizada." : `${data} assinatura(s) marcada(s) como expirada(s).` };
}

/* ------------------------------------------------- licenças (concessão unificada) */

const licenseKind = z.enum(["thirty_days", "plan_period", "custom_days", "lifetime"]);

/**
 * Concessão de acesso SEM pagamento: 30 dias | período do plano | dias personalizados | vitalício (super_admin).
 * Exige motivo, confirmação explícita e chave de idempotência; limites e papéis são revalidados no banco.
 */
export async function grantLicenseAction(companyId: string, formData: FormData): Promise<ActionResult> {
  await requirePlatformAdmin();

  const parsed = z
    .object({
      companyId: uuid,
      kind: licenseKind,
      planId: uuid.optional(),
      days: z
        .string()
        .regex(/^\d{1,3}$/, "Informe a quantidade de dias.")
        .transform(Number)
        .optional(),
      reason,
      confirm: z.literal(true, { errorMap: () => ({ message: "Confirme a operação para continuar." }) }),
      requestKey: uuid,
    })
    .safeParse({
      companyId,
      kind: formString(formData, "kind"),
      planId: formString(formData, "planId"),
      days: formString(formData, "days"),
      reason: formString(formData, "reason"),
      confirm: formData.get("confirm") === "on",
      requestKey: formString(formData, "requestKey"),
    });
  if (!parsed.success) return invalid(parsed.error.issues[0]);
  if (parsed.data.kind === "custom_days" && parsed.data.days === undefined) return { error: "Informe a quantidade de dias." };
  if (parsed.data.kind === "plan_period" && !parsed.data.planId) return { error: "Escolha o plano." };

  const supabase = await createSessionClient();
  const { data, error } = await supabase.rpc("admin_grant_license", {
    p_company_id: parsed.data.companyId,
    p_kind: parsed.data.kind,
    // O gerador de tipos não expressa NULL em argumentos de função; a RPC aceita NULL nestes dois (cast pontual).
    p_plan_id: (parsed.data.kind === "lifetime" ? null : (parsed.data.planId ?? null)) as unknown as string,
    p_days: (parsed.data.kind === "custom_days" ? (parsed.data.days ?? null) : null) as unknown as number,
    p_reason: parsed.data.reason,
    p_request_key: parsed.data.requestKey,
  });

  if (error) {
    console.error("[admin] admin_grant_license() falhou:", error.message);
    return { error: toUserMessage(error) };
  }

  revalidateCompany(parsed.data.companyId);
  const result = data as { replayed?: boolean; days?: number; lifetime?: boolean } | null;
  if (result?.replayed) return { success: "Esta concessão já havia sido aplicada; nada foi duplicado." };
  if (result?.lifetime) return { success: "Acesso vitalício concedido." };
  return { success: `${result?.days ?? ""} dia(s) de acesso concedido(s).`.trim() };
}

/* ---------------------------------------------------- membros e propriedade */

const companyMemberRole = z.enum(["admin", "employee"]);

export async function addCompanyMemberAction(companyId: string, formData: FormData): Promise<ActionResult> {
  await requirePlatformAdmin();

  const parsed = z
    .object({
      companyId: uuid,
      email: z.string().trim().toLowerCase().email("E-mail inválido.").max(254),
      role: companyMemberRole,
      reason,
      requestKey: uuid,
    })
    .safeParse({
      companyId,
      email: formString(formData, "email"),
      role: formString(formData, "role"),
      reason: formString(formData, "reason"),
      requestKey: formString(formData, "requestKey"),
    });
  if (!parsed.success) return invalid(parsed.error.issues[0]);

  const supabase = await createSessionClient();
  const { data, error } = await supabase.rpc("admin_add_company_member", {
    p_company_id: parsed.data.companyId,
    p_email: parsed.data.email,
    p_role: parsed.data.role,
    p_reason: parsed.data.reason,
    p_request_key: parsed.data.requestKey,
  });

  if (error) {
    console.error("[admin] admin_add_company_member() falhou:", error.message);
    return { error: toUserMessage(error) };
  }

  revalidateCompany(parsed.data.companyId);
  return {
    success: (data as { replayed?: boolean } | null)?.replayed
      ? "Este colaborador já havia sido adicionado; nada foi duplicado."
      : "Colaborador adicionado.",
  };
}

export async function setCompanyMemberRoleAction(
  companyId: string,
  userId: string,
  formData: FormData
): Promise<ActionResult> {
  await requirePlatformAdmin();

  const parsed = z
    .object({ companyId: uuid, userId: uuid, role: companyMemberRole, reason })
    .safeParse({ companyId, userId, role: formString(formData, "role"), reason: formString(formData, "reason") });
  if (!parsed.success) return invalid(parsed.error.issues[0]);

  const supabase = await createSessionClient();
  const { error } = await supabase.rpc("admin_set_company_member_role", {
    p_company_id: parsed.data.companyId,
    p_user_id: parsed.data.userId,
    p_role: parsed.data.role,
    p_reason: parsed.data.reason,
  });

  if (error) {
    console.error("[admin] admin_set_company_member_role() falhou:", error.message);
    return { error: toUserMessage(error) };
  }

  revalidateCompany(parsed.data.companyId);
  return { success: "Papel do colaborador atualizado." };
}

export async function removeCompanyMemberAction(
  companyId: string,
  userId: string,
  formData: FormData
): Promise<ActionResult> {
  await requirePlatformAdmin();

  const parsed = z
    .object({ companyId: uuid, userId: uuid, reason })
    .safeParse({ companyId, userId, reason: formString(formData, "reason") });
  if (!parsed.success) return invalid(parsed.error.issues[0]);

  const supabase = await createSessionClient();
  const { error } = await supabase.rpc("admin_remove_company_member", {
    p_company_id: parsed.data.companyId,
    p_user_id: parsed.data.userId,
    p_reason: parsed.data.reason,
  });

  if (error) {
    console.error("[admin] admin_remove_company_member() falhou:", error.message);
    return { error: toUserMessage(error) };
  }

  revalidateCompany(parsed.data.companyId);
  return { success: "Colaborador removido da empresa." };
}

/** SUPER_ADMIN: transfere a propriedade a um membro ativo (um único owner ao final). */
export async function transferCompanyOwnershipAction(companyId: string, formData: FormData): Promise<ActionResult> {
  await requireSuperAdmin();

  const parsed = z
    .object({
      companyId: uuid,
      newOwnerUserId: uuid,
      reason,
      confirm: z.literal(true, { errorMap: () => ({ message: "Confirme a operação para continuar." }) }),
      requestKey: uuid,
    })
    .safeParse({
      companyId,
      newOwnerUserId: formString(formData, "newOwnerUserId"),
      reason: formString(formData, "reason"),
      confirm: formData.get("confirm") === "on",
      requestKey: formString(formData, "requestKey"),
    });
  if (!parsed.success) return invalid(parsed.error.issues[0]);

  const supabase = await createSessionClient();
  const { error } = await supabase.rpc("admin_transfer_company_ownership", {
    p_company_id: parsed.data.companyId,
    p_new_owner_user_id: parsed.data.newOwnerUserId,
    p_reason: parsed.data.reason,
    p_request_key: parsed.data.requestKey,
  });

  if (error) {
    console.error("[admin] admin_transfer_company_ownership() falhou:", error.message);
    return { error: toUserMessage(error) };
  }

  revalidateCompany(parsed.data.companyId);
  return { success: "Propriedade da empresa transferida." };
}

/* ---------------------------------------------------------- reconciliação */

const RECONCILE_BATCH = 15;
const RECONCILE_BUDGET_MS = 8_000;

/**
 * Reconsulta na EvoPay (GET /pix?id=, a única fonte de verdade: o webhook não é assinado e tem UMA tentativa)
 * as cobranças Pix pendentes com mais de 10 minutos. Segura e repetível: o banco só concede acesso com valor igual
 * ao esperado e é idempotente por evento. Para dentro de um orçamento de tempo; rode de novo para o restante.
 */
export async function reconcilePendingPaymentsAction(): Promise<ActionResult> {
  await requirePlatformAdmin();

  const supabase = await createSessionClient();
  const { data: candidates, error } = await supabase.rpc("platform_reconcile_candidates", {
    p_limit: RECONCILE_BATCH,
    p_min_age_minutes: 10,
  });
  if (error) {
    console.error("[admin] platform_reconcile_candidates() falhou:", error.message);
    return { error: toUserMessage(error) };
  }
  if (!candidates || candidates.length === 0) {
    return { success: "Nenhuma cobrança Pix pendente para reconciliar." };
  }

  const startedAt = Date.now();
  let checked = 0;
  let confirmed = 0;
  let stillPending = 0;
  let errors = 0;

  for (const candidate of candidates) {
    if (Date.now() - startedAt > RECONCILE_BUDGET_MS) break;
    checked += 1;
    try {
      const result = await confirmPaymentFromProvider(candidate.payment_id);
      if (!result.ok) errors += 1;
      else if (result.status === "paid") confirmed += 1;
      else if (result.status === "pending") stillPending += 1;
    } catch {
      errors += 1;
    }
  }

  const { error: auditError } = await supabase.rpc("admin_audit_reconciliation", {
    p_checked: checked,
    p_confirmed: confirmed,
    p_still_pending: stillPending,
    p_errors: errors,
  });
  if (auditError) console.error("[admin] admin_audit_reconciliation() falhou:", auditError.message);

  revalidatePath("/admin");
  revalidatePath("/admin/payments");
  revalidatePath("/admin/subscriptions");
  revalidatePath("/admin/tools");
  revalidatePath("/admin/audit");

  const summary = `${checked} verificada(s): ${confirmed} confirmada(s), ${stillPending} ainda pendente(s), ${errors} com erro.`;
  if (errors > 0 && confirmed === 0 && stillPending === 0) {
    return { error: `Não foi possível consultar a EvoPay agora. ${summary}` };
  }
  return { success: summary };
}
