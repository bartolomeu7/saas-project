/**
 * Conteúdo do site público (home, /recursos, /produto, /para-quem-e, /precos e /perguntas).
 *
 * Centralizado aqui para que textos, segmentos e perguntas possam ser ajustados sem mexer nos componentes. Nenhum
 * dado aqui é lido do banco: é conteúdo de marketing estático. Planos e preços NÃO ficam aqui (vêm do catálogo
 * administrado em /admin/plans, ver src/lib/billing/pricing-display.ts). Só entra o que o produto faz hoje: nada de
 * números, clientes, logos ou depoimentos inventados.
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
  Gauge,
  Gift,
  Banknote,
  BarChart3,
  BriefcaseBusiness,
  Building2,
  CalendarCheck,
  CalendarDays,
  ClipboardList,
  FileSignature,
  FileText,
  FolderKanban,
  Globe,
  KeyRound,
  MessagesSquare,
  QrCode,
  ShieldCheck,
  Truck,
  UserCog,
} from "lucide-react";

export const NAV_LINKS = [
  { label: "Recursos", href: "/recursos" },
  { label: "Produto", href: "/produto" },
  { label: "Para quem é", href: "/para-quem-e" },
  { label: "Preços", href: "/precos" },
  { label: "Perguntas", href: "/perguntas" },
] as const;

export interface Segment {
  name: string;
  description: string;
  icon: LucideIcon;
  /** Nomes de FEATURES indicados para o segmento. */
  modules: string[];
  /** Como o sistema entra na rotina (só o que o produto faz hoje). */
  routine: string[];
}

/** Máximo 6, conforme definido para a home — não é a lista completa de business_type. */
export const SEGMENTS: Segment[] = [
  {
    name: "Padarias",
    description: "Controle produtos, estoque, vendas e caixa da sua padaria.",
    icon: Croissant,
    modules: ["Produtos", "Estoque", "Vendas", "Caixa", "Compras", "Fornecedores"],
    routine: [
      "Abra o caixa no começo do turno e registre cada venda com os itens e a forma de pagamento.",
      "A venda concluída baixa o estoque, e o saldo baixo de um produto aparece em destaque.",
      "Faça o pedido ao fornecedor: no recebimento o estoque sobe e a conta a pagar é criada.",
    ],
  },
  {
    name: "Mercadinhos e mercearias",
    description: "Organize produtos, estoque, vendas e caixa do dia a dia.",
    icon: ShoppingBasket,
    modules: ["Produtos", "Estoque", "Vendas", "Caixa", "Financeiro", "Relatórios"],
    routine: [
      "Organize o catálogo por categorias, com preço de venda e custo de cada produto.",
      "Acompanhe o saldo por produto e registre a entrada de mercadoria.",
      "Veja nos relatórios o faturamento por dia e os itens que mais faturaram.",
    ],
  },
  {
    name: "Restaurantes",
    description: "Controle clientes, vendas e operação do seu negócio.",
    icon: UtensilsCrossed,
    modules: ["Clientes", "Vendas", "Produtos", "Caixa", "Equipe", "RH"],
    routine: [
      "Registre as vendas com itens, descontos e pagamentos e confira o caixa no fechamento.",
      "Dê acesso à equipe por função: proprietário, administrador ou funcionário.",
      "Acompanhe presença, vales e pagamentos dos funcionários no RH.",
    ],
  },
  {
    name: "Lanchonetes",
    description: "Organize vendas, clientes e operação no dia a dia.",
    icon: Sandwich,
    modules: ["Clientes", "Vendas", "Produtos", "Caixa", "Fidelidade", "Estoque"],
    routine: [
      "Registre o pedido como venda e escolha a forma de pagamento.",
      "Identifique o cliente para que ele acumule pontos de fidelidade.",
      "No fim do dia, feche o caixa conferindo o saldo esperado.",
    ],
  },
  {
    name: "Lava-rápidos",
    description: "Cadastre clientes e serviços, registre as vendas e acompanhe o caixa.",
    icon: Car,
    modules: ["Clientes", "Serviços", "Agenda", "Vendas", "Caixa", "Fidelidade"],
    routine: [
      "Marque o horário na agenda, escolhendo cliente, serviço e profissional.",
      "Ao concluir o atendimento, a venda é gerada sem digitar tudo de novo.",
      "O cliente identificado acumula pontos e tem um motivo para voltar.",
    ],
  },
  {
    name: "Estética automotiva",
    description: "Acompanhe clientes, serviços e fidelização em um só lugar.",
    icon: Sparkles,
    modules: ["Clientes", "Serviços", "Orçamentos", "Agenda", "Fidelidade", "Caixa"],
    routine: [
      "Monte o orçamento do serviço, baixe o PDF e marque se o cliente aprovou.",
      "Agende o atendimento por profissional e acompanhe o dia.",
      "Veja o histórico e o ranking de clientes para saber quem volta mais.",
    ],
  },
];

export interface FeatureModule {
  name: string;
  description: string;
  icon: LucideIcon;
  available: boolean;
}

/** Espelha os módulos reais do produto — "available" decide o que pode ser divulgado. */
export const FEATURES: FeatureModule[] = [
  { name: "Clientes", description: "Cadastre, busque e acompanhe clientes, com documentos, ranking e sorteio.", icon: Users, available: true },
  { name: "Produtos", description: "Cadastre produtos, categorias e preços.", icon: Package, available: true },
  { name: "Serviços", description: "Cadastre serviços e categorias oferecidos.", icon: Wrench, available: true },
  { name: "Vendas", description: "Registre vendas com itens, pagamentos, descontos e cancelamento.", icon: ShoppingCart, available: true },
  { name: "Fidelidade", description: "Configure níveis, campanhas, multiplicadores e resgate de pontos.", icon: Gift, available: true },
  { name: "Caixa", description: "Abra e feche o caixa, lance movimentações e confira o saldo no fechamento.", icon: Banknote, available: true },
  { name: "Estoque", description: "Saldo por produto, alertas de estoque baixo e ajuste manual de quantidade.", icon: Warehouse, available: true },
  { name: "Financeiro", description: "Contas a pagar e a receber, receitas e despesas e resultado do mês.", icon: LineChart, available: true },
  { name: "Agenda", description: "Horários por profissional, com o atendimento virando venda ao ser concluído.", icon: CalendarDays, available: true },
  { name: "Orçamentos", description: "Monte a proposta, baixe o PDF e acompanhe se o cliente aprovou.", icon: FileSignature, available: true },
  { name: "Assistente de agenda", description: "Marque um horário por conversa, escrevendo ou ditando, e confirme o resumo.", icon: MessagesSquare, available: true },
  { name: "Compras", description: "Pedido ao fornecedor, recebimento, entrada no estoque e conta a pagar.", icon: ClipboardList, available: true },
  { name: "Fornecedores", description: "Cadastro de parceiros, custos e vínculos usados nas compras.", icon: Truck, available: true },
  { name: "Relatórios", description: "Faturamento, ticket médio, recebimentos e itens que mais faturaram.", icon: BarChart3, available: true },
  { name: "Equipe", description: "Acesso por função, ficha profissional e disponibilidade para a agenda.", icon: UserCog, available: true },
  { name: "RH", description: "Funcionários, presença, vales e pagamentos para controle interno.", icon: BriefcaseBusiness, available: true },
];

/** Fatos de cada módulo (página /recursos). Cada item descreve algo que existe no sistema hoje. */
export const MODULE_DETAILS: Record<string, string[]> = {
  Clientes: ["Cadastro com documentos e histórico de compras", "Ranking por receita, compras e ticket médio", "Sorteio entre clientes"],
  Produtos: ["Categorias, preço de venda e custo", "Histórico de alterações do produto", "Mudar preço é restrito a proprietário e administrador"],
  Serviços: ["Categorias e preço de cada serviço", "O mesmo cadastro vale para venda, orçamento e agenda"],
  Vendas: ["Produtos e serviços na mesma venda", "Desconto, formas de pagamento e cancelamento", "A venda concluída baixa o estoque"],
  Fidelidade: ["Níveis e multiplicadores de pontos", "Campanhas com período definido", "Resgate de pontos pelo cliente"],
  Caixa: ["Abertura e fechamento com o saldo esperado", "Entradas das vendas e movimentações avulsas", "Consulta do último fechamento"],
  Estoque: ["Saldo por produto com alerta de estoque baixo", "Entrada de mercadoria e ajuste de quantidade", "Histórico de movimentações"],
  Financeiro: ["Contas a pagar e a receber", "Categorias e centros de custo", "DRE simplificada do período"],
  Agenda: ["Atendimentos do dia e visão da semana", "Situação: agendado, confirmado e concluído", "Impressão da agenda do dia"],
  Orçamentos: ["Itens, desconto, validade e condições de pagamento", "PDF para enviar ao cliente", "Situação: enviado, aprovado ou recusado"],
  "Assistente de agenda": ["Entende pedidos como “agendar uma lavagem amanhã às 14h”", "Mostra o resumo antes de gravar", "O ditado usa o reconhecimento de voz do navegador"],
  Compras: ["Pedido de compra por fornecedor", "O recebimento dá entrada no estoque", "Gera a conta a pagar"],
  Fornecedores: ["Dados de contato e custos", "Vínculo com produtos e pedidos de compra"],
  Relatórios: ["Períodos: hoje, 7 dias, 30 dias, mês e ano", "Faturamento por dia e recebimentos por forma de pagamento", "Valores em aberto e estoque crítico"],
  Equipe: ["Funções: proprietário, administrador e funcionário", "Especialidade e disponibilidade de cada profissional"],
  RH: ["Presença, vales e fechamento de pagamentos", "Estimativas de CLT, férias e 13º", "Não substitui o holerite oficial, o eSocial nem o contador"],
};

export interface ModuleGroup {
  id: string;
  title: string;
  description: string;
  /** Nomes de FEATURES. */
  modules: string[];
}

/** Os módulos agrupados pela rotina. */
export const MODULE_GROUPS: ModuleGroup[] = [
  { id: "atendimento", title: "Atender e vender", description: "Do orçamento ao pagamento, com o cliente identificado.", modules: ["Vendas", "Clientes", "Serviços", "Agenda", "Assistente de agenda", "Orçamentos", "Fidelidade"] },
  { id: "mercadoria", title: "Cuidar da mercadoria", description: "O que entra, o que sai e o que está acabando.", modules: ["Produtos", "Estoque", "Compras", "Fornecedores"] },
  { id: "dinheiro", title: "Acompanhar o dinheiro", description: "O caixa do dia e o resultado do mês.", modules: ["Caixa", "Financeiro", "Relatórios"] },
  { id: "pessoas", title: "Organizar a equipe", description: "Quem acessa o quê e quanto há para pagar.", modules: ["Equipe", "RH"] },
];

/** Telas ilustrativas disponíveis (src/components/marketing/screens.tsx). */
export type ScreenId = "venda" | "estoque" | "caixa" | "financeiro" | "fidelidade" | "agenda" | "orcamento" | "relatorios" | "compra";

export interface FlowStep {
  screen: ScreenId;
  title: string;
  text: string;
}

/** O que uma venda atualiza no resto do sistema (home e /produto). */
export const SALE_FLOW: FlowStep[] = [
  { screen: "venda", title: "Registre a venda", text: "Escolha os itens, aplique o desconto se houver e informe a forma de pagamento." },
  { screen: "estoque", title: "O estoque baixa", text: "Com a venda concluída, o saldo dos produtos é atualizado e o estoque baixo aparece em destaque." },
  { screen: "caixa", title: "O caixa recebe", text: "O pagamento entra no caixa aberto, e o fechamento mostra o saldo esperado." },
  { screen: "financeiro", title: "O financeiro registra", text: "A receita vai para o financeiro e para os relatórios, sem lançar a mesma coisa duas vezes." },
  { screen: "fidelidade", title: "O cliente ganha pontos", text: "Com o programa configurado, o cliente identificado acumula pontos para resgatar depois." },
];

/** Outros caminhos que o sistema liga sozinho (/produto). */
export const OTHER_FLOWS: { screen: ScreenId; title: string; text: string; steps: string[] }[] = [
  { screen: "agenda", title: "Do horário marcado à venda", text: "Concluir o atendimento já gera a venda.", steps: ["Agendamento", "Atendimento concluído", "Venda gerada"] },
  { screen: "compra", title: "Da compra à conta a pagar", text: "O recebimento da mercadoria atualiza o estoque e o financeiro.", steps: ["Pedido ao fornecedor", "Recebimento", "Estoque e conta a pagar"] },
  { screen: "orcamento", title: "Da proposta à resposta", text: "O cliente recebe o PDF e você acompanha a situação.", steps: ["Orçamento", "PDF enviado", "Aprovado ou recusado"] },
];

/** Como a assinatura é paga (/precos): comportamento real da tela de pagamento. */
export const PAYMENT_FACTS: { title: string; text: string }[] = [
  { title: "Pix gerado na plataforma", text: "Escolha o plano e gere o QR Code ou o código copia e cola sem sair do sistema." },
  { title: "Acesso após a confirmação", text: "O período é liberado depois que o pagamento é confirmado pelo provedor." },
  { title: "Cada cobrança tem uma ordem", text: "O número da ordem de pagamento aparece na tela e no histórico, para consultar quando precisar." },
  { title: "Ajuda ligada à ordem", text: "Se algo não bater, abra um chamado na própria ordem e leia a resposta ali." },
  { title: "Sem renovação automática", text: "Nada é cobrado sozinho. Para continuar depois do período, você faz um novo pagamento." },
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
  { title: "100% online", detail: "Use no navegador, sem instalar nada. Se quiser, adicione à tela inicial como aplicativo.", icon: Globe },
  { title: "Pagamento por Pix", detail: "Gere o Pix na plataforma e acompanhe a liberação do acesso.", icon: QrCode },
  { title: "Termos e privacidade públicos", detail: "Documentos versionados, com vigência e registro do seu aceite.", icon: FileText },
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
        "É uma plataforma online de gestão para pequenos negócios. Reúne clientes, produtos, serviços, vendas, fidelidade, caixa, estoque, financeiro, agenda, orçamentos, compras e equipe em um único lugar.",
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
      question: "O Prime Ges tem agenda e orçamentos?",
      answer:
        "Sim. A agenda organiza os horários por profissional e, ao concluir um atendimento, a venda é gerada. Os orçamentos podem ser baixados em PDF e marcados como aprovados ou recusados.",
    },
    {
      question: "O módulo de RH substitui o contador?",
      answer:
        "Não. O RH é um controle interno de funcionários, presença, vales e pagamentos. Os valores calculados são estimativas e não substituem o holerite oficial, o eSocial nem o seu contador.",
    },
    {
      question: "Como peço ajuda sobre um pagamento da assinatura?",
      answer:
        "Cada cobrança tem um número de ordem de pagamento. Na tela da ordem há um botão de ajuda, que abre um chamado ligado a ela, e a resposta aparece na mesma tela.",
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
