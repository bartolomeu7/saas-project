import type { Metadata } from "next";
import { AuthCard } from "@/components/shared/auth/auth-card";
import { ResetPasswordForm } from "@/components/shared/auth/reset-password-form";

export const metadata: Metadata = {
  title: "Redefinir senha",
};

export default function ResetPasswordPage() {
  return (
    <AuthCard
      title="Redefinir senha"
      description="Escolha uma nova senha para sua conta."
    >
      <ResetPasswordForm />
    </AuthCard>
  );
}
