"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Fronteira de erro do /admin: mantém o shell e mostra a falha sem esconder que foi um erro. */
export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[50vh] items-center justify-center px-4 py-10">
      <div className="flex max-w-md flex-col items-center gap-3 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <AlertTriangle className="h-6 w-6" strokeWidth={1.75} />
        </span>
        <h1 className="text-xl font-semibold tracking-tight">Não foi possível carregar esta seção</h1>
        <p className="text-sm text-muted-foreground">
          A consulta administrativa falhou. Tente novamente; se continuar, o erro está registrado no servidor.
        </p>
        {error.digest && (
          <p className="text-xs text-muted-foreground">Código do erro: {error.digest}</p>
        )}
        <div className="mt-2 flex flex-wrap justify-center gap-2">
          <Button onClick={reset}>Tentar novamente</Button>
          <Link href="/admin" className={cn(buttonVariants({ variant: "outline" }))}>
            Voltar ao dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
