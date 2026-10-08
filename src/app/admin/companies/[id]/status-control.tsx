"use client";

import { toast } from "sonner";
import { ConfirmActionForm } from "@/components/app/confirm-dialog";
import { setCompanyStatusAction } from "@/lib/admin/actions";
import type { CompanyStatus } from "@/types/company";

/**
 * Ativar/inativar a empresa (SUPER_ADMIN). Empresa inativa perde o acesso ao
 * produto. Só UX: a RPC set_platform_company_status() revalida is_super_admin().
 */
export function CompanyStatusControl({
  companyId,
  companyName,
  status,
}: {
  companyId: string;
  companyName: string;
  status: CompanyStatus;
}) {
  const deactivate = status === "active";

  return (
    <ConfirmActionForm
      action={async () => {
        const result = await setCompanyStatusAction(companyId, deactivate ? "inactive" : "active");
        if (result.error) toast.error("Não foi possível concluir", { description: result.error });
        else if (result.success) toast.success(result.success);
      }}
      label={deactivate ? "Inativar empresa" : "Ativar empresa"}
      title={deactivate ? `Inativar ${companyName}?` : `Ativar ${companyName}?`}
      description={
        deactivate
          ? "A empresa perde o acesso ao produto até ser reativada. Nenhum dado é apagado. A ação fica registrada na auditoria."
          : "A empresa volta a ter acesso ao produto (conforme a assinatura). A ação fica registrada na auditoria."
      }
      confirmLabel={deactivate ? "Inativar" : "Ativar"}
      destructive={deactivate}
      triggerClassName="self-center"
    />
  );
}
