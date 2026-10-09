"use client";

import { toast } from "sonner";
import { AdminActionDialog } from "@/components/admin/admin-action-dialog";
import { LicenseGrantDialog } from "@/components/admin/license-grant-dialog";
import { ConfirmActionForm } from "@/components/app/confirm-dialog";
import {
  adjustAccessExpiryAction,
  assignPlanAction,
  cancelSubscriptionAction,
  reactivateSubscriptionAction,
  recordManualPaymentAction,
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
  lifetime: boolean;
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
 * Operações de acesso/cobrança de UMA empresa (usadas na página da empresa e na do usuário). O que aparece depende
 * do papel e do estado atual da assinatura (UX); cada operação chama uma RPC SECURITY DEFINER que revalida ator,
 * limites, estado e auditoria no banco — um pedido forjado é recusado do mesmo jeito.
 *
 *  - "Conceder acesso": libera acesso SEM pagamento (30 dias | período do plano | personalizado | vitalício).
 *  - "Registrar pagamento": documenta dinheiro RECEBIDO fora do EvoPay; opcionalmente também libera o acesso.
 *  - "Trocar/Atribuir plano": muda o plano; com período ativo preserva o vencimento.
 */
export function CompanyAccessActions({
  companyId,
  plans,
  currentPlanId,
  hasSubscription,
  subscriptionStatus,
  accessActive,
  isLifetime = false,
  isSuperAdmin,
  maxFreeDays,
}: {
  companyId: string;
  plans: AccessPlanOption[];
  currentPlanId: string | null;
  hasSubscription: boolean;
  subscriptionStatus: SubscriptionStatus | null;
  accessActive: boolean;
  isLifetime?: boolean;
  isSuperAdmin: boolean;
  maxFreeDays: number;
}) {
  // O plano vitalício só é concedido por "Conceder acesso" (super admin); nunca por troca de plano nem por pagamento.
  const timedPlans = plans.filter((plan) => !plan.lifetime);
  const planOptions = timedPlans.map((plan) => ({ value: plan.id, label: plan.name }));
  // Só planos pagos (preço > 0 e duração fixa) fazem sentido para registrar um pagamento.
  const paidPlans = timedPlans.filter((plan) => plan.accessDurationDays !== null && (plan.price ?? 0) > 0);
  const canReactivate = hasSubscription && !accessActive;
  const canCancel = isSuperAdmin && hasSubscription && subscriptionStatus !== "cancelled";
  const canChangePlan = !isLifetime || isSuperAdmin;

  return (
    <div className="flex flex-wrap gap-2">
      <LicenseGrantDialog
        companyId={companyId}
        plans={plans}
        currentPlanId={currentPlanId}
        hasSubscription={hasSubscription}
        alreadyLifetime={isLifetime}
        isSuperAdmin={isSuperAdmin}
        maxFreeDays={maxFreeDays}
      />

      <AdminActionDialog
        triggerLabel="Registrar pagamento"
        title="Registrar pagamento recebido"
        description="Documenta um pagamento recebido fora do EvoPay (Pix direto, transferência, dinheiro...). Informe apenas dinheiro realmente recebido: nada é cobrado nem simulado aqui."
        submitLabel="Registrar pagamento"
        idempotent
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
            label: "Liberar acesso agora (soma a duração do plano ao vencimento atual)",
            defaultChecked: !isLifetime,
            hint: isLifetime
              ? "A empresa tem acesso vitalício: o pagamento só é documentado, o acesso não muda."
              : "Marcado: altera a assinatura e exige valor maior que zero. Desmarcado: apenas documenta o pagamento, sem mexer no acesso.",
          },
        ]}
      />

      {canChangePlan && (
        <AdminActionDialog
          triggerLabel={hasSubscription ? "Trocar plano" : "Atribuir plano"}
          title={hasSubscription ? "Trocar o plano" : "Atribuir plano"}
          description={
            isLifetime
              ? "Substitui o acesso vitalício por um plano com prazo: informe os dias. Exclusivo de super administrador."
              : `Troca o plano sem registrar pagamento. Com acesso ativo, o vencimento é mantido; senão informe os dias (administradores: até ${maxFreeDays} dias sem pagamento).`
          }
          submitLabel="Atribuir"
          action={(formData) => assignPlanAction(companyId, formData)}
          fields={[
            { type: "select", name: "planId", label: "Novo plano", required: true, options: planOptions, defaultValue: "" },
            {
              type: "number",
              name: "days",
              label: isLifetime ? "Dias de acesso" : "Dias de acesso (opcional)",
              required: isLifetime,
              min: 1,
              max: 3660,
              step: 1,
              hint: "Vazio = mantém o vencimento (acesso ativo) ou usa a duração do plano.",
            },
            REASON_FIELD,
          ]}
        />
      )}

      {canReactivate && (
        <AdminActionDialog
          triggerLabel="Reativar assinatura"
          title="Reativar assinatura"
          description={
            isLifetime
              ? "Devolve o acesso vitalício que foi cancelado."
              : "Se o período pago ainda não terminou, apenas reativa; senão libera os dias informados (ou a duração do plano, dentro do seu limite)."
          }
          submitLabel="Reativar"
          action={(formData) => reactivateSubscriptionAction(companyId, formData)}
          fields={[
            ...(isLifetime ? [] : [{ type: "number" as const, name: "days", label: "Dias de acesso (opcional)", min: 1, max: 3660, step: 1 }]),
            REASON_FIELD,
          ]}
        />
      )}

      {isSuperAdmin && hasSubscription && !isLifetime && (
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
