"use client";

import { deactivateProductAction } from "@/lib/products/actions";

export function DeactivateProductButton({
  productId,
  productName,
}: {
  productId: string;
  productName: string;
}) {
  return (
    <form
      action={deactivateProductAction.bind(null, productId)}
      onSubmit={(event) => {
        const confirmed = window.confirm(
          `Tem certeza que deseja desativar "${productName}"? O produto deixará de aparecer como ativo, mas seus dados serão preservados.`
        );
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
