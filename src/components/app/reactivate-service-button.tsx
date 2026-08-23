"use client";

import { reactivateServiceAction } from "@/lib/services/actions";

export function ReactivateServiceButton({
  serviceId,
  serviceName,
}: {
  serviceId: string;
  serviceName: string;
}) {
  return (
    <form
      action={reactivateServiceAction.bind(null, serviceId)}
      onSubmit={(event) => {
        const confirmed = window.confirm(`Reativar "${serviceName}"?`);
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
