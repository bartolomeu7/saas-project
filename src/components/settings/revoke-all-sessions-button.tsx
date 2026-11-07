"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, LogOut } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { revokeAllOtherSessionsAction } from "@/lib/auth/session-actions";

/** "Sair de todos os outros aparelhos": encerra as demais sessões e mantém a atual. */
export function RevokeAllSessionsButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <span className="flex flex-col items-start gap-1">
      <ConfirmDialog
        destructive
        title="Sair de todos os outros aparelhos?"
        description="Os outros aparelhos serão desconectados na hora. Este aparelho continua conectado."
        confirmLabel="Desconectar"
        onConfirm={() =>
          startTransition(async () => {
            setError(null);
            const result = await revokeAllOtherSessionsAction();
            if (result.error) {
              setError(result.error);
              return;
            }
            toast.success(result.success ?? "Aparelhos desconectados.");
            router.refresh();
          })
        }
        trigger={
          <Button type="button" variant="outline" size="sm" disabled={pending}>
            {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <LogOut aria-hidden="true" />}
            Sair de todos os outros
          </Button>
        }
      />
      {error && <span className="text-xs text-destructive">{error}</span>}
    </span>
  );
}
