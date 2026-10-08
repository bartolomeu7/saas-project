import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { ShieldAlert } from "lucide-react";
import { Logo } from "@/components/shared/logo";
import { ACCOUNT_BLOCKED_MESSAGE } from "@/lib/auth/account-status";
import { createSessionClient } from "@/lib/supabase/server";
import { SignOutButton } from "./sign-out-button";

export const metadata: Metadata = {
  title: "Acesso indisponível",
  robots: { index: false, follow: false },
};

// Depende da sessão: nunca pode ser estática.
export const dynamic = "force-dynamic";

/**
 * Destino de quem está autenticado no Clerk mas tem profiles.status diferente de
 * `active` (inactive ou suspended). Uma única mensagem simples para os dois casos:
 * não revela papel, status interno, IDs nem detalhes administrativos.
 *
 * Não usa getCurrentUser() (que, por design, recusa contas bloqueadas): lê só o
 * próprio status pela RLS de leitura do próprio perfil. Quem está ativo (ou ainda
 * sem perfil) é devolvido ao app, então reativar uma conta desfaz o bloqueio sem
 * ninguém ficar preso aqui.
 */
export default async function AccountUnavailablePage() {
  const { userId } = await auth();
  if (!userId) {
    redirect("/login");
  }

  const supabase = await createSessionClient();
  const { data: profile } = await supabase.from("profiles").select("status").maybeSingle();

  if (!profile || profile.status === "active") {
    redirect("/app");
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 text-center">
      <div className="flex items-center gap-2 text-lg font-semibold tracking-tight">
        <Logo iconSize={28} />
      </div>
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-warning/10 text-warning">
        <ShieldAlert className="h-6 w-6" strokeWidth={1.75} aria-hidden="true" />
      </span>
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Acesso indisponível</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          {ACCOUNT_BLOCKED_MESSAGE} Se você acredita que isso é um engano, entre em contato com o
          suporte.
        </p>
      </div>
      <SignOutButton />
    </main>
  );
}
