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
} from "lucide-react";

export const NAV_LINKS = [
  { label: "Início", href: "#topo" },
  { label: "Soluções", href: "#recursos" },
  { label: "Para quem é", href: "#segmentos" },
  { label: "Preços", href: "#precos" },
  { label: "Recursos", href: "#recursos" },
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
  { name: "Clientes", description: "Tenha seus clientes organizados e encontre tudo rapidamente.", icon: Users, available: true },
  { name: "Produtos", description: "Controle preços, produtos e estoque.", icon: Package, available: false },
  { name: "Serviços", description: "Cadastre e acompanhe os serviços oferecidos.", icon: Wrench, available: false },
  { name: "Vendas", description: "Registre suas vendas de forma simples.", icon: ShoppingCart, available: false },
  { name: "Estoque", description: "Saiba o que entrou, saiu e o que precisa ser reposto.", icon: Warehouse, available: false },
  { name: "Financeiro", description: "Tenha visão das entradas, saídas e resultados.", icon: LineChart, available: false },
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

export const SOLUTION_ITEMS = ["Clientes", "Vendas", "Serviços", "Estoque", "Financeiro"];

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

/**
 * Estrutura pensada para, no futuro, alimentar uma integração real de
 * assinaturas/cobrança — cada plano já carrega os campos que esse sistema
 * provavelmente vai precisar (duração, limite de usuários, quais
 * benefícios cada um libera). Nesta etapa é só apresentação comercial:
 * nenhum pagamento ou banco de assinaturas é criado.
 */
export type PlanId = "FREE_TRIAL" | "MONTHLY" | "QUARTERLY" | "YEARLY" | "CUSTOM";

export interface PricingPlan {
  id: PlanId;
  name: string;
  /** Selo curto mostrado acima/ao lado do nome (ex: "Mais escolhido"). */
  tagline?: string;
  /** Preço em reais. null = sob consulta (plano CUSTOM). */
  price: number | null;
  /** Duração do acesso em dias. null = negociável (plano CUSTOM). */
  periodDays: number | null;
  /** Texto de duração já formatado para exibição (ex: "93 dias"). */
  periodLabel: string;
  description: string;
  includedFeatures: string[];
  /** Só o teste grátis usa isso, para deixar claro o que NÃO está incluso. */
  excludedFeatures?: string[];
  /** Além do proprietário. null = negociável (plano CUSTOM). */
  additionalUsersLimit: number | null;
  hasSupport: boolean;
  hasTickets: boolean;
  hasGroups: boolean;
  hasEarlyAccess: boolean;
  ctaLabel: string;
  /** null = ainda sem destino real (ex: contato comercial) — CTA fica desabilitado, nunca aponta pra link falso. */
  ctaHref: string | null;
  highlight?: "popular" | "value";
}

export function formatPlanPrice(price: number): string {
  if (price === 0) return "R$ 0";
  return `R$ ${price.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function paidPlanBenefits(additionalUsers: number): string[] {
  return [
    "Acesso às ferramentas da plataforma",
    `1 proprietário + até ${additionalUsers} usuários adicionais`,
    "Suporte da Prime Ges",
    "Acesso ao sistema de tickets",
    "Acesso aos grupos de comunicação exclusivos",
    "Atualizações constantes da plataforma",
    "Acesso antecipado a novidades e melhorias para assinantes",
  ];
}

export const PRICING_PLANS: PricingPlan[] = [
  {
    id: "FREE_TRIAL",
    name: "Teste grátis",
    tagline: "1 dia",
    price: 0,
    periodDays: 1,
    periodLabel: "1 dia",
    description: "Experimente o Prime Ges por 1 dia e conheça a plataforma.",
    includedFeatures: [
      "Acesso de 1 dia à plataforma",
      "Conhecer as principais funcionalidades",
      "Avaliar o sistema antes de assinar",
    ],
    excludedFeatures: [
      "Suporte da plataforma",
      "Acesso a tickets",
      "Grupos exclusivos de membros",
      "Benefícios exclusivos para assinantes",
    ],
    additionalUsersLimit: 0,
    hasSupport: false,
    hasTickets: false,
    hasGroups: false,
    hasEarlyAccess: false,
    ctaLabel: "Começar teste grátis",
    ctaHref: "/register",
  },
  {
    id: "MONTHLY",
    name: "Mensal",
    tagline: "Mais escolhido",
    price: 89,
    periodDays: 31,
    periodLabel: "31 dias",
    description: "Tenha acesso completo ao Prime Ges durante 31 dias.",
    includedFeatures: paidPlanBenefits(2),
    additionalUsersLimit: 2,
    hasSupport: true,
    hasTickets: true,
    hasGroups: true,
    hasEarlyAccess: true,
    ctaLabel: "Assinar mensal",
    ctaHref: "/register",
    highlight: "popular",
  },
  {
    id: "QUARTERLY",
    name: "Trimestral",
    price: 240,
    periodDays: 93,
    periodLabel: "93 dias",
    description: "Acesso ao Prime Ges garantido por 93 dias.",
    includedFeatures: paidPlanBenefits(5),
    additionalUsersLimit: 5,
    hasSupport: true,
    hasTickets: true,
    hasGroups: true,
    hasEarlyAccess: true,
    ctaLabel: "Assinar trimestral",
    ctaHref: "/register",
  },
  {
    id: "YEARLY",
    name: "Anual",
    tagline: "Melhor custo-benefício",
    price: 899,
    periodDays: 365,
    periodLabel: "365 dias",
    description: "Acesso ao Prime Ges garantido por 365 dias.",
    includedFeatures: paidPlanBenefits(10),
    additionalUsersLimit: 10,
    hasSupport: true,
    hasTickets: true,
    hasGroups: true,
    hasEarlyAccess: true,
    ctaLabel: "Assinar anual",
    ctaHref: "/register",
    highlight: "value",
  },
];

/**
 * Plano sob medida — sem preço nem período fixo, e sem CTA funcional
 * ainda (não existe canal de contato comercial implementado). Fica de
 * fora de PRICING_PLANS porque não entra no grid de 4 colunas, é
 * apresentado como bloco separado abaixo.
 */
export const CUSTOM_PLAN = {
  id: "CUSTOM" as const,
  name: "Sob medida",
  tagline: "Solicite um orçamento",
  title: "Precisa de mais tempo?",
  description:
    "Precisa de um período maior ou deseja contratar o Prime Ges por um prazo personalizado? Fale com nossa equipe para solicitar uma proposta.",
  ctaLabel: "Solicitar orçamento",
  /** Sem canal de contato comercial implementado ainda — CTA fica desabilitado em vez de linkar pra algo que não existe. */
  ctaHref: null as string | null,
};

export interface ComparisonRow {
  label: string;
  values: [boolean | string, boolean | string, boolean | string, boolean | string];
  note?: string;
}

/** Colunas na mesma ordem de PRICING_PLANS (sem o plano CUSTOM). */
export const COMPARISON_ROWS: ComparisonRow[] = [
  { label: "Acesso à plataforma", values: [true, true, true, true] },
  { label: "Suporte", values: [false, true, true, true] },
  { label: "Tickets", values: [false, true, true, true] },
  { label: "Grupos exclusivos", values: [false, true, true, true] },
  { label: "Atualizações", values: [false, true, true, true] },
  { label: "Acesso antecipado", values: [false, true, true, true] },
  {
    label: "Usuários adicionais",
    values: ["—", "2", "2", "2"],
    note: "Quantidade de usuários adicionais além do proprietário.",
  },
];
