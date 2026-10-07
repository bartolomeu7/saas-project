"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import { Alert } from "@/components/ui/alert";
import type { ActionResult } from "@/lib/auth/actions";

/**
 * Mensagem inline do resultado de uma Server Action + toast (Sonner).
 * Cada novo `state` devolvido pela ação dispara um toast de sucesso ou de
 * erro; o Alert inline permanece junto do formulário para não perder a
 * mensagem de erro caso o toast já tenha sumido.
 */
export function FormMessage({ state }: { state: ActionResult }) {
  useEffect(() => {
    if (state.error) {
      toast.error("Não foi possível concluir", { description: state.error });
    } else if (state.success) {
      toast.success(state.success);
    }
  }, [state]);

  if (state.error) {
    return <Alert variant="destructive">{state.error}</Alert>;
  }

  if (state.success) {
    return <Alert variant="success">{state.success}</Alert>;
  }

  return null;
}
