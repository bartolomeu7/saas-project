"use client";

import { deactivateCustomerAction } from "@/lib/customers/actions";

export function DeactivateCustomerButton({
  customerId,
  customerName,
}: {
  customerId: string;
  customerName: string;
}) {
  return (
    <form
      action={deactivateCustomerAction.bind(null, customerId)}
      onSubmit={(event) => {
        const confirmed = window.confirm(
          `Tem certeza que deseja excluir "${customerName}"? O cliente será marcado como inativo.`
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
        Excluir
      </button>
    </form>
  );
}
