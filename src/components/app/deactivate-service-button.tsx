"use client";

import { deactivateServiceAction } from "@/lib/services/actions";

export function DeactivateServiceButton({
  serviceId,
  serviceName,
}: {
  serviceId: string;
  serviceName: string;
}) {
  return (
    <form
      action={deactivateServiceAction.bind(null, serviceId)}
      onSubmit={(event) => {
        const confirmed = window.confirm(
          `Tem certeza que deseja desativar "${serviceName}"? O serviço deixará de aparecer como ativo, mas seus dados serão preservados.`
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
