import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ACCOUNT_BLOCKED_PATH, AccountInactiveError } from "@/lib/auth/account-status";
import { getCurrentUser, getCurrentProfile } from "@/lib/auth/session";
import { getCurrentCompany } from "@/lib/companies/queries";
import { AppShell } from "@/components/app/app-shell";
import { requireLegalConsent } from "@/lib/legal/consent";

// Toda a área autenticada depende da sessão: nunca é pré-renderizada no build. Sem isto o Next tentava gerar
// /app/* estaticamente e, num ambiente sem credenciais (Preview), o construtor do cliente Supabase lançava
// "supabaseKey is required" no build. Em runtime, credencial ausente continua falhando alto (não é mascarada).
export const dynamic = "force-dynamic";

/**
 * Layout da área autenticada.
 *
 * A proteção de "usuário logado" acontece no middleware, antes de
 * qualquer render acontecer aqui. Este layout adiciona a segunda regra
 * de acesso: usuário autenticado mas SEM empresa ainda é redirecionado
 * para /onboarding (fora deste route group, para não cair num loop).
 */
export default async function AppLayout({
  children,
}: {
  children: ReactNode;
}) {
  let user, profile, current;
  try {
    [user, profile, current] = await Promise.all([
      getCurrentUser(),
      getCurrentProfile(),
      getCurrentCompany(),
    ]);
  } catch (error) {
    // Segunda camada (o middleware já barra): conta inativa/suspensa não vê o app.
    if (error instanceof AccountInactiveError) {
      redirect(ACCOUNT_BLOCKED_PATH);
    }
    throw error;
  }

  // Consentimento legal vigente (Termos + Política) antes de qualquer outra regra: sem ele, /aceite-termos.
  await requireLegalConsent();

  if (!current) {
    redirect("/onboarding");
  }

  const defaultOpen = (await cookies()).get("sidebar_state")?.value !== "false";

  return (
    <AppShell
      company={current.company}
      userName={profile?.full_name}
      userEmail={user?.email}
      defaultOpen={defaultOpen}
    >
      {children}
    </AppShell>
  );
}
