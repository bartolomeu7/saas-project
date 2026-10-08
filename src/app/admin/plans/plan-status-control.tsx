"use client";

import { toast } from "sonner";
import { ConfirmActionForm } from "@/components/app/confirm-dialog";
import { setPlanStatusAction } from "@/lib/admin/actions";

/** Ativar/desativar um plano (SUPER_ADMIN). Planos nunca são excluídos: o histórico de assinaturas/pagamentos depende deles. */
export function PlanStatusControl({
  planId,
  planName,
  active,
  isProtected,
  activeSubscriptions,
}: {
  planId: string;
  planName: string;
  active: boolean;
  isProtected: boolean;
  activeSubscriptions: number;
}) {
  if (active && isProtected) {
    return <span className="text-xs text-muted-foreground">Plano do sistema</span>;
  }

  return (
    <ConfirmActionForm
      action={async () => {
        const result = await setPlanStatusAction(planId, active ? "inactive" : "active");
        if (result.error) toast.error("Não foi possível concluir", { description: result.error });
        else if (result.success) toast.success(result.success);
      }}
      label={active ? "Desativar" : "Ativar"}
      title={active ? `Desativar o plano ${planName}?` : `Ativar o plano ${planName}?`}
      description={
        active
          ? `O plano deixa de ser oferecido para novas contratações. Assinaturas existentes (${activeSubscriptions} ativa(s)) e o histórico de pagamentos são preservados.`
          : "O plano volta a ser oferecido para contratação."
      }
      confirmLabel={active ? "Desativar" : "Ativar"}
      destructive={active}
      triggerClassName="text-xs"
    />
  );
}
