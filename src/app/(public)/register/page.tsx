import Link from "next/link";
import type { Metadata } from "next";
import { AuthCard } from "@/components/shared/auth/auth-card";
import { RegisterForm } from "@/components/shared/auth/register-form";

export const metadata: Metadata = {
  title: "Criar conta",
};

export default function RegisterPage() {
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
      <RegisterForm />
    </AuthCard>
  );
}
