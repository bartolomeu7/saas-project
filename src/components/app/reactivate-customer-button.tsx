"use client";

import { reactivateCustomerAction } from "@/lib/customers/actions";

export function ReactivateCustomerButton({
  customerId,
  customerName,
}: {
  customerId: string;
  customerName: string;
}) {
  return (
    <form
      action={reactivateCustomerAction.bind(null, customerId)}
      onSubmit={(event) => {
        const confirmed = window.confirm(
          `Reativar "${customerName}"? O cliente voltará a aparecer como ativo.`
        );
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
