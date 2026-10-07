"use client";

import { ConfirmActionForm } from "@/components/app/confirm-dialog";
import { deactivateServiceAction } from "@/lib/services/actions";

export function DeactivateServiceButton({
  serviceId,
  serviceName,
}: {
  serviceId: string;
  serviceName: string;
}) {
  return (
    <ConfirmActionForm
      action={deactivateServiceAction.bind(null, serviceId)}
      label="Desativar"
      title={`Desativar "${serviceName}"?`}
      description="O serviço deixará de aparecer como ativo, mas seus dados serão preservados."
      confirmLabel="Desativar"
      destructive
    />
  );
}
