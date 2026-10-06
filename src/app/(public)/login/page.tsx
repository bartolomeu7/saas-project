import type { Metadata } from "next";
import { SignIn } from "@clerk/nextjs";
import { AuthCard } from "@/components/shared/auth/auth-card";
import { clerkAppearance } from "@/components/shared/auth/clerk-auth-appearance";

export const metadata: Metadata = {
  title: "Entrar",
};

/** Só aceita caminhos internos (evita open redirect via ?next=). */
function safeNextPath(next: string | undefined): string {
  if (
    !next ||
    !next.startsWith("/") ||
    next.startsWith("//") ||
    next.startsWith("/\\") ||
    next.includes(":")
  ) {
    return "/app";
  }
  return next;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const resolvedSearchParams = await searchParams;

  return (
    <AuthCard title="Entrar" description="Acesse sua conta para continuar.">
      <SignIn
        routing="hash"
        signUpUrl="/register"
        forceRedirectUrl={safeNextPath(resolvedSearchParams.next)}
        appearance={clerkAppearance}
      />
    </AuthCard>
  );
}
