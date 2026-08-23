"use client";

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
    <form
      action={deactivateCategoryAction.bind(null, categoryId)}
      onSubmit={(event) => {
        const message =
          productCount > 0
            ? `"${categoryName}" tem ${productCount} produto(s) vinculado(s). Desativar a categoria não afeta os produtos, mas ela deixará de aparecer para novos cadastros. Continuar?`
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
