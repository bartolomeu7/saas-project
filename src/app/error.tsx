"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Logo } from "@/components/shared/logo";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Error boundary do App Router para qualquer segmento sem um error.tsx
 * mais específico. Sem este arquivo, uma exceção não tratada em Server ou
 * Client Component caía no overlay padrão do Next, sem recuperação nem log.
 */
export default function ErrorBoundary({
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
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 text-center">
      <Logo iconSize={32} />
      <div className="flex flex-col gap-2">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-destructive">
          Algo deu errado
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">
          Não foi possível carregar esta página
        </h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          Tente novamente. Se o problema continuar, volte ao início.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button onClick={reset}>Tentar novamente</Button>
        <Link href="/" className={cn(buttonVariants({ variant: "outline" }))}>
          Voltar ao início
        </Link>
      </div>
    </main>
  );
}
