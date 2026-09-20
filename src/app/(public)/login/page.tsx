import Link from "next/link";
import type { Metadata } from "next";
import { Alert } from "@/components/ui/alert";
import { AuthCard } from "@/components/shared/auth/auth-card";
import { LoginForm } from "@/components/shared/auth/login-form";
import { GoogleAuthButton } from "@/components/shared/auth/google-auth-button";

export const metadata: Metadata = {
  title: "Entrar",
};

export default function LoginPage({
  searchParams,
}: {
  searchParams?: { error?: string; next?: string };
}) {
  return (
    <AuthCard
      title="Entrar"
      description="Acesse sua conta para continuar."
      footer={
        <>
          Ainda não tem conta?{" "}
          <Link href="/register" className="font-medium underline underline-offset-4">
            Criar conta
          </Link>
        </>
      }
    >
      {searchParams?.error === "auth_callback_failed" && (
        <div className="mb-4">
          <Alert variant="destructive">
            Link inválido ou expirado. Tente novamente.
          </Alert>
        </div>
      )}
      {searchParams?.error === "google" && (
        <div className="mb-4">
          <Alert variant="destructive">
            Não foi possível entrar com o Google. Tente novamente ou use
            e-mail e senha.
          </Alert>
        </div>
      )}

      <GoogleAuthButton next={searchParams?.next} />

      <div className="my-4 flex items-center gap-3">
        <div className="h-px flex-1 bg-border" />
        <span className="text-xs text-muted-foreground">ou</span>
        <div className="h-px flex-1 bg-border" />
      </div>

      <LoginForm next={searchParams?.next} />
      <div className="mt-4 text-center">
        <Link
          href="/forgot-password"
          className="text-sm text-muted-foreground underline underline-offset-4"
        >
          Esqueci minha senha
        </Link>
      </div>
    </AuthCard>
  );
}
