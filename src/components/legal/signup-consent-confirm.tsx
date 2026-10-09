"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { confirmSignupConsentAction } from "@/lib/legal/actions";

/**
 * Logo depois do cadastro: troca o token assinado pelo registro definitivo do aceite. Se o
 * servidor recusar (token ausente, expirado ou de outro usuário), `onFallback` mostra o aceite
 * explícito. A decisão é sempre do servidor; este componente só dispara a action uma vez.
 */
export function SignupConsentConfirm({ next, onFallback }: { next: string; onFallback: () => void }) {
  const started = useRef(false);
  const [, startTransition] = useTransition();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    startTransition(async () => {
      const result = await confirmSignupConsentAction(next);
      // Em sucesso a action redireciona e nada volta; só chegamos aqui em caso de recusa.
      if (result?.error) {
        setFailed(true);
        onFallback();
      }
    });
  }, [next, onFallback]);

  if (failed) return null;

  return (
    <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      Registrando o seu aceite dos documentos…
    </p>
  );
}
