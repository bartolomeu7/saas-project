/**
 * Dúvidas mais buscadas sobre sistemas para pequenas empresas (/duvidas e /duvidas/[slug]).
 *
 * As perguntas vieram de pesquisa no Google em 25/11/2026 ("As pessoas também perguntam" e sugestões de busca);
 * ver docs/SEO.md. Regras de redação (conferidas em tests/unit/duvidas.test.mjs):
 *  - primeiro a resposta útil e direta; depois como o Prime Ges resolve;
 *  - só o que o produto faz hoje, e o que ele NÃO faz quando isso muda a escolha (nota fiscal, uso sem internet...);
 *  - sem preços escritos (vêm do catálogo), sem depoimentos, números ou "o melhor do mercado".
 */
import type { ScreenId } from "@/config/marketing";

export type DoubtCategory = "Sistemas e SaaS" | "Rotina da empresa" | "Por tipo de negócio";

export const DOUBT_CATEGORIES: DoubtCategory[] = ["Sistemas e SaaS", "Rotina da empresa", "Por tipo de negócio"];

export interface Doubt {
  slug: string;
  category: DoubtCategory;
  /** A pergunta, como as pessoas buscam (vira o H1). */
  question: string;
  /** Título da aba/resultado de busca (o layout acrescenta " | Prime Ges"). */
  metaTitle: string;
  /** Meta description: 110 a 170 caracteres. */
  description: string;
  /** Resposta direta, que se sustenta sozinha. */
  answer: string;
  sections: { heading: string; paragraphs?: string[]; items?: string[] }[];
  /** Como o Prime Ges resolve: o que ele faz e o diferencial neste problema. */
  prime: { intro: string; points: string[] };
  /** Limite do produto relevante para esta pergunta. */
  limit?: string;
  screen?: ScreenId;
  /** Mostra os planos do catálogo (perguntas sobre preço). */
  showPlans?: boolean;
  related: string[];
}

/** Data de publicação do conteúdo (sitemap e dados estruturados). Atualize ao revisar os textos. */
export const DOUBTS_UPDATED_AT = "2026-11-25";

export const DOUBTS: Doubt[] = [
  {
    slug: "o-que-e-saas",
    category: "Sistemas e SaaS",
    question: "O que é SaaS e como funciona para uma pequena empresa?",
    metaTitle: "O que é SaaS para pequenas empresas",
    description:
      "SaaS é o software usado pela internet e pago por período, sem instalação. Entenda como funciona, exemplos e o que muda para a pequena empresa.",
    answer:
      "SaaS (software como serviço) é um programa que você usa pela internet, sem instalar nem manter servidor. A empresa que fornece cuida da hospedagem e das atualizações, e você paga pelo período de uso.",
    sections: [
      {
        heading: "Como funciona na prática",
        paragraphs: [
          "Você cria uma conta, entra pelo navegador do computador ou do celular e os dados ficam guardados no servidor do fornecedor. Quando sai uma melhoria, ela aparece sozinha, sem reinstalar nada.",
        ],
      },
      {
        heading: "Exemplos de SaaS",
        paragraphs: [
          "E-mail e documentos on-line, ferramentas de organização de tarefas e sistemas de gestão são exemplos comuns. Serviços de assinatura como os de filmes e música usam uma ideia parecida, mas o termo SaaS costuma se referir a programas usados para trabalhar.",
        ],
      },
      {
        heading: "O que observar antes de assinar",
        items: [
          "Como é cobrado e se a renovação é automática.",
          "Quantas pessoas podem usar a mesma conta.",
          "Se os dados da sua empresa ficam separados dos de outras.",
          "O que acontece quando o período termina.",
        ],
      },
    ],
    prime: {
      intro: "O Prime Ges é um SaaS de gestão feito para a rotina de pequenas empresas no Brasil.",
      points: [
        "Abre no navegador e pode ser adicionado à tela inicial do celular como aplicativo.",
        "Reúne vendas, clientes, agenda, orçamentos, estoque, caixa, financeiro e equipe na mesma conta.",
        "Pagamento por Pix, por período e sem renovação automática: nada é cobrado sozinho.",
        "Cada empresa tem o seu ambiente, e o acesso das pessoas é definido por função.",
      ],
    },
    limit: "Como todo sistema on-line, precisa de internet para funcionar.",
    screen: "venda",
    related: ["saas-vale-a-pena-para-pequenas-empresas", "sistema-online-ou-instalado", "quanto-custa-um-sistema-para-pequenas-empresas"],
  },
  {
    slug: "saas-vale-a-pena-para-pequenas-empresas",
    category: "Sistemas e SaaS",
    question: "SaaS vale a pena para pequenas empresas?",
    metaTitle: "SaaS vale a pena para pequena empresa?",
    description:
      "Veja quando um sistema por assinatura compensa para a pequena empresa, quando não compensa e como decidir sem pagar por recursos que não vai usar.",
    answer:
      "Vale a pena quando a empresa já perde tempo juntando informação de caderno, planilha e conversa. O sistema por assinatura dispensa servidor e instalação e permite começar pequeno. Não compensa se ninguém for registrar o dia a dia nele.",
    sections: [
      {
        heading: "Sinais de que está na hora",
        items: [
          "Você não sabe quanto vendeu na semana sem fazer contas.",
          "O estoque acaba sem aviso.",
          "O caixa não bate no fim do dia e não dá para descobrir o motivo.",
          "Só uma pessoa sabe onde está cada informação.",
        ],
      },
      {
        heading: "Quando esperar",
        paragraphs: [
          "Se o volume é muito baixo e uma anotação simples resolve, comece organizando o processo. O sistema ajuda quem registra; ele não adivinha o que não foi lançado.",
        ],
      },
      {
        heading: "Como testar sem risco",
        paragraphs: ["Use o teste do fornecedor com uma semana real em mente: cadastre alguns produtos ou serviços, registre vendas e feche o caixa. Se a rotina ficou mais clara, vale seguir."],
      },
    ],
    prime: {
      intro: "O Prime Ges foi pensado para quem quer sair do improviso sem a complexidade de um sistema corporativo.",
      points: [
        "Teste grátis para experimentar com os seus próprios produtos e serviços.",
        "Uma venda registrada atualiza estoque, caixa, financeiro e pontos de fidelidade.",
        "Você escolhe o período do plano e renova só se quiser.",
        "Os módulos ficam disponíveis conforme a rotina: use primeiro o que dói mais.",
      ],
    },
    screen: "financeiro",
    related: ["planilha-ou-sistema", "como-escolher-sistema-para-pequenas-empresas", "quanto-custa-um-sistema-para-pequenas-empresas"],
  },
  {
    slug: "como-escolher-sistema-para-pequenas-empresas",
    category: "Sistemas e SaaS",
    question: "Qual o melhor sistema para pequenas empresas?",
    metaTitle: "Qual o melhor sistema para pequena empresa?",
    description:
      "Não existe um sistema ideal para todos. Veja os critérios para escolher o certo para a sua pequena empresa e em quais casos o Prime Ges se encaixa.",
    answer:
      "O melhor sistema é o que resolve a rotina do seu negócio e que a equipe realmente usa. Antes de comparar nomes, liste o que você precisa controlar: vendas, caixa, estoque, agenda, contas, nota fiscal, venda pela internet.",
    sections: [
      {
        heading: "Perguntas para fazer antes de escolher",
        items: [
          "Preciso emitir nota fiscal pelo próprio sistema?",
          "Vendo em marketplaces ou só no balcão e no atendimento?",
          "Presto serviço com horário marcado?",
          "Quantas pessoas vão usar e o que cada uma pode ver?",
          "Consigo testar antes de pagar?",
        ],
      },
      {
        heading: "Erros comuns",
        paragraphs: [
          "Escolher pela maior lista de recursos costuma sair caro e confuso. Outro erro é olhar só o preço inicial e ignorar cobranças por usuário, por nota ou renovação automática.",
        ],
      },
    ],
    prime: {
      intro: "O Prime Ges é uma boa escolha para quem vende no balcão ou presta serviços e quer tudo ligado, de forma simples.",
      points: [
        "Do orçamento ao caixa: proposta em PDF, agenda, venda, estoque e financeiro no mesmo lugar.",
        "Fidelidade com níveis, campanhas e resgate de pontos já faz parte do sistema.",
        "Permissões por função: proprietário, administrador e funcionário.",
        "Controle de funcionários, presença, vales e pagamentos para uso interno.",
      ],
    },
    limit:
      "O Prime Ges não emite nota fiscal e não tem ligação com marketplaces. Se isso é indispensável, procure um sistema fiscal ou de comércio eletrônico.",
    screen: "relatorios",
    related: ["quanto-custa-um-sistema-para-pequenas-empresas", "o-que-e-erp", "sistema-gratuito-para-pequenas-empresas"],
  },
  {
    slug: "quanto-custa-um-sistema-para-pequenas-empresas",
    category: "Sistemas e SaaS",
    question: "Quanto custa um sistema para pequenas empresas?",
    metaTitle: "Quanto custa um sistema de gestão",
    description:
      "Entenda o que pesa no preço de um sistema para pequenas empresas, quais cobranças extras conferir e veja os planos atuais do Prime Ges.",
    answer:
      "O preço varia conforme os recursos, o número de usuários e a forma de cobrança. Compare o custo do período inteiro, incluindo implantação, usuários extras e emissão de documentos. Os valores atuais do Prime Ges estão logo abaixo.",
    sections: [
      {
        heading: "O que costuma mudar o preço",
        items: [
          "Quantidade de pessoas com acesso.",
          "Módulos contratados separadamente.",
          "Cobrança por nota ou documento emitido.",
          "Taxa de implantação ou treinamento.",
          "Fidelidade de contrato e multa para sair.",
        ],
      },
      {
        heading: "Como comparar",
        paragraphs: ["Coloque as opções lado a lado pelo mesmo período e com o mesmo número de usuários. Pergunte o que acontece no fim do período e como se cancela."],
      },
    ],
    prime: {
      intro: "No Prime Ges você vê o preço antes de criar a conta.",
      points: [
        "Planos por período, pagos por Pix gerado dentro da plataforma.",
        "Sem renovação automática: para continuar, você faz um novo pagamento.",
        "Cada cobrança tem um número de ordem e um botão de ajuda ligado a ela.",
        "Teste grátis antes de assinar.",
      ],
    },
    showPlans: true,
    related: ["sistema-gratuito-para-pequenas-empresas", "como-escolher-sistema-para-pequenas-empresas", "saas-vale-a-pena-para-pequenas-empresas"],
  },
  {
    slug: "sistema-gratuito-para-pequenas-empresas",
    category: "Sistemas e SaaS",
    question: "Existe sistema gratuito para pequenas empresas?",
    metaTitle: "Sistema gratuito para pequenas empresas",
    description:
      "Existem opções gratuitas, geralmente com limites. Veja o que conferir antes de usar um sistema grátis e como testar o Prime Ges sem pagar.",
    answer:
      "Existem sistemas com plano gratuito, quase sempre com limites de recursos, usuários ou volume. O Prime Ges não é gratuito: ele oferece um teste grátis e depois planos pagos por período.",
    sections: [
      {
        heading: "O que conferir em uma opção gratuita",
        items: [
          "Quais recursos ficam bloqueados.",
          "Quantos produtos, vendas ou usuários são permitidos.",
          "Se existe suporte quando algo dá errado.",
          "Como retirar seus dados caso resolva mudar.",
          "Como o fornecedor se mantém.",
        ],
      },
      {
        heading: "O custo que não aparece",
        paragraphs: ["Tempo gasto contornando limites, informação duplicada em planilhas e falta de suporte também custam. Compare o que cada opção economiza no dia a dia."],
      },
    ],
    prime: {
      intro: "O teste grátis do Prime Ges serve para decidir com a sua rotina de verdade.",
      points: [
        "Experimente os módulos antes de pagar.",
        "Planos pagos incluem usuários adicionais e suporte por e-mail.",
        "Sem cobrança automática ao fim do teste ou do plano.",
      ],
    },
    limit: "O teste é concedido uma vez por pessoa e não inclui suporte nem usuários adicionais.",
    related: ["quanto-custa-um-sistema-para-pequenas-empresas", "planilha-ou-sistema", "sistema-de-gestao-para-mei"],
  },
  {
    slug: "o-que-e-erp",
    category: "Sistemas e SaaS",
    question: "O que é ERP e uma pequena empresa precisa de um?",
    metaTitle: "O que é ERP para pequenas empresas",
    description:
      "ERP é um sistema que liga vendas, estoque e financeiro. Veja quando a pequena empresa precisa de um e o que um sistema de gestão simples já resolve.",
    answer:
      "ERP é um sistema de gestão que liga as áreas da empresa, como vendas, estoque, compras e financeiro, para que a informação entre uma vez só. A pequena empresa precisa disso quando essas áreas já dependem umas das outras e o retrabalho aparece.",
    sections: [
      {
        heading: "ERP grande e sistema de gestão simples",
        paragraphs: [
          "ERPs corporativos cobrem produção, fiscal e muitas customizações, com implantação longa. Para um comércio ou prestador de serviços pequeno, um sistema de gestão enxuto costuma atender o essencial sem projeto de implantação.",
        ],
      },
      {
        heading: "O que o essencial precisa ligar",
        items: ["A venda com a baixa do estoque.", "O recebimento com o caixa e o financeiro.", "A compra com a entrada de mercadoria e a conta a pagar.", "Os relatórios com os mesmos registros."],
      },
    ],
    prime: {
      intro: "O Prime Ges liga essas pontas para o tamanho de uma pequena empresa.",
      points: [
        "Pedido ao fornecedor, recebimento, estoque e conta a pagar em sequência.",
        "Venda com baixa de estoque, entrada no caixa e receita no financeiro.",
        "Relatórios de faturamento, recebimentos e itens que mais faturaram.",
        "Contas a pagar e a receber, categorias, centros de custo e DRE simplificada.",
      ],
    },
    limit: "Não emite nota fiscal, não substitui a contabilidade e não controla produção industrial.",
    screen: "compra",
    related: ["como-escolher-sistema-para-pequenas-empresas", "como-controlar-estoque", "como-organizar-o-financeiro"],
  },
  {
    slug: "sistema-online-ou-instalado",
    category: "Sistemas e SaaS",
    question: "Sistema on-line ou instalado: qual é melhor para a pequena empresa?",
    metaTitle: "Sistema on-line ou instalado?",
    description:
      "Compare sistema on-line e sistema instalado no computador: acesso, backup, atualizações, custo e o que acontece quando a internet cai.",
    answer:
      "O sistema on-line é mais prático para quem quer acessar de qualquer aparelho e não cuidar de servidor. O instalado pode funcionar sem internet, mas deixa com você o backup, as atualizações e o risco de perder o computador.",
    sections: [
      {
        heading: "On-line",
        items: ["Acesso pelo computador e pelo celular.", "Atualizações feitas pelo fornecedor.", "Depende de internet.", "Costuma ser cobrado por período."],
      },
      {
        heading: "Instalado",
        items: ["Funciona no computador onde foi instalado.", "Backup e manutenção por sua conta.", "Atualizar pode exigir visita ou reinstalação.", "Acessar de fora é mais difícil."],
      },
    ],
    prime: {
      intro: "O Prime Ges é on-line para você acompanhar o negócio de onde estiver.",
      points: [
        "Funciona no navegador e como aplicativo na tela inicial do celular.",
        "Nada para instalar ou atualizar no computador da loja.",
        "Várias pessoas usam ao mesmo tempo, cada uma com a sua função.",
      ],
    },
    limit: "Precisa de internet: não há modo de venda sem conexão.",
    screen: "venda",
    related: ["o-que-e-saas", "saas-vale-a-pena-para-pequenas-empresas", "planilha-ou-sistema"],
  },
  {
    slug: "sistema-de-gestao-para-mei",
    category: "Sistemas e SaaS",
    question: "Qual sistema de gestão usar sendo MEI?",
    metaTitle: "Sistema de gestão para MEI",
    description:
      "O MEI precisa de um sistema simples para vendas, caixa e clientes. Veja o que controlar, o que fica com os canais oficiais e como o Prime Ges ajuda.",
    answer:
      "O MEI se beneficia de um sistema simples, que registre o que entra e o que sai, guarde os clientes e mostre o resultado do mês. Obrigações como guia mensal, declaração anual e documentos fiscais continuam nos canais oficiais ou com o contador.",
    sections: [
      {
        heading: "O que o MEI precisa controlar",
        items: ["Cada venda ou serviço prestado.", "Entradas e saídas, separadas do dinheiro pessoal.", "Contas a pagar e a receber.", "Clientes e o histórico deles."],
      },
      {
        heading: "Separe a empresa da casa",
        paragraphs: ["Misturar dinheiro pessoal com o do negócio é o que mais esconde o resultado. Registre as retiradas como saída e acompanhe o saldo do caixa."],
      },
    ],
    prime: {
      intro: "O Prime Ges atende o MEI que trabalha sozinho e continua servindo quando entra mais gente.",
      points: [
        "Venda, orçamento em PDF e agenda para quem presta serviços.",
        "Caixa e financeiro para ver o resultado do mês sem montar planilha.",
        "Cadastro de clientes com histórico, ranking e fidelidade.",
        "Planos pagos aceitam usuários adicionais quando a equipe crescer.",
      ],
    },
    limit: "Não emite nota fiscal e não substitui o contador nem os canais oficiais do MEI.",
    screen: "financeiro",
    related: ["como-organizar-o-financeiro", "como-fazer-controle-de-vendas", "sistema-gratuito-para-pequenas-empresas"],
  },
  {
    slug: "planilha-ou-sistema",
    category: "Rotina da empresa",
    question: "Planilha ou sistema: o que usar na pequena empresa?",
    metaTitle: "Planilha ou sistema de gestão?",
    description:
      "A planilha resolve o começo; o sistema evita retrabalho quando a empresa cresce. Veja os sinais de que está na hora de trocar.",
    answer:
      "A planilha serve bem para começar e para análises pontuais. O sistema passa a valer quando várias pessoas lançam dados, quando venda, estoque e caixa precisam bater, ou quando erros de digitação começam a custar dinheiro.",
    sections: [
      {
        heading: "Onde a planilha costuma falhar",
        items: ["Fórmulas quebradas sem ninguém perceber.", "Duas versões do mesmo arquivo.", "Estoque que não baixa com a venda.", "Sem controle de quem alterou o quê."],
      },
      {
        heading: "Como migrar sem parar",
        paragraphs: ["Comece pelo cadastro dos itens mais vendidos, escolha uma data para registrar tudo no sistema e confira o caixa todos os dias na primeira semana."],
      },
    ],
    prime: {
      intro: "No Prime Ges a informação entra uma vez e aparece onde precisa.",
      points: [
        "A venda concluída baixa o estoque e lança no caixa e no financeiro.",
        "Alerta de estoque baixo por produto.",
        "Relatórios prontos, com exportação em CSV quando você quiser analisar em planilha.",
        "Cada pessoa entra com a própria conta e função.",
      ],
    },
    screen: "estoque",
    related: ["como-controlar-estoque", "como-fazer-controle-de-vendas", "como-controlar-o-fluxo-de-caixa"],
  },
  {
    slug: "como-controlar-estoque",
    category: "Rotina da empresa",
    question: "Como fazer o controle de estoque de uma pequena empresa?",
    metaTitle: "Como controlar estoque na pequena empresa",
    description:
      "Passo a passo para controlar o estoque: cadastro, quantidade mínima, entradas, saídas e contagem. E como automatizar a baixa a cada venda.",
    answer:
      "Cadastre cada produto com unidade, custo e preço, defina a quantidade mínima, registre toda entrada e saída e faça contagens periódicas para conferir o saldo com a prateleira.",
    sections: [
      {
        heading: "Passo a passo",
        items: [
          "Cadastre os produtos, com categoria, código e unidade.",
          "Faça uma contagem inicial.",
          "Defina o estoque mínimo dos itens que não podem faltar.",
          "Registre a entrada quando a mercadoria chegar.",
          "Baixe a saída no momento da venda.",
          "Conte de tempos em tempos e ajuste as diferenças anotando o motivo.",
        ],
      },
      {
        heading: "Comece pelo que mais gira",
        paragraphs: ["Os itens que mais vendem e os mais caros merecem conferência mais frequente. Eles concentram o prejuízo quando faltam ou somem."],
      },
    ],
    prime: {
      intro: "O Prime Ges tira o controle de estoque da memória.",
      points: [
        "A venda concluída baixa o saldo automaticamente.",
        "Quantidade mínima por produto, com destaque para estoque baixo.",
        "Busca por nome, código interno ou código de barras.",
        "Entrada de mercadoria, ajuste manual e histórico de movimentações.",
        "O recebimento de uma compra atualiza o estoque e cria a conta a pagar.",
      ],
    },
    screen: "estoque",
    related: ["planilha-ou-sistema", "sistema-para-mercadinho", "o-que-e-erp"],
  },
  {
    slug: "como-controlar-o-fluxo-de-caixa",
    category: "Rotina da empresa",
    question: "Como controlar o fluxo de caixa de uma pequena empresa?",
    metaTitle: "Como controlar o fluxo de caixa",
    description:
      "Como fazer um fluxo de caixa simples: saldo inicial, entradas, saídas e saldo final, com abertura e fechamento diário do caixa.",
    answer:
      "Anote o saldo inicial, registre todas as entradas e saídas no dia em que acontecem e confira o saldo final com o dinheiro que existe. Acrescente as contas que ainda vão vencer para enxergar os próximos dias.",
    sections: [
      {
        heading: "Os quatro itens básicos",
        items: ["Saldo inicial.", "Entradas: vendas e recebimentos.", "Saídas: compras, despesas e retiradas.", "Saldo final."],
      },
      {
        heading: "Rotina que funciona",
        paragraphs: ["Abra o caixa no começo do expediente, lance sangrias e despesas na hora e feche no fim do dia. Uma diferença encontrada no mesmo dia é muito mais fácil de explicar."],
      },
    ],
    prime: {
      intro: "O Prime Ges organiza o caixa do dia e o que vem depois.",
      points: [
        "Abertura, movimentações e fechamento com o saldo esperado.",
        "Pagamentos das vendas entram no caixa aberto.",
        "Dinheiro, Pix, cartão e transferência registrados por forma de pagamento.",
        "Contas a pagar e a receber e o resultado do mês no financeiro.",
      ],
    },
    limit: "O cartão é registrado como recebimento feito fora do sistema, na sua maquininha.",
    screen: "caixa",
    related: ["como-organizar-o-financeiro", "como-fazer-controle-de-vendas", "planilha-ou-sistema"],
  },
  {
    slug: "como-fazer-controle-de-vendas",
    category: "Rotina da empresa",
    question: "Como fazer o controle de vendas de uma pequena empresa?",
    metaTitle: "Como fazer controle de vendas",
    description:
      "O que anotar em cada venda, como acompanhar o faturamento e como sair do caderno e da planilha sem complicar o atendimento.",
    answer:
      "Registre em cada venda a data, os itens, o valor, o desconto, a forma de pagamento e o cliente quando possível. Depois acompanhe o total por dia, os itens que mais vendem e o que ainda falta receber.",
    sections: [
      {
        heading: "O que não pode faltar no registro",
        items: ["Itens e quantidades.", "Preço e desconto.", "Forma e situação do pagamento.", "Cliente, para vender de novo."],
      },
      {
        heading: "Do caderno ao sistema",
        paragraphs: ["O segredo é registrar no momento do atendimento. Se a venda fica para depois, o caderno, a planilha e o sistema falham do mesmo jeito."],
      },
    ],
    prime: {
      intro: "No Prime Ges cada venda já alimenta o restante da gestão.",
      points: [
        "Produtos e serviços na mesma venda, com desconto e cancelamento.",
        "Faturamento por dia, ticket médio e itens que mais faturaram.",
        "Ranking de clientes e pontos de fidelidade.",
        "Estoque, caixa e financeiro atualizados pelo mesmo registro.",
      ],
    },
    screen: "venda",
    related: ["como-controlar-o-fluxo-de-caixa", "como-controlar-estoque", "como-organizar-o-financeiro"],
  },
  {
    slug: "como-organizar-o-financeiro",
    category: "Rotina da empresa",
    question: "Como organizar o financeiro de uma empresa pequena?",
    metaTitle: "Como organizar o financeiro",
    description:
      "Separe contas pessoais, registre entradas e saídas, acompanhe o que vence e veja o resultado do mês. Um roteiro simples para a pequena empresa.",
    answer:
      "Separe o dinheiro da empresa do pessoal, registre tudo o que entra e sai, mantenha uma lista do que vence e feche o mês olhando o resultado, não apenas o saldo da conta.",
    sections: [
      {
        heading: "Roteiro semanal",
        items: ["Conferir o caixa.", "Ver contas a pagar da semana.", "Cobrar o que está a receber.", "Classificar as despesas por categoria."],
      },
      {
        heading: "No fim do mês",
        paragraphs: ["Compare receitas e despesas por categoria. É isso que mostra onde cortar e se o preço praticado está sustentando o negócio."],
      },
    ],
    prime: {
      intro: "O financeiro do Prime Ges recebe os lançamentos das vendas e compras, sem redigitar.",
      points: [
        "Contas a pagar e a receber com vencimento.",
        "Categorias e centros de custo.",
        "DRE simplificada e relatórios do período.",
        "Acesso ao financeiro restrito a proprietário e administrador.",
      ],
    },
    limit: "É uma ferramenta de gestão: não substitui a contabilidade.",
    screen: "financeiro",
    related: ["como-controlar-o-fluxo-de-caixa", "sistema-de-gestao-para-mei", "o-que-e-erp"],
  },
  {
    slug: "sistema-para-lava-rapido",
    category: "Por tipo de negócio",
    question: "Qual sistema usar em um lava-rápido?",
    metaTitle: "Sistema para lava-rápido",
    description:
      "O que um sistema para lava-rápido precisa ter: clientes, serviços, agenda, caixa e fidelidade. Veja como o Prime Ges organiza essa rotina.",
    answer:
      "Um lava-rápido precisa de cadastro de clientes e serviços, horários por profissional, registro da venda, caixa do dia e um jeito de fazer o cliente voltar.",
    sections: [
      {
        heading: "Problemas comuns",
        items: ["Horários marcados só na conversa.", "Serviço feito e não cobrado.", "Cliente que some sem ninguém perceber.", "Caixa sem conferência no fim do dia."],
      },
    ],
    prime: {
      intro: "O Prime Ges acompanha o atendimento do horário marcado ao caixa.",
      points: [
        "Agenda por profissional, com atendimento concluído virando venda.",
        "Assistente por chat para marcar horários, escrevendo ou ditando.",
        "Fidelidade com pontos, níveis e campanhas.",
        "Ranking e sorteio entre clientes.",
        "Orçamento em PDF para os serviços maiores.",
      ],
    },
    screen: "agenda",
    related: ["como-controlar-o-fluxo-de-caixa", "como-fazer-controle-de-vendas", "como-escolher-sistema-para-pequenas-empresas"],
  },
  {
    slug: "sistema-para-mercadinho",
    category: "Por tipo de negócio",
    question: "Qual sistema usar em um mercadinho ou mercearia?",
    metaTitle: "Sistema para mercadinho",
    description:
      "O que um sistema para mercadinho precisa controlar: estoque, compras, vendas e caixa. Saiba o que o Prime Ges faz e o que ele não faz.",
    answer:
      "Um mercadinho precisa controlar muitos itens, repor antes de faltar, registrar vendas por forma de pagamento e fechar o caixa. Se a venda exige cupom fiscal, é preciso um sistema que emita o documento.",
    sections: [
      {
        heading: "Prioridades",
        items: ["Cadastro por categoria com custo e preço.", "Estoque mínimo dos itens de maior giro.", "Pedidos a fornecedores e contas a pagar.", "Conferência diária do caixa."],
      },
    ],
    prime: {
      intro: "O Prime Ges cuida da parte de gestão do mercadinho.",
      points: [
        "Estoque com mínimo por produto e busca por código de barras.",
        "Compras: pedido, recebimento, entrada no estoque e conta a pagar.",
        "Caixa com abertura, sangria e fechamento.",
        "Relatórios de faturamento e itens que mais faturaram.",
      ],
    },
    limit: "Não emite nota fiscal nem cupom fiscal e não é ligado a balança ou maquininha.",
    screen: "compra",
    related: ["como-controlar-estoque", "como-controlar-o-fluxo-de-caixa", "como-escolher-sistema-para-pequenas-empresas"],
  },
  {
    slug: "sistema-para-padaria",
    category: "Por tipo de negócio",
    question: "Qual sistema usar em uma padaria pequena?",
    metaTitle: "Sistema para padaria pequena",
    description:
      "Veja o que controlar em uma padaria pequena: produtos, estoque, fornecedores, vendas e caixa, e como o Prime Ges organiza o dia.",
    answer:
      "A padaria pequena precisa acompanhar o que vende por dia, o saldo dos produtos e insumos, as compras com fornecedores e o caixa de cada turno.",
    sections: [
      {
        heading: "Onde se perde dinheiro",
        items: ["Compra feita sem olhar o saldo.", "Sobra ou falta nos dias de maior movimento.", "Retiradas do caixa sem anotação.", "Contas de fornecedor esquecidas."],
      },
    ],
    prime: {
      intro: "O Prime Ges liga o balcão ao estoque e às contas.",
      points: [
        "Venda no balcão com baixa de estoque.",
        "Caixa por turno, com o saldo esperado no fechamento.",
        "Fornecedores, pedidos de compra e contas a pagar.",
        "Faturamento por dia para planejar a produção.",
        "Controle de presença, vales e pagamentos da equipe.",
      ],
    },
    limit: "Não emite nota fiscal e não calcula receitas nem ordens de produção.",
    screen: "caixa",
    related: ["como-controlar-estoque", "como-controlar-o-fluxo-de-caixa", "sistema-para-mercadinho"],
  },
];

const BY_SLUG = new Map(DOUBTS.map((doubt) => [doubt.slug, doubt]));

export function getDoubt(slug: string): Doubt | null {
  return BY_SLUG.get(slug) ?? null;
}

export function doubtPath(slug: string): string {
  return `/duvidas/${slug}`;
}
