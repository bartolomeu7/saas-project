import type { LegalDocument } from "./types";

const BLOCKED = "[BLOCKED — DADO EMPRESARIAL NECESSÁRIO]";
const REVIEW = "[VALIDAÇÃO JURÍDICA NECESSÁRIA]";

/**
 * Termos de Uso do Prime Ges — texto ORIGINAL, escrito a partir do funcionamento real do
 * produto (módulos, planos por período, pagamento por Pix, autenticação Clerk). Não é cópia
 * nem adaptação de documento de terceiros e NÃO é parecer jurídico: os pontos marcados
 * precisam de revisão por advogado antes de Production.
 */
export const termsOfUse: LegalDocument = {
  type: "TERMS_OF_USE",
  slug: "termos-de-uso",
  title: "Termos de Uso",
  version: "1.0.0-rc.2",
  effectiveAt: "2026-10-08",
  summary:
    "Regras para usar o Prime Ges: conta, planos e pagamento, uso permitido, responsabilidades e encerramento.",
  sections: [
    {
      id: "objeto",
      title: "Objeto e aceite",
      paragraphs: [
        "Estes Termos de Uso regulam o acesso e o uso do Prime Ges, plataforma online de gestão para pequenos negócios, oferecida pela pessoa jurídica identificada na seção \"Identificação do prestador\" (a \"Prime Ges\").",
        "Ao criar uma conta ou continuar usando a plataforma, você declara que leu e aceita estes Termos. O aceite é registrado de forma versionada: guardamos qual versão deste documento estava vigente, a data e o contexto do aceite.",
        "A Política de Privacidade, publicada separadamente, explica como os dados são tratados. Ela é lida em conjunto com estes Termos, mas é um documento distinto.",
      ],
    },
    {
      id: "definicoes",
      title: "Definições",
      paragraphs: ["Para facilitar a leitura, estes termos têm o significado abaixo sempre que aparecerem com inicial maiúscula:"],
      items: [
        "Plataforma: o software Prime Ges e seus módulos, acessados pela internet;",
        "Usuário: a pessoa que cria conta ou é vinculada a uma empresa na Plataforma;",
        "Empresa: o negócio cujo ambiente é administrado na Plataforma;",
        "Ambiente: o espaço de dados e configurações de uma Empresa, separado dos demais;",
        "Plano: o pacote de acesso por período determinado contratado pela Empresa;",
        "Dados da Empresa: informações que a Empresa ou seus Usuários inserem na Plataforma.",
      ],
    },
    {
      id: "servico",
      title: "O que é o serviço",
      paragraphs: [
        "O Prime Ges é um software acessado pela internet (modelo SaaS). Ele permite organizar, em um ambiente por empresa, informações como clientes, produtos, serviços, vendas, fidelidade, caixa, estoque, compras, fornecedores, agenda, equipe, financeiro e relatórios.",
        "Os módulos disponíveis podem variar conforme o plano contratado e a versão da plataforma. Funcionalidades apresentadas como \"em desenvolvimento\" ainda não fazem parte do serviço e não geram obrigação de entrega ou de prazo.",
        "O Prime Ges é uma ferramenta de apoio à gestão. Ele não substitui contabilidade, assessoria jurídica ou fiscal, nem emite documentos fiscais por conta do usuário, salvo se isso for expressamente disponibilizado na plataforma.",
      ],
    },
    {
      id: "conta",
      title: "Conta, empresa e acesso",
      paragraphs: [
        "Para usar o Prime Ges é preciso criar uma conta. A autenticação (login, senha e login social, quando oferecido) é feita por um provedor especializado, o Clerk. A Prime Ges não armazena a sua senha.",
        "Cada conta pertence a uma empresa (o \"ambiente\" da empresa). O proprietário do ambiente pode vincular outras pessoas que já tenham conta no Prime Ges, atribuindo funções (por exemplo, administrador ou funcionário). Quem vincula pessoas é responsável por ter autorização para isso e por revisar os acessos concedidos.",
        "Você é responsável por manter seus dados de acesso em sigilo e por tudo que for feito com a sua conta. Avise-nos imediatamente se suspeitar de uso não autorizado.",
        "Você declara ser maior de 18 anos e ter poderes para contratar em nome da empresa que cadastra. " + REVIEW,
      ],
    },
    {
      id: "planos",
      title: "Planos, período de acesso e pagamento",
      paragraphs: [
        "O Prime Ges é oferecido em planos de acesso por período determinado, apresentados na página inicial e na área de assinatura. Hoje há um teste gratuito de curta duração e planos pagos com períodos de 31, 93 e 365 dias, além de um plano sob medida, sob consulta. Valores, períodos e benefícios de cada plano são os exibidos no momento da contratação.",
        "O pagamento dos planos pagos é feito por Pix, por meio de um prestador de pagamentos. O acesso do período é liberado depois da confirmação do pagamento. A confirmação pode levar alguns instantes e depende do prestador e do sistema bancário.",
        "Ao fim do período contratado, o acesso às funcionalidades é bloqueado até que um novo período seja contratado. A renovação depende de um novo pagamento; atualmente não há cobrança recorrente automática.",
        "Podemos alterar preços e condições de planos para períodos futuros. A mudança não afeta um período já pago.",
        "Regras de cancelamento antecipado, reembolso e direito de arrependimento: " + REVIEW + " (decisão comercial e jurídica pendente; não há política definida neste texto).",
      ],
    },
    {
      id: "uso-permitido",
      title: "Uso permitido",
      paragraphs: ["Você pode usar o Prime Ges para administrar a sua própria operação, respeitando estes Termos e a lei."],
      items: [
        "usar a plataforma apenas para finalidades lícitas e relacionadas à gestão do seu negócio;",
        "cadastrar somente dados que você tenha direito de tratar;",
        "manter as informações da empresa e dos usuários atualizadas;",
        "respeitar os limites de usuários e de recursos do plano contratado.",
      ],
    },
    {
      id: "uso-proibido",
      title: "Uso proibido",
      paragraphs: ["É proibido, entre outras condutas:"],
      items: [
        "tentar acessar dados de outras empresas, burlar controles de acesso ou explorar falhas de segurança;",
        "fazer engenharia reversa, copiar, revender ou sublicenciar a plataforma sem autorização;",
        "enviar conteúdo ilegal, que viole direitos de terceiros ou que contenha código malicioso;",
        "sobrecarregar a plataforma com automações ou acessos abusivos;",
        "usar o serviço para fraudes, lavagem de dinheiro ou qualquer atividade ilícita;",
        "compartilhar a conta de forma que prejudique a segurança ou ultrapasse os limites do plano.",
      ],
    },
    {
      id: "conteudo",
      title: "Seus dados e conteúdo",
      paragraphs: [
        "Os dados e conteúdos que você insere no Prime Ges (por exemplo, cadastros de clientes, produtos, vendas e movimentações) continuam sendo seus. Você nos autoriza a armazená-los e processá-los apenas para prestar o serviço, conforme a Política de Privacidade.",
        "Você é o responsável pelo conteúdo que cadastra e pelas informações de terceiros (como os seus clientes) que inclui na plataforma, inclusive por ter base legal para tratá-las. Nesse caso, em regra, a empresa usuária é a controladora desses dados e a Prime Ges atua em nome dela. " + REVIEW,
        "Recomendamos que você mantenha cópias das informações que considerar críticas para o seu negócio.",
      ],
    },
    {
      id: "propriedade",
      title: "Propriedade intelectual",
      paragraphs: [
        "O software, a marca, o layout e os demais elementos do Prime Ges pertencem à Prime Ges ou a seus licenciantes. Estes Termos concedem a você apenas um direito de uso pessoal, limitado, não exclusivo e intransferível, pelo período do plano contratado.",
      ],
    },
    {
      id: "seguranca",
      title: "Segurança e disponibilidade",
      paragraphs: [
        "Adotamos medidas técnicas e organizacionais razoáveis para proteger a plataforma, incluindo separação dos dados por empresa e controle de acesso por funções. Nenhum sistema é totalmente imune a falhas ou ataques.",
        "Buscamos manter o serviço disponível, mas ele pode ficar indisponível por manutenção, falha de terceiros ou eventos fora do nosso controle. Atualmente não oferecemos um acordo de nível de serviço (SLA) com garantia de disponibilidade. " + REVIEW,
      ],
    },
    {
      id: "terceiros",
      title: "Serviços de terceiros",
      paragraphs: [
        "O Prime Ges depende de prestadores como o Clerk (autenticação), o Supabase (banco de dados), a Vercel (hospedagem) e um prestador de pagamentos Pix. Esses serviços têm termos próprios e podem sofrer interrupções ou mudanças que afetem a plataforma.",
        "A Prime Ges não se responsabiliza por falhas exclusivamente atribuíveis a esses terceiros, nos limites permitidos em lei. " + REVIEW,
      ],
    },
    {
      id: "suporte",
      title: "Suporte e comunicações",
      paragraphs: [
        "Os planos pagos incluem suporte por e-mail, conforme descrito na página de planos. O teste gratuito não inclui suporte.",
        "Podemos enviar comunicações necessárias ao serviço (avisos de segurança, de cobrança, de alteração destes Termos). Comunicações de marketing, se existirem, dependerão de consentimento próprio e opcional, separado destes Termos.",
        "Canal oficial de suporte: " + BLOCKED + ".",
      ],
    },
    {
      id: "suspensao",
      title: "Suspensão e encerramento",
      paragraphs: [
        "Podemos suspender ou encerrar uma conta, de forma proporcional, em caso de violação destes Termos, risco à segurança, uso fraudulento ou determinação legal. Sempre que possível, avisaremos antes ou logo depois da medida.",
        "Você pode deixar de usar o serviço a qualquer momento. Ao final do período pago, o acesso é bloqueado conforme a seção \"Planos, período de acesso e pagamento\".",
        "Prazos de guarda e eliminação dos dados depois do encerramento: " + REVIEW + " (ver Política de Privacidade).",
      ],
    },
    {
      id: "responsabilidade",
      title: "Limitação de responsabilidade",
      paragraphs: [
        "Na extensão permitida pela lei, a Prime Ges não responde por lucros cessantes, perda de oportunidade ou danos indiretos decorrentes do uso ou da impossibilidade de uso da plataforma, nem por decisões de negócio tomadas com base nas informações nela registradas.",
        "Nada nestes Termos exclui responsabilidades que a lei não permita limitar. " + REVIEW,
      ],
    },
    {
      id: "alteracoes",
      title: "Alterações destes Termos",
      paragraphs: [
        "Podemos atualizar estes Termos. Cada versão tem número e data de vigência. Em alterações materiais, publicaremos uma nova versão e poderemos pedir que você aceite novamente antes de continuar usando a plataforma. O histórico dos seus aceites anteriores é mantido.",
      ],
    },
    {
      id: "privacidade",
      title: "Proteção de dados",
      paragraphs: [
        "O tratamento de dados pessoais segue a Política de Privacidade e a Lei Geral de Proteção de Dados (Lei nº 13.709/2018). Ler a Política de Privacidade é parte do cadastro, mas a ciência dela é registrada separadamente do aceite destes Termos.",
      ],
    },
    {
      id: "lei-foro",
      title: "Lei aplicável e foro",
      paragraphs: [
        "Estes Termos são regidos pelas leis da República Federativa do Brasil.",
        "Foro competente para resolver controvérsias: " + BLOCKED + ". " + REVIEW,
      ],
    },
    {
      id: "identificacao",
      title: "Identificação do prestador",
      paragraphs: [
        "Razão social: " + BLOCKED + ".",
        "CNPJ: " + BLOCKED + ".",
        "Endereço: " + BLOCKED + ".",
        "E-mail de contato: " + BLOCKED + ".",
      ],
    },
  ],
};
