import type { LucideIcon } from "lucide-react";
import { LayoutDashboard, Users, Package, Wrench, ShoppingCart, ClipboardList, Warehouse, Wallet, LineChart, FileText, Settings, CreditCard, Gift, CalendarDays, UserCog } from "lucide-react";

export interface NavItem { label: string; href: string; icon: LucideIcon; enabled: boolean; }
export interface NavGroup { label?: string; items: NavItem[]; }

export const NAV_GROUPS: NavGroup[] = [
  { items: [{ label: "Dashboard", href: "/app", icon: LayoutDashboard, enabled: true }] },
  { label: "Gestão", items: [
    { label: "Clientes", href: "/app/clientes", icon: Users, enabled: true },
    { label: "Produtos", href: "/app/produtos", icon: Package, enabled: true },
    { label: "Serviços", href: "/app/servicos", icon: Wrench, enabled: true },
    { label: "Vendas", href: "/app/vendas", icon: ShoppingCart, enabled: true },
    { label: "Fidelidade", href: "/app/fidelidade", icon: Gift, enabled: true },
  ]},
  { label: "Operação", items: [
    { label: "Estoque", href: "/app/estoque", icon: Warehouse, enabled: true },
    { label: "Compras", href: "/app/compras", icon: ClipboardList, enabled: true },
    { label: "Caixa", href: "/app/caixa", icon: Wallet, enabled: true },
    { label: "Fornecedores", href: "/app/fornecedores", icon: Users, enabled: true },
    { label: "Agenda", href: "/app/agenda", icon: CalendarDays, enabled: true },
  ]},
  { label: "Análises", items: [
    { label: "Financeiro", href: "/app/financeiro", icon: LineChart, enabled: true },
    { label: "Relatórios", href: "/app/relatorios", icon: FileText, enabled: true },
  ]},
  { label: "Empresa", items: [
    { label: "Equipe", href: "/app/equipe", icon: UserCog, enabled: true },
    { label: "Assinatura", href: "/app/assinatura", icon: CreditCard, enabled: true },
    { label: "Configurações", href: "/app/configuracoes", icon: Settings, enabled: true },
  ]},
];
