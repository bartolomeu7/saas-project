import type { LucideIcon } from "lucide-react";
import type { UserRole } from "@/types/profile";
import {
  Building2,
  Construction,
  CreditCard,
  LayoutDashboard,
  Layers,
  LifeBuoy,
  Plug,
  ReceiptText,
  ScrollText,
  Settings,
  ShieldCheck,
  Users,
  Wrench,
} from "lucide-react";

export interface AdminNavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /**
   * Só super_admin vê o item. Apenas UX: a rota é barrada no middleware, na
   * página (requireSuperAdmin) e no banco (is_super_admin()).
   */
  superAdminOnly?: boolean;
}

export interface AdminNavGroup {
  label?: string;
  items: AdminNavItem[];
}

/**
 * Menu do painel da PLATAFORMA. Mesma estrutura de grupos do menu da empresa
 * (src/components/app/nav-items.ts), porém global: nada aqui depende de
 * company_id. Todo item do menu aponta para uma página funcional.
 */
export const ADMIN_NAV_GROUPS: AdminNavGroup[] = [
  {
    label: "Visão geral",
    items: [
      { label: "Dashboard", href: "/admin", icon: LayoutDashboard },
      { label: "Suporte", href: "/admin/support", icon: LifeBuoy },
    ],
  },
  {
    label: "Clientes",
    items: [
      { label: "Empresas", href: "/admin/companies", icon: Building2 },
      { label: "Usuários", href: "/admin/users", icon: Users },
    ],
  },
  {
    label: "Financeiro",
    items: [
      { label: "Pagamentos", href: "/admin/payments", icon: ReceiptText },
      { label: "Assinaturas", href: "/admin/subscriptions", icon: CreditCard },
      { label: "Planos", href: "/admin/plans", icon: Layers },
    ],
  },
  {
    label: "Operação",
    items: [
      { label: "Manutenção", href: "/admin/maintenance", icon: Construction, superAdminOnly: true },
      { label: "Integrações", href: "/admin/integrations", icon: Plug },
      { label: "Ferramentas", href: "/admin/tools", icon: Wrench },
      { label: "Auditoria", href: "/admin/audit", icon: ScrollText },
    ],
  },
  {
    label: "Acesso",
    items: [
      { label: "Administradores", href: "/admin/administrators", icon: ShieldCheck, superAdminOnly: true },
      { label: "Configurações", href: "/admin/settings", icon: Settings, superAdminOnly: true },
    ],
  },
];

/** Esconde o que o papel não pode usar (UX). A autorização real é do middleware, das páginas e do banco. */
export function visibleAdminNavGroups(role: UserRole): AdminNavGroup[] {
  return ADMIN_NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => !item.superAdminOnly || role === "super_admin"),
  })).filter((group) => group.items.length > 0);
}

/** Rótulo de cada rota, usado pelo breadcrumb do header. */
export const ADMIN_ROUTE_LABELS: Record<string, string> = {
  ...Object.fromEntries(ADMIN_NAV_GROUPS.flatMap((group) => group.items.map((item) => [item.href, item.label]))),
  // Fora do menu lateral (abre pelo menu do usuário).
  "/admin/account": "Minha conta",
};
