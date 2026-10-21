import type { Metadata } from "next";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Conta excluída",
  robots: { index: false },
};

/** Página pública de despedida: não recebe nem mostra dado pessoal. `e=1` = e-mail de confirmação enviado. */
export default async function AccountDeletedPage({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const { e } = await searchParams;
  const emailSent = e === "1";

  return (
    <main id="conteudo" className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-4 px-4 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">Sua conta foi excluída</h1>
      <p className="text-sm text-muted-foreground">
        Eliminamos os seus dados pessoais e os dados das empresas que só você usava. Mantemos apenas o que a lei obriga, sem identificar você: o registro do
        aceite dos Termos e, se houve pagamento, os dados da cobrança, por até 5 anos.
      </p>
      <p className="text-sm text-muted-foreground">
        {emailSent
          ? "Enviamos um e-mail de confirmação para o endereço que estava na conta."
          : "Não enviamos e-mail de confirmação. Guarde esta página como comprovante."}
      </p>
      <p className="text-sm text-muted-foreground">
        Se você pagou um plano e quer desistir em até 7 dias, o estorno é feito em 10 a 15 dias úteis depois do pedido. Veja a{" "}
        <Link href="/politica-de-reembolso" className="font-medium text-primary underline-offset-4 hover:underline">
          Política de Reembolso
        </Link>
        .
      </p>
      <Link href="/" className={cn(buttonVariants({ variant: "outline" }), "mt-2 w-fit")}>
        Voltar ao início
      </Link>
    </main>
  );
}
