import type { Metadata } from "next";
import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { ACCOUNT_BLOCKED_PATH, AccountInactiveError } from "@/lib/auth/account-status";
import { getCurrentUser } from "@/lib/auth/session";
import {
  getMyConsentStatus,
  getPublishedLegalVersions,
  safeAfterConsentPath,
} from "@/lib/legal/consent";
import { acceptLegalDocumentsAction } from "@/lib/legal/actions";
import {
  SIGNUP_INTENT_COOKIE,
  intentMatchesNewUser,
  verifySignupIntent,
} from "@/lib/legal/signup-intent";
import { AuthCard } from "@/components/shared/auth/auth-card";
import { AcceptGate } from "@/components/legal/accept-gate";
import { Alert } from "@/components/ui/alert";

export const metadata: Metadata = {
  title: "Aceite dos documentos",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Aceite obrigatório dos Termos de Uso e da Política de Privacidade para quem está autenticado
 * mas não tem consentimento vigente (usuário existente, nova versão publicada ou cadastro feito
 * em outro navegador). Fica FORA do layout /app (sem loop de redirecionamento) e não bloqueia
 * nenhuma página pública. A gravação é sempre feita pelo servidor (RPC record_legal_consent).
 */
export default async function AcceptTermsPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const next = safeAfterConsentPath((await searchParams).next);

  let user;
  try {
    user = await getCurrentUser();
  } catch (error) {
    if (error instanceof AccountInactiveError) redirect(ACCOUNT_BLOCKED_PATH);
    throw error;
  }
  if (!user) redirect("/login?next=/aceite-termos");

  const status = await getMyConsentStatus();
  if (status.complete) redirect(next);

  const versions = await getPublishedLegalVersions();
  if (!versions || versions.integrity !== "OK") {
    return (
      <AuthCard title="Aceite dos documentos">
        <Alert variant="warning">
          Os documentos legais estão indisponíveis ou em atualização neste momento. Tente novamente em
          alguns minutos.
        </Alert>
      </AuthCard>
    );
  }

  // Token de cadastro válido e de usuário NOVO? Então o servidor tenta confirmar sem pedir tudo de novo.
  const clerkUser = await currentUser();
  const intent = verifySignupIntent(
    process.env.CLERK_SECRET_KEY ?? "",
    (await cookies()).get(SIGNUP_INTENT_COOKIE)?.value
  );
  const autoConfirm = Boolean(
    intent &&
      clerkUser &&
      intent.terms === versions.terms.version &&
      intent.privacy === versions.privacy.version &&
      intentMatchesNewUser(intent, clerkUser.createdAt)
  );

  return (
    <AuthCard
      title="Antes de continuar"
      description="Para usar o Prime Ges, leia e aceite a versão atual dos documentos abaixo."
    >
      <AcceptGate
        autoConfirm={autoConfirm}
        next={next}
        termsVersion={versions.terms.version}
        privacyVersion={versions.privacy.version}
        action={acceptLegalDocumentsAction}
      />
    </AuthCard>
  );
}
