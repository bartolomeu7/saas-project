"use client";

import { ConfirmActionForm } from "@/components/app/confirm-dialog";
import { reactivateProductAction } from "@/lib/products/actions";

export function ReactivateProductButton({
  productId,
  productName,
}: {
  productId: string;
  productName: string;
}) {
  return (
    <ConfirmActionForm
      action={reactivateProductAction.bind(null, productId)}
      label="Reativar"
      title={`Reativar "${productName}"?`}
      description="O produto voltará a aparecer como ativo."
      confirmLabel="Reativar"
      triggerClassName="text-success"
    />
  );
}
