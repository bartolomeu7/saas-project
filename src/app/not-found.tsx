import Link from "next/link";
import { Logo } from "@/components/shared/logo";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 text-center">
      <Logo iconSize={32} />
      <div className="flex flex-col gap-2">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-primary">Erro 404</p>
        <h1 className="text-3xl font-semibold tracking-tight">Página não encontrada</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          O endereço acessado não existe ou foi movido.
        </p>
      </div>
      <Link href="/" className={cn(buttonVariants())}>
        Voltar ao início
      </Link>
    </main>
  );
}
