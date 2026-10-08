"use client";

import { toast } from "sonner";
import { ConfirmActionForm } from "@/components/app/confirm-dialog";
import { markExpiredSubscriptionsAction } from "@/lib/admin/actions";

/** Ações rápidas seguras e idempotentes. Cada uma é uma RPC que revalida o ator e audita. */
export function ToolsQuickActions({ staleCount }: { staleCount: number }) {
  return (
    <div className="flex flex-col gap-3 text-sm">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div>
          <p className="font-medium text-foreground">Marcar assinaturas vencidas como expiradas</p>
          <p className="text-xs text-muted-foreground">
            {staleCount} assinatura(s) com data vencida ainda marcada(s) como ativa(s). O acesso já está bloqueado pela
            data; isto só corrige o status exibido.
          </p>
        </div>
        <ConfirmActionForm
          action={async () => {
            const result = await markExpiredSubscriptionsAction();
            if (result.error) toast.error("Não foi possível concluir", { description: result.error });
            else if (result.success) toast.success(result.success);
          }}
          label="Executar"
          title="Marcar assinaturas vencidas como expiradas?"
          description="Atualiza o status de assinaturas ativas/em teste cujo vencimento já passou. Operação segura e repetível; fica registrada na auditoria."
          confirmLabel="Executar"
          triggerClassName="shrink-0"
        />
      </div>
    </div>
  );
}
