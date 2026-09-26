"use client";

import { ConfirmActionForm } from "@/components/app/confirm-dialog";
import { reactivateCustomerAction } from "@/lib/customers/actions";

export function ReactivateCustomerButton({
  customerId,
  customerName,
}: {
  customerId: string;
  customerName: string;
}) {
  return (
    <ConfirmActionForm
      action={reactivateCustomerAction.bind(null, customerId)}
      label="Reativar"
      title={`Reativar "${customerName}"?`}
      description="O cliente voltará a aparecer como ativo."
      confirmLabel="Reativar"
      triggerClassName="text-success"
    />
  );
}
