"use client";

import { ConfirmActionForm } from "@/components/app/confirm-dialog";
import { reactivateServiceAction } from "@/lib/services/actions";

export function ReactivateServiceButton({
  serviceId,
  serviceName,
}: {
  serviceId: string;
  serviceName: string;
}) {
  return (
    <ConfirmActionForm
      action={reactivateServiceAction.bind(null, serviceId)}
      label="Reativar"
      title={`Reativar "${serviceName}"?`}
      description="O serviço voltará a aparecer como ativo."
      confirmLabel="Reativar"
      triggerClassName="text-success"
    />
  );
}
