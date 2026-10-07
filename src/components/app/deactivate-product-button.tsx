"use client";

import { ConfirmActionForm } from "@/components/app/confirm-dialog";
import { deactivateProductAction } from "@/lib/products/actions";

export function DeactivateProductButton({
  productId,
  productName,
}: {
  productId: string;
  productName: string;
}) {
  return (
    <ConfirmActionForm
      action={deactivateProductAction.bind(null, productId)}
      label="Desativar"
      title={`Desativar "${productName}"?`}
      description="O produto deixará de aparecer como ativo, mas seus dados serão preservados."
      confirmLabel="Desativar"
      destructive
    />
  );
}
