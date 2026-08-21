import Link from "next/link";
import type { Metadata } from "next";
import { Alert } from "@/components/ui/alert";
import { AuthCard } from "@/components/shared/auth/auth-card";
import { LoginForm } from "@/components/shared/auth/login-form";

export const metadata: Metadata = {
  title: "Entrar",
};

export default function LoginPage({
  searchParams,
}: {
  searchParams?: { error?: string };
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
      <LoginForm />
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
