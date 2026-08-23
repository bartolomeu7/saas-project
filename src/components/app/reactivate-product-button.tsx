"use client";

import { reactivateProductAction } from "@/lib/products/actions";

export function ReactivateProductButton({
  productId,
  productName,
}: {
  productId: string;
  productName: string;
}) {
  return (
    <form
      action={reactivateProductAction.bind(null, productId)}
      onSubmit={(event) => {
        const confirmed = window.confirm(`Reativar "${productName}"?`);
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
