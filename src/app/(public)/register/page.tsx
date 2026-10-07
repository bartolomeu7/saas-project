import type { Metadata } from "next";
import { SignUp } from "@clerk/nextjs";
import { AuthCard } from "@/components/shared/auth/auth-card";
import { clerkAppearance } from "@/components/shared/auth/clerk-auth-appearance";

export const metadata: Metadata = {
  title: "Criar conta",
};

export default function RegisterPage() {
  return (
    <AuthCard title="Criar conta" description="Leva menos de um minuto.">
      <SignUp routing="hash" signInUrl="/login" forceRedirectUrl="/app" appearance={clerkAppearance} />
    </AuthCard>
  );
}
