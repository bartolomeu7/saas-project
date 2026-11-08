import type { CompanyRole } from "@/types/company";

export interface SettingsNavItem {
  href: string;
  label: string;
}

/** Quem pode editar nome e segmento da empresa (o banco confere o mesmo papel em update_own_company). */
export function canEditCompany(role: CompanyRole): boolean {
  return role === "owner" || role === "admin";
}

/** Abas de Configurações na área da empresa. "Empresa" só aparece para proprietário e administrador. */
export function appSettingsNav(role: CompanyRole): SettingsNavItem[] {
  return [
    { href: "/app/configuracoes", label: "Visão geral" },
    { href: "/app/configuracoes/perfil", label: "Perfil" },
    { href: "/app/configuracoes/seguranca", label: "Segurança" },
    { href: "/app/configuracoes/aparencia", label: "Aparência" },
    { href: "/app/configuracoes/aplicativo", label: "Aplicativo" },
    ...(canEditCompany(role) ? [{ href: "/app/configuracoes/empresa", label: "Empresa" }] : []),
  ];
}
