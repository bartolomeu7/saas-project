import Link from "next/link";
import type { Metadata } from "next";
import { Alert } from "@/components/ui/alert";
import { AuthCard } from "@/components/shared/auth/auth-card";
import { RegisterForm } from "@/components/shared/auth/register-form";
import { GoogleAuthButton } from "@/components/shared/auth/google-auth-button";

export const metadata: Metadata = {
  title: "Criar conta",
};

export default function RegisterPage({
  searchParams,
}: {
  searchParams?: { error?: string };
}) {
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
      {searchParams?.error === "google" && (
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
