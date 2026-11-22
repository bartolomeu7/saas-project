"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ConfirmActionForm } from "@/components/app/confirm-dialog";
import { reconcilePendingPaymentsAction } from "@/lib/admin/actions";

/**
 * Rede de segurança dos webhooks (SyncPay e MisticPay): reconsulta no provedor as cobranças pendentes há mais de 10 minutos (no máximo
 * 4 consultas por pagamento). A confirmação segue o mesmo caminho do "Já paguei".
 */
export function ReconcileButton() {
  const router = useRouter();

  return (
    <ConfirmActionForm
      action={async () => {
        const result = await reconcilePendingPaymentsAction();
        if (result.error) {
          toast.error("Não foi possível reconciliar", { description: result.error });
        } else if (result.success) {
          toast.success(result.success);
        }
        router.refresh();
      }}
      label="Reconciliar pendentes"
      title="Reconciliar cobranças pendentes?"
      description="Consulta o gateway de cada cobrança pendente há mais de 10 minutos (até 15 por vez) e confirma as que já foram pagas. Seguro e repetível."
      confirmLabel="Reconciliar"
    />
  );
}
