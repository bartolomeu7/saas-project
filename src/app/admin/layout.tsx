import type { Metadata } from "next";
import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { AdminShell } from "@/components/admin/admin-shell";
import { requirePlatformAdmin } from "@/lib/admin/queries";
import { USER_ROLE_LABELS } from "@/types/admin";

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
  const defaultOpen = (await cookies()).get("sidebar_state")?.value !== "false";

  return (
    <AdminShell
      userName={admin.fullName}
      userEmail={admin.email}
      role={admin.role}
      roleLabel={USER_ROLE_LABELS[admin.role]}
      defaultOpen={defaultOpen}
    >
      {children}
    </AdminShell>
  );
}
