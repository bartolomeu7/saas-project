import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Users,
  Package,
  Wrench,
  ShoppingCart,
  Warehouse,
  Wallet,
  LineChart,
  FileText,
  Settings,
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  enabled: boolean;
}

export interface NavGroup {
  /** Grupos sem título (Dashboard, Configurações) usam label undefined. */
  label?: string;
  items: NavItem[];
}

/**
 * Menu principal da área autenticada, agrupado por área do negócio.
 * Dashboard, Clientes, Produtos e Serviços estão funcionais nesta etapa
 * — os demais aparecem desabilitados ("Em breve") para deixar claro o
 * roadmap sem prometer funcionalidade que não existe.
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    items: [{ label: "Dashboard", href: "/app", icon: LayoutDashboard, enabled: true }],
  },
  {
    label: "Gestão",
    items: [
      { label: "Clientes", href: "/app/clientes", icon: Users, enabled: true },
      { label: "Produtos", href: "/app/produtos", icon: Package, enabled: true },
      { label: "Serviços", href: "/app/servicos", icon: Wrench, enabled: true },
      { label: "Vendas", href: "/app/vendas", icon: ShoppingCart, enabled: false },
    ],
  },
  {
    label: "Operação",
    items: [
      { label: "Estoque", href: "/app/estoque", icon: Warehouse, enabled: false },
      { label: "Caixa", href: "/app/caixa", icon: Wallet, enabled: false },
    ],
  },
  {
    label: "Análises",
    items: [
      { label: "Financeiro", href: "/app/financeiro", icon: LineChart, enabled: false },
      { label: "Relatórios", href: "/app/relatorios", icon: FileText, enabled: false },
    ],
  },
  {
    items: [
      {
        label: "Configurações",
        href: "/app/configuracoes",
        icon: Settings,
        enabled: false,
      },
    ],
  },
];
