"use client";

import { ConfirmActionForm } from "@/components/app/confirm-dialog";
import { deactivateCategoryAction } from "@/lib/service-categories/actions";

export function DeactivateServiceCategoryButton({
  categoryId,
  categoryName,
  serviceCount,
}: {
  categoryId: string;
  categoryName: string;
  serviceCount: number;
}) {
  return (
    <ConfirmActionForm
      action={deactivateCategoryAction.bind(null, categoryId)}
      label="Desativar"
      title={`Desativar a categoria "${categoryName}"?`}
      description={
        serviceCount > 0
          ? `Esta categoria tem ${serviceCount} serviço vinculado(s). Desativar a categoria não afeta os serviços, mas ela deixará de aparecer para novos cadastros.`
          : "A categoria deixará de aparecer para novos cadastros."
      }
      confirmLabel="Desativar"
      destructive
    />
  );
}
