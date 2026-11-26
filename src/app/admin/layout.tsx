import type { Metadata } from "next";
import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { AdminShell } from "@/components/admin/admin-shell";
import { ClerkAppProvider } from "@/components/clerk/clerk-app-provider";
import { ThemeSync } from "@/components/settings/theme-sync";
import { THEME_INIT_SCRIPT } from "@/lib/settings/theme";
import { redirect } from "next/navigation";
import { listPlatformTickets, requirePlatformAdmin } from "@/lib/admin/queries";
import { evaluateSessionGate, SESSION_LIMIT_PATH } from "@/lib/auth/session-gate";
import { USER_ROLE_LABELS } from "@/types/admin";
import "./admin.css";

// Todo o painel depende da sessão do usuário: nunca pode ser pré-renderizado
// nem servido de cache estático.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: "Admin", template: "%s · Admin · Prime Ges" },
  robots: { index: false, follow: false },
};

/**
 * Layout do painel da PLATAFORMA (/admin).
 *
 * Autenticação é do Clerk (login/retorno via middleware, que envia quem não
 * tem sessão para /login?next=/admin). Autorização é de plataforma: a decisão
 * vem de is_platform_admin() no banco (profiles.role admin|super_admin com
 * status active) — nunca de company_members.role. Seções exclusivas de
 * super_admin se protegem em cada página com requireSuperAdmin(). Este layout
 * NÃO exige empresa: o admin é global e não passa por /onboarding.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const admin = await requirePlatformAdmin();
  // Mesmo limite de sessões simultâneas da conta (administradores não são exceção).
  const user = { id: admin.userId };
  const [gate, openTickets] = await Promise.all([
    evaluateSessionGate(user.id),
    // Só o contador do menu: se falhar, o painel abre sem ele.
    listPlatformTickets("open").then((result) => result.total).catch(() => 0),
  ]);
  if (gate === "blocked") redirect(SESSION_LIMIT_PATH);
  // sessão ainda não validada (Clerk/serviço indisponível): negada só a esta sessão, de forma temporária
  if (gate === "unverified") redirect(`${SESSION_LIMIT_PATH}?motivo=verificacao`);
  const defaultOpen = (await cookies()).get("sidebar_state")?.value !== "false";

  return (
    <ClerkAppProvider>
      {/* Tema escolhido em Configurações → Aparência: aplicado antes da primeira pintura (sem piscar) e mantido em dia. */}
      <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      <ThemeSync />
      <AdminShell
        userName={admin.fullName}
        userEmail={admin.email}
        role={admin.role}
        roleLabel={USER_ROLE_LABELS[admin.role]}
        defaultOpen={defaultOpen}
        badges={{ "/admin/support": openTickets }}
      >
        {children}
      </AdminShell>
    </ClerkAppProvider>
  );
}
