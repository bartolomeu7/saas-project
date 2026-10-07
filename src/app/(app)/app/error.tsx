"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Fronteira de erro dos módulos: mantém o shell (sidebar/header) e oferece nova tentativa. */
export default function AppError({
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
        <h1 className="text-xl font-semibold tracking-tight">Não foi possível carregar esta página</h1>
        <p className="text-sm text-muted-foreground">
          Ocorreu um erro inesperado. Tente novamente; se o problema continuar, volte ao painel.
        </p>
        {error.digest && (
          <p className="text-xs text-muted-foreground">Código do erro: {error.digest}</p>
        )}
        <div className="mt-2 flex flex-wrap justify-center gap-2">
          <Button onClick={reset}>Tentar novamente</Button>
          <Link href="/app" className={cn(buttonVariants({ variant: "outline" }))}>
            Voltar ao painel
          </Link>
        </div>
      </div>
    </div>
  );
}
