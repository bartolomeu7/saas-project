"use client";

import { ConfirmActionForm } from "@/components/app/confirm-dialog";
import { deactivateCategoryAction } from "@/lib/product-categories/actions";

export function DeactivateCategoryButton({
  categoryId,
  categoryName,
  productCount,
}: {
  categoryId: string;
  categoryName: string;
  productCount: number;
}) {
  return (
    <ConfirmActionForm
      action={deactivateCategoryAction.bind(null, categoryId)}
      label="Desativar"
      title={`Desativar a categoria "${categoryName}"?`}
      description={
        productCount > 0
          ? `Esta categoria tem ${productCount} produto vinculado(s). Desativar a categoria não afeta os produtos, mas ela deixará de aparecer para novos cadastros.`
          : "A categoria deixará de aparecer para novos cadastros."
      }
      confirmLabel="Desativar"
      destructive
    />
  );
}
