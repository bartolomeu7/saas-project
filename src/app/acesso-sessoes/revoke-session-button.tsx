"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { revokeOtherSessionAction } from "@/lib/auth/session-actions";

/** Encerra uma das OUTRAS sessões ativas (o servidor confere que ela pertence a esta conta). */
export function RevokeSessionButton({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <span className="flex flex-col items-end gap-1">
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const result = await revokeOtherSessionAction(sessionId);
            if (result.error) {
              setError(result.error);
              return;
            }
            toast.success(result.success ?? "Sessão encerrada.");
            router.refresh();
          })
        }
      >
        {pending ? "Encerrando..." : "Encerrar"}
      </Button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </span>
  );
}
