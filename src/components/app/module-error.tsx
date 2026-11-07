"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Fronteira de erro de um módulo (usada pelos `error.tsx` de cada módulo em /app).
 * O shell (menu/cabeçalho) continua de pé; o erro fica isolado no módulo, com texto
 * em português, nova tentativa e retorno ao próprio módulo. O `digest` identifica o
 * erro nos logs do servidor sem expor detalhes técnicos ao cliente.
 */
export function ModuleError({
  error,
  reset,
  moduleName,
  moduleHref,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  moduleName: string;
  moduleHref: string;
}) {
  useEffect(() => {
    console.error(`[${moduleName}]`, error);
  }, [error, moduleName]);

  return (
    <div role="alert" className="flex min-h-[50vh] items-center justify-center px-4 py-10">
      <div className="flex max-w-md flex-col items-center gap-3 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <AlertTriangle className="h-6 w-6" strokeWidth={1.75} aria-hidden="true" />
        </span>
        <h1 className="text-xl font-semibold tracking-tight">
          Não foi possível carregar {moduleName}
        </h1>
        <p className="text-sm text-muted-foreground">
          Algo deu errado só nesta tela. O restante do sistema continua funcionando. Tente de novo;
          se persistir, volte ao painel e avise o suporte informando o código abaixo.
        </p>
        {error.digest && (
          <p className="text-xs text-muted-foreground">Código do erro: {error.digest}</p>
        )}
        <div className="mt-2 flex flex-wrap justify-center gap-2">
          <Button onClick={reset}>Tentar novamente</Button>
          <Link href={moduleHref} className={cn(buttonVariants({ variant: "outline" }))}>
            Recarregar {moduleName}
          </Link>
          <Link href="/app" className={cn(buttonVariants({ variant: "ghost" }))}>
            Voltar ao painel
          </Link>
        </div>
      </div>
    </div>
  );
}
