import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { Logo } from "@/components/shared/logo";
import { SignOutButton } from "@/app/acesso-indisponivel/sign-out-button";
import { TwoFactorVerifyForm } from "@/components/settings/two-factor-verify-form";
import { getCurrentUser } from "@/lib/auth/session";
import { safeAfterTwoFactorPath } from "@/lib/security/two-factor/gate";
import { readGateForPage } from "@/lib/security/two-factor/service";

export const metadata: Metadata = {
  title: "Verificação em duas etapas",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Segunda etapa do login. Quem não tem a verificação ativa, ou já a cumpriu nesta sessão, é devolvido ao destino (nunca
 * fica preso aqui). O middleware exige login para esta rota e a deixa fora da barreira da segunda etapa, que é onde o
 * código é digitado.
 */
export default async function TwoFactorVerifyPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const destination = safeAfterTwoFactorPath(typeof next === "string" ? next : null);

  const { userId: clerkUserId, sessionId } = await auth();
  if (!clerkUserId || !sessionId) redirect("/login");
  const user = await getCurrentUser().catch(() => null);
  if (!user) redirect("/login");

  const gate = await readGateForPage(user.id, sessionId);
  if (!gate.required || gate.verified) redirect(destination);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-6 px-6 py-10 text-center">
      <div className="flex items-center gap-2 text-lg font-semibold tracking-tight">
        <Logo iconSize={28} />
      </div>
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary-text">
        <ShieldCheck className="h-6 w-6" strokeWidth={1.75} aria-hidden="true" />
      </span>
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Verificação em duas etapas</h1>
        <p className="text-sm text-muted-foreground">
          Digite o código de 6 números do seu aplicativo autenticador (Google Authenticator). Se perdeu o celular, use um código de backup.
        </p>
      </div>
      <TwoFactorVerifyForm next={destination} />
      <SignOutButton />
    </main>
  );
}
