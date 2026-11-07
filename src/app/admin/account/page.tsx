import Link from "next/link";
import { ArrowRight, ClipboardList, Settings, ShieldCheck, type LucideIcon } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { AppearanceSection, ProfileSections, SecuritySections } from "@/components/settings/account-sections";
import { SettingsSection } from "@/components/settings/settings-section";
import { Badge } from "@/components/ui/badge";
import { requirePlatformAdmin } from "@/lib/admin/queries";
import { USER_ROLE_LABELS } from "@/types/admin";

export const metadata = { title: "Minha conta" };

interface Shortcut {
  label: string;
  description: string;
  href: string;
  icon: LucideIcon;
  superAdminOnly?: boolean;
}

const SHORTCUTS: Shortcut[] = [
  { label: "Auditoria", description: "Registro das ações administrativas.", href: "/admin/audit", icon: ClipboardList },
  { label: "Administradores", description: "Quem administra a plataforma.", href: "/admin/administrators", icon: ShieldCheck, superAdminOnly: true },
  { label: "Configurações da plataforma", description: "Parâmetros com efeito real.", href: "/admin/settings", icon: Settings, superAdminOnly: true },
];

/**
 * Conta da pessoa que administra a plataforma: papel, perfil, segurança e aparência. Qualquer administrador ativo chega
 * aqui (o painel já exige is_platform_admin()); os atalhos de super administrador só aparecem para ele. A página mexe
 * apenas na PRÓPRIA conta — o papel não é editável aqui.
 */
export default async function AdminAccountPage() {
  const admin = await requirePlatformAdmin();
  const shortcuts = SHORTCUTS.filter((item) => !item.superAdminOnly || admin.role === "super_admin");

  return (
    <div className="flex flex-col gap-6 px-4 py-6 sm:px-6">
      <PageHeader
        eyebrow="Painel"
        title="Minha conta"
        description="Seu perfil de administrador, a segurança do login e a aparência do painel."
      />

      <div className="flex max-w-3xl flex-col gap-6">
        <SettingsSection
          id="papel"
          title="Seu acesso"
          description="O papel é definido por um super administrador e não pode ser alterado aqui."
          badge={<Badge variant="info">{USER_ROLE_LABELS[admin.role]}</Badge>}
        >
          <dl className="grid gap-3 text-sm sm:grid-cols-2 [&>div]:rounded-lg [&>div]:border [&>div]:border-border [&>div]:bg-background/40 [&>div]:p-3">
            <div>
              <dt className="text-muted-foreground">Nome</dt>
              <dd className="font-medium text-foreground">{admin.fullName ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">E-mail</dt>
              <dd className="break-all font-medium text-foreground">{admin.email ?? "—"}</dd>
            </div>
          </dl>
          <ul className="grid gap-3 sm:grid-cols-2">
            {shortcuts.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="group flex h-full items-start gap-3 rounded-xl border border-border bg-card/60 p-4 outline-none transition-colors hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary-text">
                    <item.icon className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium text-foreground">{item.label}</span>
                    <span className="mt-0.5 block text-sm text-muted-foreground">{item.description}</span>
                  </span>
                  <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        </SettingsSection>

        <ProfileSections />
        <SecuritySections />
        <AppearanceSection />
      </div>
    </div>
  );
}
