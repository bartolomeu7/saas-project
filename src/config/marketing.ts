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
  Building2,
  KeyRound,
  Globe,
  QrCode,
  FileText,
  CalendarCheck,
  ShieldCheck,
} from "lucide-react";

export const NAV_LINKS = [
  { label: "Recursos", href: "#recursos" },
  { label: "Produto", href: "#produto" },
  { label: "Para quem é", href: "#segmentos" },
  { label: "Preços", href: "#precos" },
  { label: "Perguntas", href: "#faq" },
] as const;

export interface Segment {
  name: string;
  description: string;
  icon: LucideIcon;
}

/** Máximo 6, conforme definido para a home — não é a lista completa de business_type. */
export const SEGMENTS: Segment[] = [
  { name: "Padarias", description: "Controle produtos, estoque, vendas e caixa da sua padaria.", icon: Croissant },
  { name: "Mercadinhos e mercearias", description: "Organize produtos, estoque, vendas e caixa do dia a dia.", icon: ShoppingBasket },
  { name: "Restaurantes", description: "Controle clientes, vendas e operação do seu negócio.", icon: UtensilsCrossed },
  { name: "Lanchonetes", description: "Organize vendas, clientes e operação no dia a dia.", icon: Sandwich },
  { name: "Lava-rápidos", description: "Cadastre clientes e serviços, registre as vendas e acompanhe o caixa.", icon: Car },
  { name: "Estética automotiva", description: "Acompanhe clientes, serviços e fidelização em um só lugar.", icon: Sparkles },
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
  { name: "Caixa", description: "Abra e feche o caixa, lance movimentações e confira o saldo no fechamento.", icon: Banknote, available: true },
  { name: "Estoque", description: "Saldo por produto, alertas de estoque baixo e ajuste manual de quantidade.", icon: Warehouse, available: true },
  { name: "Financeiro", description: "Contas a pagar e a receber, receitas e despesas e resultado do mês.", icon: LineChart, available: true },
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
  description: string;
  icon: LucideIcon;
}

export const PROBLEMS: Problem[] = [
  {
    title: "Informações espalhadas",
    description: "Clientes numa planilha, vendas num caderno, caixa na cabeça. Cada consulta vira uma busca.",
    icon: FolderKanban,
  },
  {
    title: "Dificuldade para acompanhar o negócio",
    description: "Sem registro único, fica difícil saber o que foi vendido, o que está em estoque e quem deve.",
    icon: Warehouse,
  },
  {
    title: "Falta de visão dos resultados",
    description: "Sem números organizados, as decisões do dia a dia dependem de palpite em vez de dados.",
    icon: LineChart,
  },
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
  description: string;
}

export const HOW_IT_WORKS_STEPS: Step[] = [
  { number: "01", title: "Crie sua conta", description: "Aceite os termos, cadastre-se e entre no seu ambiente." },
  {
    number: "02",
    title: "Configure sua empresa",
    description: "Informe os dados da empresa e cadastre clientes, produtos e serviços.",
  },
  {
    number: "03",
    title: "Comece a administrar",
    description: "Registre vendas, acompanhe o caixa e organize a rotina em um só lugar.",
  },
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

/*
 * Planos e preços NÃO ficam mais aqui: a home lê o catálogo do banco (get_public_plans) — fonte única administrada
 * em /admin/plans. Ver src/lib/billing/pricing-display.ts.
 */

/**
 * Credibilidade REAL: só fatos verificáveis no produto (nada de números, clientes, logos ou
 * depoimentos inventados). Cada item corresponde a algo que existe no código/arquitetura hoje.
 */
export interface CredibilityItem {
  title: string;
  detail: string;
  icon: LucideIcon;
}

export const CREDIBILITY_ITEMS: CredibilityItem[] = [
  { title: "Um ambiente por empresa", detail: "Os dados de cada empresa ficam separados das demais.", icon: Building2 },
  { title: "Login por provedor especializado", detail: "A autenticação é do Clerk; a Prime Ges não guarda a sua senha.", icon: KeyRound },
  { title: "100% online", detail: "Use no navegador, sem instalar nada.", icon: Globe },
  { title: "Pagamento por Pix", detail: "Gere o Pix na plataforma e acompanhe a liberação do acesso.", icon: QrCode },
  { title: "Termos e privacidade públicos", detail: "Documentos versionados, com vigência e registro do seu aceite.", icon: FileText },
];

/** Solução em "bento": agrupa os módulos reais de FEATURES (todos disponíveis hoje). */
export interface BentoCell {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
  /** Nomes de FEATURES exibidos como etiquetas. */
  modules: string[];
  size: "lg" | "md";
}

export const BENTO_CELLS: BentoCell[] = [
  {
    id: "vendas-caixa",
    title: "Vendas e caixa",
    description:
      "Registre vendas com itens, pagamentos e descontos, abra e feche o caixa e confira o saldo no fechamento.",
    icon: ShoppingCart,
    modules: ["Vendas", "Caixa"],
    size: "lg",
  },
  {
    id: "clientes",
    title: "Clientes e fidelidade",
    description: "Cadastre clientes com documentos, acompanhe o histórico e configure níveis, campanhas e resgate de pontos.",
    icon: Users,
    modules: ["Clientes", "Fidelidade"],
    size: "md",
  },
  {
    id: "catalogo",
    title: "Produtos, serviços e estoque",
    description: "Organize catálogo, categorias e preços e acompanhe o saldo, com alertas de estoque baixo.",
    icon: Package,
    modules: ["Produtos", "Serviços", "Estoque"],
    size: "md",
  },
  {
    id: "financeiro",
    title: "Financeiro",
    description: "Contas a pagar e a receber, receitas e despesas e o resultado do mês, sem planilha paralela.",
    icon: LineChart,
    modules: ["Financeiro"],
    size: "lg",
  },
];

/** Diferenciais REAIS (cada um descreve comportamento existente do produto). */
export const DIFFERENTIALS: Benefit[] = [
  {
    title: "Sem renovação automática",
    description: "Você paga por período e renova quando quiser. Não há cobrança recorrente automática.",
    icon: CalendarCheck,
  },
  {
    title: "Pensado para pequenos negócios",
    description: "Vendas, caixa, clientes e estoque do dia a dia, sem a complexidade de um sistema corporativo.",
    icon: Gauge,
  },
  {
    title: "Cada empresa no seu ambiente",
    description: "Dados separados por empresa e acesso das pessoas por função: proprietário, administrador ou funcionário.",
    icon: ShieldCheck,
  },
  {
    title: "Pix sem sair da plataforma",
    description: "Gere o Pix, pague e veja o acesso liberado depois da confirmação do pagamento.",
    icon: QrCode,
  },
];

export interface FaqItem {
  question: string;
  answer: string;
}

/**
 * Perguntas frequentes baseadas no funcionamento real. Números (teste, usuários) vêm dos planos do catálogo
 * (faqFacts em pricing-display.ts); nenhuma política comercial é inventada aqui.
 */
export function buildFaq({ trialLabel, extraUsers }: { trialLabel: string | null; extraUsers: number }): FaqItem[] {
  return [
    {
      question: "O que é o Prime Ges?",
      answer:
        "É uma plataforma online de gestão para pequenos negócios. Reúne clientes, produtos, serviços, vendas, fidelidade, caixa, estoque e financeiro em um único lugar.",
    },
    {
      question: "Para quem o Prime Ges é indicado?",
      answer:
        "Para MEIs, microempresas e pequenos negócios que vendem produtos, prestam serviços ou fazem os dois, como lava-rápidos, estética automotiva, padarias, mercadinhos, lanchonetes e restaurantes. O Prime Ges organiza a gestão do dia a dia; ele não substitui a contabilidade e não emite nota fiscal.",
    },
    {
      question: "Preciso instalar algum programa?",
      answer: "Não. O Prime Ges funciona no navegador, no computador ou no celular.",
    },
    {
      question: "Como funciona o teste grátis?",
      answer: trialLabel
        ? "Ao criar a conta você tem " + trialLabel + " de acesso gratuito para conhecer a plataforma. O teste não inclui suporte por e-mail nem usuários adicionais. O teste é concedido uma vez por pessoa e há um limite de cadastros por conexão para evitar abuso."
        : "Ao criar a conta você pode conhecer a plataforma antes de assinar.",
    },
    {
      question: "Como é feito o pagamento?",
      answer:
        "Os planos pagos são pagos por Pix, gerado dentro da plataforma. O acesso do período é liberado depois da confirmação do pagamento.",
    },
    {
      question: "O que acontece quando o período do plano termina?",
      answer:
        "O acesso às funcionalidades é bloqueado até você contratar um novo período. Não há cobrança automática: a renovação depende de um novo pagamento.",
    },
    {
      question: "Posso ter outras pessoas usando a minha empresa?",
      answer:
        "Sim. Os planos pagos incluem 1 proprietário e até " + extraUsers + " usuários adicionais. Cada pessoa tem uma função (administrador ou funcionário).",
    },
    {
      question: "Os dados da minha empresa ficam separados dos de outras?",
      answer:
        "Sim. Cada empresa tem o seu ambiente, e as regras de acesso aos dados são aplicadas no banco de dados, não só na tela.",
    },
    {
      question: "Há suporte?",
      answer: "Os planos pagos incluem suporte por e-mail. O teste grátis não inclui suporte.",
    },
    {
      question: "Onde leio os Termos de Uso e a Política de Privacidade?",
      answer:
        "Nas páginas Termos de Uso e Política de Privacidade, acessíveis pelo rodapé e pela tela de cadastro. Elas têm versão e data de vigência, e o seu aceite é registrado.",
    },
  ];
}
