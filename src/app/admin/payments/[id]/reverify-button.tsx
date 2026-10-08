"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { reverifyPaymentAction } from "@/lib/admin/actions";

/** Consulta o status do pagamento direto na EvoPay (server-to-server) e atualiza se mudou. */
export function ReverifyPaymentButton({ paymentId }: { paymentId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await reverifyPaymentAction(paymentId);
          if (result.error) toast.error("Não foi possível reverificar", { description: result.error });
          else if (result.success) toast.success(result.success);
          router.refresh();
        })
      }
    >
      {pending ? "Consultando a EvoPay..." : "Reverificar na EvoPay"}
    </Button>
  );
}
