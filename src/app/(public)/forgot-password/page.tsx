import Link from "next/link";
import type { Metadata } from "next";
import { AuthCard } from "@/components/shared/auth/auth-card";
import { ForgotPasswordForm } from "@/components/shared/auth/forgot-password-form";

export const metadata: Metadata = {
  title: "Recuperar senha",
};

export default function ForgotPasswordPage() {
  return (
    <AuthCard
      title="Recuperar senha"
      description="Enviaremos um link para redefinir sua senha."
      footer={
        <Link href="/login" className="font-medium underline underline-offset-4">
          Voltar para o login
        </Link>
      }
    >
      <ForgotPasswordForm />
    </AuthCard>
  );
}
