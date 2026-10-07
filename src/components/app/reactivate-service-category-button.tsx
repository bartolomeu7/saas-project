"use client";

import { ConfirmActionForm } from "@/components/app/confirm-dialog";
import { reactivateCategoryAction } from "@/lib/service-categories/actions";

export function ReactivateServiceCategoryButton({
  categoryId,
  categoryName,
}: {
  categoryId: string;
  categoryName: string;
}) {
  return (
    <ConfirmActionForm
      action={reactivateCategoryAction.bind(null, categoryId)}
      label="Reativar"
      title={`Reativar a categoria "${categoryName}"?`}
      description="A categoria voltará a aparecer para novos cadastros."
      confirmLabel="Reativar"
      triggerClassName="text-success"
    />
  );
}
