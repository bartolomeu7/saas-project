import Link from "next/link";
import type { Metadata } from "next";
import { SignUp } from "@clerk/nextjs";
import { Alert } from "@/components/ui/alert";
import { AuthCard } from "@/components/shared/auth/auth-card";
import { RegisterForm } from "@/components/shared/auth/register-form";
import { GoogleAuthButton } from "@/components/shared/auth/google-auth-button";
import { clerkAppearance } from "@/components/shared/auth/clerk-auth-appearance";
import { isClerkEnabled } from "@/lib/clerk/config";

export const metadata: Metadata = {
  title: "Criar conta",
};

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const resolvedSearchParams = await searchParams;
  // Fase 5B-APP — ver src/app/(public)/login/page.tsx.
  if (isClerkEnabled) {
    return (
      <AuthCard title="Criar conta" description="Leva menos de um minuto.">
        <SignUp routing="hash" signInUrl="/login" forceRedirectUrl="/app" appearance={clerkAppearance} />
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Criar conta"
      description="Leva menos de um minuto."
      footer={
        <>
          Já tem conta?{" "}
          <Link href="/login" className="font-medium underline underline-offset-4">
            Entrar
          </Link>
        </>
      }
    >
      {resolvedSearchParams.error === "google" && (
        <div className="mb-4">
          <Alert variant="destructive">
            Não foi possível entrar com o Google. Tente novamente ou cadastre-se
            com e-mail e senha.
          </Alert>
        </div>
      )}

      <GoogleAuthButton />

      <div className="my-4 flex items-center gap-3">
        <div className="h-px flex-1 bg-border" />
        <span className="text-xs text-muted-foreground">ou</span>
        <div className="h-px flex-1 bg-border" />
      </div>

      <RegisterForm />
    </AuthCard>
  );
}
