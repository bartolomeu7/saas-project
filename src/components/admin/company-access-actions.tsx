"use client";

import { toast } from "sonner";
import { AdminActionDialog } from "@/components/admin/admin-action-dialog";
import { ConfirmActionForm } from "@/components/app/confirm-dialog";
import {
  adjustAccessExpiryAction,
  assignPlanAction,
  cancelSubscriptionAction,
  grantAccessDaysAction,
  reactivateSubscriptionAction,
  recordManualPaymentAction,
  release30DaysAction,
  syncEntitlementsAction,
} from "@/lib/admin/actions";
import { PAYMENT_METHOD_LABELS } from "@/types/admin";
import type { ActionResult } from "@/lib/auth/actions";
import type { SubscriptionStatus } from "@/types/billing";

export interface AccessPlanOption {
  id: string;
  code: string;
  name: string;
  accessDurationDays: number | null;
  price: number | null;
}

function notify(result: ActionResult) {
  if (result.error) {
    toast.error("Não foi possível concluir", { description: result.error });
  } else if (result.success) {
    toast.success(result.success);
  }
}

const REASON_FIELD = {
  type: "textarea",
  name: "reason",
  label: "Motivo",
  required: true,
  maxLength: 500,
  placeholder: "Ex.: cortesia de suporte, acordo comercial, correção de cobrança...",
  hint: "Fica registrado na auditoria.",
} as const;

/**
 * Operações de acesso/cobrança de UMA empresa (usadas na página da empresa e na
 * do usuário). O que aparece depende do papel e do estado atual da assinatura
 * (UX); cada operação chama uma RPC SECURITY DEFINER que revalida ator, limites,
 * estado e auditoria no banco — um pedido forjado é recusado do mesmo jeito.
 */
export function CompanyAccessActions({
  companyId,
  plans,
  currentPlanId,
  hasSubscription,
  subscriptionStatus,
  accessActive,
  isSuperAdmin,
  maxFreeDays,
}: {
  companyId: string;
  plans: AccessPlanOption[];
  currentPlanId: string | null;
  hasSubscription: boolean;
  subscriptionStatus: SubscriptionStatus | null;
  accessActive: boolean;
  isSuperAdmin: boolean;
  maxFreeDays: number;
}) {
  const planOptions = plans.map((plan) => ({ value: plan.id, label: plan.name }));
  // Só planos pagos (preço > 0 e duração fixa) fazem sentido para registrar um pagamento.
  const paidPlans = plans.filter((plan) => plan.accessDurationDays !== null && (plan.price ?? 0) > 0);
  const maxDays = isSuperAdmin ? 365 : maxFreeDays;
  const planField = {
    type: "select",
    name: "planId",
    label: "Plano",
    required: !hasSubscription,
    options: planOptions,
    defaultValue: currentPlanId ?? "",
    emptyLabel: hasSubscription ? "Manter o plano atual" : undefined,
    hint: hasSubscription ? undefined : "A empresa ainda não tem assinatura: escolha o plano.",
  } as const;
  const canReactivate = hasSubscription && !accessActive;
  const canCancel = isSuperAdmin && hasSubscription && subscriptionStatus !== "cancelled";

  return (
    <div className="flex flex-wrap gap-2">
      <AdminActionDialog
        triggerLabel="Conceder dias"
        title="Conceder dias de acesso"
        description={`Soma dias ao vencimento atual (ou a partir de hoje, se estiver vencido). Limite desta operação: ${maxDays} dias.`}
        submitLabel="Conceder"
        action={(formData) => grantAccessDaysAction(companyId, formData)}
        fields={[
          { type: "number", name: "days", label: "Dias", required: true, min: 1, max: maxDays, step: 1, defaultValue: Math.min(7, maxDays) },
          planField,
          REASON_FIELD,
        ]}
      />

      <AdminActionDialog
        triggerLabel="Liberar 30 dias"
        title="Liberar 30 dias de acesso"
        description="Atalho: soma 30 dias ao vencimento atual (ou a partir de hoje, se estiver vencido), sem registrar pagamento."
        submitLabel="Liberar 30 dias"
        action={(formData) => release30DaysAction(companyId, formData)}
        fields={[planField, REASON_FIELD]}
      />

      <AdminActionDialog
        triggerLabel="Pagamento manual"
        title="Registrar pagamento manual"
        description="Registra um pagamento recebido fora do EvoPay (Pix direto, transferência, dinheiro...). Por padrão também estende o acesso pela duração do plano."
        submitLabel="Registrar pagamento"
        action={(formData) => recordManualPaymentAction(companyId, formData)}
        fields={[
          {
            type: "select",
            name: "planId",
            label: "Plano pago",
            required: true,
            options: paidPlans.map((plan) => ({
              value: plan.id,
              label: `${plan.name} (${plan.accessDurationDays} dias)`,
            })),
            defaultValue: currentPlanId && paidPlans.some((plan) => plan.id === currentPlanId) ? currentPlanId : "",
          },
          { type: "number", name: "amount", label: "Valor recebido (R$)", required: true, min: 0, step: "0.01", placeholder: "0,00" },
          {
            type: "select",
            name: "method",
            label: "Forma de pagamento",
            required: true,
            defaultValue: "pix",
            options: Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => ({ value, label })),
          },
          { type: "date", name: "paidAt", label: "Data do pagamento", hint: "Em branco = agora." },
          {
            type: "text",
            name: "reference",
            label: "Referência / comprovante",
            maxLength: 120,
            hint: "Opcional. Não pode se repetir para a mesma empresa.",
          },
          { type: "textarea", name: "notes", label: "Observações", maxLength: 1000 },
          {
            type: "checkbox",
            name: "applyAccess",
            label: "Estender o acesso pela duração do plano",
            defaultChecked: true,
          },
        ]}
      />

      <AdminActionDialog
        triggerLabel={hasSubscription ? "Trocar plano" : "Atribuir plano"}
        title={hasSubscription ? "Trocar o plano" : "Atribuir plano"}
        description="Troca o plano sem registrar pagamento. Com acesso ativo, o vencimento é mantido; senão informe os dias."
        submitLabel="Atribuir"
        action={(formData) => assignPlanAction(companyId, formData)}
        fields={[
          { type: "select", name: "planId", label: "Novo plano", required: true, options: planOptions, defaultValue: "" },
          {
            type: "number",
            name: "days",
            label: "Dias de acesso (opcional)",
            min: 1,
            max: 3660,
            step: 1,
            hint: "Vazio = mantém o vencimento (acesso ativo) ou usa a duração do plano.",
          },
          REASON_FIELD,
        ]}
      />

      {canReactivate && (
        <AdminActionDialog
          triggerLabel="Reativar assinatura"
          title="Reativar assinatura"
          description="Se o período pago ainda não terminou, apenas reativa; senão libera os dias informados (ou a duração do plano)."
          submitLabel="Reativar"
          action={(formData) => reactivateSubscriptionAction(companyId, formData)}
          fields={[
            { type: "number", name: "days", label: "Dias de acesso (opcional)", min: 1, max: 3660, step: 1 },
            REASON_FIELD,
          ]}
        />
      )}

      {isSuperAdmin && hasSubscription && (
        <AdminActionDialog
          triggerLabel="Ajustar vencimento"
          title="Ajustar vencimento"
          description="Corrige a data de vencimento (inclusive para encurtar). Exclusivo de super administrador."
          submitLabel="Ajustar"
          action={(formData) => adjustAccessExpiryAction(companyId, formData)}
          fields={[
            { type: "date", name: "expiresAt", label: "Novo vencimento", required: true, hint: "Vale até o fim do dia (horário de Brasília)." },
            REASON_FIELD,
          ]}
        />
      )}

      {canCancel && (
        <AdminActionDialog
          triggerLabel="Cancelar assinatura"
          triggerVariant="destructive"
          title="Cancelar assinatura"
          description="O acesso ao produto deixa de valer imediatamente. Pode ser reativada depois. Exclusivo de super administrador."
          submitLabel="Cancelar assinatura"
          destructive
          action={(formData) => cancelSubscriptionAction(companyId, formData)}
          fields={[REASON_FIELD]}
        />
      )}

      {hasSubscription && (
        <ConfirmActionForm
          action={async () => notify(await syncEntitlementsAction(companyId))}
          label="Sincronizar entitlements"
          title="Sincronizar entitlements?"
          description="Recalcula a projeção de recursos da empresa a partir da assinatura atual. Operação segura e repetível."
          confirmLabel="Sincronizar"
          triggerClassName="self-center text-xs text-muted-foreground"
        />
      )}
    </div>
  );
}
