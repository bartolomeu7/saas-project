"use client";

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
    <form
      action={deactivateCategoryAction.bind(null, categoryId)}
      onSubmit={(event) => {
        const message =
          serviceCount > 0
            ? `"${categoryName}" tem ${serviceCount} serviço(s) vinculado(s). Desativar a categoria não afeta os serviços, mas ela deixará de aparecer para novos cadastros. Continuar?`
            : `Desativar a categoria "${categoryName}"?`;
        const confirmed = window.confirm(message);
        if (!confirmed) {
          event.preventDefault();
        }
      }}
    >
      <button
        type="submit"
        className="text-sm font-medium text-destructive underline-offset-4 hover:underline"
      >
        Desativar
      </button>
    </form>
  );
}
