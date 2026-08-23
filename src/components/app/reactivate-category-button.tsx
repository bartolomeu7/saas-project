"use client";

import { reactivateCategoryAction } from "@/lib/product-categories/actions";

export function ReactivateCategoryButton({
  categoryId,
  categoryName,
}: {
  categoryId: string;
  categoryName: string;
}) {
  return (
    <form
      action={reactivateCategoryAction.bind(null, categoryId)}
      onSubmit={(event) => {
        const confirmed = window.confirm(`Reativar a categoria "${categoryName}"?`);
        if (!confirmed) {
          event.preventDefault();
        }
      }}
    >
      <button
        type="submit"
        className="text-sm font-medium text-success underline-offset-4 hover:underline"
      >
        Reativar
      </button>
    </form>
  );
}
