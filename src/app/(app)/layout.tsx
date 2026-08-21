import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getCurrentCompany } from "@/lib/companies/queries";
import { AppShell } from "@/components/app/app-shell";

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
  const user = await getCurrentUser();
  const current = await getCurrentCompany();

  if (!current) {
    redirect("/onboarding");
  }

  return (
    <AppShell company={current.company} userEmail={user?.email}>
      {children}
    </AppShell>
  );
}
