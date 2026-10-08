import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { SignUp } from "@clerk/nextjs";
import { AuthCard } from "@/components/shared/auth/auth-card";
import { clerkAppearance } from "@/components/shared/auth/clerk-auth-appearance";
import { ConsentForm } from "@/components/legal/consent-form";
import { Alert } from "@/components/ui/alert";
import { getPublishedLegalVersions } from "@/lib/legal/consent";
import { startSignupAction } from "@/lib/legal/actions";
import { SIGNUP_INTENT_COOKIE, verifySignupIntent } from "@/lib/legal/signup-intent";

export const metadata: Metadata = {
  title: "Criar conta",
};

export const dynamic = "force-dynamic";

/**
 * Cadastro em duas etapas:
 *  1. aceite dos Termos de Uso e ciência da Política de Privacidade (checkboxes separados e
 *     desmarcados, validados no servidor, que emite um cookie assinado de intenção);
 *  2. formulário de cadastro do Clerk (mantido como está), exibido SÓ com a intenção válida e
 *     das versões vigentes. Sem a etapa 1 o formulário do Clerk não é renderizado.
 * O registro definitivo do aceite é gravado pelo servidor logo após o cadastro (ver /aceite-termos).
 */
export default async function RegisterPage() {
  const versions = await getPublishedLegalVersions();

  if (!versions || versions.integrity !== "OK") {
    return (
      <AuthCard title="Criar conta" description="Leva menos de um minuto.">
        <Alert variant="warning">
          Os documentos legais estão indisponíveis ou em atualização neste momento, então o cadastro está
          temporariamente pausado. Tente novamente em alguns minutos.
        </Alert>
      </AuthCard>
    );
  }

  const intent = verifySignupIntent(
    process.env.CLERK_SECRET_KEY ?? "",
    (await cookies()).get(SIGNUP_INTENT_COOKIE)?.value
  );
  const accepted =
    intent !== null &&
    intent.terms === versions.terms.version &&
    intent.privacy === versions.privacy.version;

  if (!accepted) {
    return (
      <AuthCard
        title="Criar conta"
        description="Primeiro, leia e aceite os documentos abaixo. Leva menos de um minuto."
        footer={
          <>
            Já tem conta?{" "}
            <Link href="/login" className="font-medium text-primary underline-offset-4 hover:underline">
              Entrar
            </Link>
          </>
        }
      >
        <ConsentForm
          action={startSignupAction}
          termsVersion={versions.terms.version}
          privacyVersion={versions.privacy.version}
          submitLabel="Continuar para o cadastro"
          pendingLabel="Verificando..."
        />
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Criar conta" description="Documentos aceitos. Agora crie o seu acesso.">
      <SignUp routing="hash" signInUrl="/login" forceRedirectUrl="/app" appearance={clerkAppearance} />
    </AuthCard>
  );
}
