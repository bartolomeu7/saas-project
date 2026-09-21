/**
 * Conteúdo da landing page pública (rota "/").
 *
 * Centralizado aqui para que textos, segmentos e — principalmente —
 * preços possam ser ajustados sem mexer nos componentes. Nenhum dado
 * aqui é lido do banco: é conteúdo de marketing estático.
 */
import type { LucideIcon } from "lucide-react";
import {
  Users,
  Package,
  Wrench,
  ShoppingCart,
  Warehouse,
  LineChart,
  Croissant,
  ShoppingBasket,
  UtensilsCrossed,
  Sandwich,
  Car,
  Sparkles,
  LayoutDashboard,
  Smartphone,
  FolderKanban,
  Gauge,
  Gift,
  Banknote,
} from "lucide-react";

export const NAV_LINKS = [
  { label: "Início", href: "#topo" },
  { label: "Recursos", href: "#recursos" },
  { label: "Para quem é", href: "#segmentos" },
  { label: "Preços", href: "#precos" },
] as const;

export interface Segment {
  name: string;
  description: string;
  icon: LucideIcon;
}

/** Máximo 6, conforme definido para a home — não é a lista completa de business_type. */
export const SEGMENTS: Segment[] = [
  { name: "Padarias", description: "Tenha controle sobre vendas, produtos e operação.", icon: Croissant },
  { name: "Mercadinhos", description: "Organize produtos, vendas, estoque e caixa.", icon: ShoppingBasket },
  { name: "Restaurantes", description: "Controle pedidos, clientes e operação do seu negócio.", icon: UtensilsCrossed },
  { name: "Lanchonetes", description: "Organize atendimentos, vendas e clientes no dia a dia.", icon: Sandwich },
  { name: "Lava-rápidos", description: "Organize clientes, veículos, serviços e atendimentos.", icon: Car },
  { name: "Estética automotiva", description: "Acompanhe clientes, serviços e agenda em um só lugar.", icon: Sparkles },
];

export interface FeatureModule {
  name: string;
  description: string;
  icon: LucideIcon;
  available: boolean;
}

/** Espelha os módulos reais do produto — "available" decide o badge "Em breve". */
export const FEATURES: FeatureModule[] = [
  { name: "Clientes", description: "Cadastre, busque e acompanhe clientes, com documentos, ranking e sorteio.", icon: Users, available: true },
  { name: "Produtos", description: "Cadastre produtos, categorias e preços.", icon: Package, available: true },
  { name: "Serviços", description: "Cadastre serviços e categorias oferecidos.", icon: Wrench, available: true },
  { name: "Vendas", description: "Registre vendas com itens, pagamentos, descontos e cancelamento.", icon: ShoppingCart, available: true },
  { name: "Fidelidade", description: "Configure níveis, campanhas, multiplicadores e resgate de pontos.", icon: Gift, available: true },
  { name: "Caixa", description: "Abra e feche o caixa do turno, lance sangria ou suprimento e confira o saldo no fechamento.", icon: Banknote, available: true },
  { name: "Estoque", description: "Controle de entrada, saída e reposição — em breve.", icon: Warehouse, available: false },
  { name: "Financeiro", description: "Visão de entradas, saídas e resultados além do caixa do dia — em breve.", icon: LineChart, available: false },
];

export interface TrustItem {
  label: string;
}

export const TRUST_ITEMS: TrustItem[] = [
  { label: "Fácil de usar" },
  { label: "Funciona na nuvem" },
  { label: "Acesse de qualquer lugar" },
  { label: "Seus dados organizados" },
];

export interface Problem {
  title: string;
}

export const PROBLEMS: Problem[] = [
  { title: "Informações espalhadas" },
  { title: "Dificuldade para acompanhar o negócio" },
  { title: "Falta de visão dos resultados" },
];

export const SOLUTION_ITEMS = ["Clientes", "Produtos", "Serviços", "Vendas", "Fidelidade", "Caixa"];

export interface DemoScreen {
  title: string;
  description: string;
  variant: "dashboard" | "clientes" | "gestao";
}

export const DEMO_SCREENS: DemoScreen[] = [
  {
    title: "Dashboard",
    description: "Veja o resumo do seu negócio assim que entrar no sistema.",
    variant: "dashboard",
  },
  {
    title: "Clientes",
    description: "Cadastre, busque e acompanhe seus clientes em segundos.",
    variant: "clientes",
  },
  {
    title: "Gestão",
    description: "Estrutura pronta para crescer junto com o seu negócio.",
    variant: "gestao",
  },
];

export interface Step {
  number: string;
  title: string;
}

export const HOW_IT_WORKS_STEPS: Step[] = [
  { number: "01", title: "Crie sua conta" },
  { number: "02", title: "Configure sua empresa" },
  { number: "03", title: "Comece a administrar" },
];

export interface Benefit {
  title: string;
  description: string;
  icon: LucideIcon;
}

export const BENEFITS: Benefit[] = [
  {
    title: "Gestão simples",
    description: "Feito para quem não quer perder tempo aprendendo sistemas complicados.",
    icon: Gauge,
  },
  {
    title: "Acesse de qualquer lugar",
    description: "Seu negócio disponível onde você estiver.",
    icon: Smartphone,
  },
  {
    title: "Tudo organizado",
    description: "Tenha as principais informações da empresa em um só lugar.",
    icon: FolderKanban,
  },
  {
    title: "Mais controle",
    description: "Entenda melhor o que acontece no seu negócio.",
    icon: LayoutDashboard,
  },
];
