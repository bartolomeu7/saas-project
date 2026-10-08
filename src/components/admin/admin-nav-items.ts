import type { LucideIcon } from "lucide-react";
import {
  Building2,
  CreditCard,
  LayoutDashboard,
  Layers,
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
    items: [{ label: "Dashboard", href: "/admin", icon: LayoutDashboard }],
  },
  {
    label: "Gestão",
    items: [
      { label: "Usuários", href: "/admin/users", icon: Users },
      { label: "Empresas", href: "/admin/companies", icon: Building2 },
      { label: "Planos", href: "/admin/plans", icon: Layers },
    ],
  },
  {
    label: "Financeiro",
    items: [
      { label: "Assinaturas", href: "/admin/subscriptions", icon: CreditCard },
      { label: "Pagamentos", href: "/admin/payments", icon: ReceiptText },
    ],
  },
  {
    label: "Sistema",
    items: [
      { label: "Auditoria", href: "/admin/audit", icon: ScrollText },
      { label: "Ferramentas", href: "/admin/tools", icon: Wrench },
      { label: "Integrações", href: "/admin/integrations", icon: Plug },
      { label: "Administradores", href: "/admin/administrators", icon: ShieldCheck, superAdminOnly: true },
      { label: "Configurações", href: "/admin/settings", icon: Settings, superAdminOnly: true },
    ],
  },
];

/** Rótulo de cada rota, usado pelo breadcrumb do header. */
export const ADMIN_ROUTE_LABELS: Record<string, string> = Object.fromEntries(
  ADMIN_NAV_GROUPS.flatMap((group) => group.items.map((item) => [item.href, item.label]))
);
