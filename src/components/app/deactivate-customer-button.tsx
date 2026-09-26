"use client";

import { ConfirmActionForm } from "@/components/app/confirm-dialog";
import { deactivateCustomerAction } from "@/lib/customers/actions";

export function DeactivateCustomerButton({
  customerId,
  customerName,
}: {
  customerId: string;
  customerName: string;
}) {
  return (
    <ConfirmActionForm
      action={deactivateCustomerAction.bind(null, customerId)}
      label="Excluir"
      title={`Excluir "${customerName}"?`}
      description="O cliente será marcado como inativo e seus dados serão preservados."
      confirmLabel="Excluir"
      destructive
    />
  );
}
