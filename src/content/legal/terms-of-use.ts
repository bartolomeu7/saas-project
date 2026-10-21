import type { LegalDocument } from "./types";

const BLOCKED = "[BLOCKED — DADO EMPRESARIAL NECESSÁRIO]";

/**
 * Termos de Uso do Prime Ges — texto ORIGINAL, escrito a partir do funcionamento real do
 * produto (módulos, planos por período, pagamento por Pix, autenticação Clerk). Não é cópia
 * nem adaptação de documento de terceiros e não substitui aconselhamento jurídico: recomenda-se
 * a revisão por advogado antes da publicação.
 *
 * As seções "planos", "cancelamento", "arrependimento", "reembolso-outros" e "reembolso-como"
 * também alimentam a página pública /politica-de-reembolso (ver src/lib/legal/documents.ts):
 * uma única fonte, um único hash.
 *
 * Os únicos marcadores pendentes são dados da empresa (BLOCKED). Eles não podem ser inventados.
 */
export const termsOfUse: LegalDocument = {
  type: "TERMS_OF_USE",
  slug: "termos-de-uso",
  title: "Termos de Uso",
  version: "1.0.0-rc.3",
  effectiveAt: "2026-10-22",
  summary:
    "Regras para usar o Prime Ges: conta, planos e pagamento, cancelamento e reembolso, uso permitido, responsabilidades e encerramento.",
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
        "Você declara ser maior de 18 anos, ter capacidade para contratar e ter poderes para contratar em nome da empresa que cadastra. As informações do cadastro devem ser verdadeiras e atualizadas.",
        "O plano limita quantas sessões de login simultâneas a conta pode manter. Ao passar do limite, a sessão excedente é bloqueada.",
      ],
    },
    {
      id: "planos",
      title: "Planos, período de acesso e pagamento",
      paragraphs: [
        "O Prime Ges é oferecido em planos de acesso por período determinado, apresentados na página inicial e na área de assinatura. Hoje há um teste gratuito de curta duração e planos pagos com períodos de 31, 93 e 365 dias, além de um plano sob medida, sob consulta. Valores, períodos e benefícios de cada plano são os exibidos no momento da contratação, em reais, e o preço final é mostrado antes de você pagar.",
        "O teste gratuito é concedido uma vez por pessoa, não tem custo, não pede dados de pagamento e há limite de cadastros por conexão para evitar abuso.",
        "O pagamento dos planos pagos é feito por Pix, por meio de um prestador de pagamentos. O acesso do período é liberado depois da confirmação do pagamento. A confirmação pode levar alguns instantes e depende do prestador e do sistema bancário.",
        "Ao fim do período contratado, o acesso às funcionalidades é bloqueado até que um novo período seja contratado. A renovação depende de um novo pagamento: não há cobrança recorrente automática, nem cobrança sem a sua ação.",
        "Podemos alterar preços e condições de planos para períodos futuros. A mudança não afeta um período já pago.",
        "As regras de cancelamento, arrependimento e reembolso estão nas próximas seções e valem para todos os planos pagos.",
      ],
    },
    {
      id: "cancelamento",
      title: "Cancelamento",
      paragraphs: [
        "Como não há cobrança recorrente automática, você não precisa cancelar nada para evitar novas cobranças: basta não contratar um novo período.",
        "Você pode deixar de usar o serviço a qualquer momento. Depois do prazo de arrependimento (próxima seção), o período já pago continua valendo e você mantém o acesso até o último dia dele; não devolvemos valor proporcional pelos dias não usados, exceto nos casos da seção \"Outros casos de reembolso\".",
        "Se você quiser encerrar a conta e eliminar os seus dados, peça pelo canal de atendimento. Veja a Política de Privacidade para os prazos de guarda e eliminação.",
      ],
    },
    {
      id: "arrependimento",
      title: "Direito de arrependimento (7 dias)",
      paragraphs: [
        "Como a contratação é feita pela internet, você pode desistir de qualquer plano pago, sem precisar dar motivo, em até 7 (sete) dias corridos contados da confirmação do pagamento, conforme o art. 49 do Código de Defesa do Consumidor (Lei nº 8.078/1990).",
        "Se você desistir nesse prazo, devolvemos 100% do valor pago, inclusive se já tiver usado a plataforma nesse período. Não cobramos multa, taxa de cancelamento nem descontamos o período usado. O acesso ao período desistido é encerrado.",
        "Concedemos esse direito a toda contratação de plano pago, inclusive quando a contratante for pessoa jurídica ou microempreendedor individual e a lei de consumo não se aplicar por si só: neste caso, a regra vale como compromisso contratual nosso.",
        "O teste gratuito não tem pagamento e, por isso, não tem reembolso.",
      ],
    },
    {
      id: "reembolso-outros",
      title: "Outros casos de reembolso",
      paragraphs: [
        "Mesmo depois dos 7 dias, devolvemos o valor ou a diferença nos casos abaixo. Não há reembolso do período quando a conta for suspensa ou encerrada por violação destes Termos, fraude ou determinação legal, salvo se a medida for revista por ter sido indevida.",
      ],
      items: [
        "cobrança em duplicidade ou em valor diferente do exibido na contratação: devolvemos o valor cobrado a mais, e a lei pode prever devolução em dobro quando a cobrança indevida decorrer de erro sem justificativa (art. 42, parágrafo único, do CDC);",
        "pagamento confirmado sem liberação do acesso contratado, caso não consigamos liberá-lo em até 2 dias úteis depois do seu aviso;",
        "falha do serviço de nossa responsabilidade que impeça o uso da plataforma por período relevante: devolvemos o valor proporcional ao período afetado ou estendemos o período, à sua escolha;",
        "suspensão ou encerramento da conta feitos por nós sem que você tenha violado estes Termos: devolvemos o valor proporcional ao período não usufruído.",
      ],
    },
    {
      id: "reembolso-como",
      title: "Como pedir e como recebemos o reembolso",
      paragraphs: [
        "Peça pelo canal de atendimento: " + BLOCKED + ". Informe o e-mail da conta, o nome da empresa e a data e o valor do pagamento (ou o identificador da cobrança, se tiver). Para o arrependimento, basta dizer que quer desistir.",
        "Respondemos o pedido em até 5 dias úteis. Aprovado o pedido, devolvemos o valor por Pix, para a conta de origem do pagamento, em até 10 dias úteis contados da aprovação, sem desconto de tarifas. Se a conta de origem não puder receber a devolução, combinamos com você outra forma de pagamento em seu nome.",
        "Guardamos o registro do pedido e do estorno para a sua comprovação e para as obrigações fiscais, conforme a Política de Privacidade.",
        "Se não ficar satisfeito com a resposta, você pode procurar o Procon, a plataforma consumidor.gov.br ou o Poder Judiciário.",
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
        "respeitar os limites de usuários, de sessões e de recursos do plano contratado.",
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
        "criar várias contas para obter mais de um teste gratuito;",
        "compartilhar a conta de forma que prejudique a segurança ou ultrapasse os limites do plano.",
      ],
    },
    {
      id: "conteudo",
      title: "Seus dados e conteúdo",
      paragraphs: [
        "Os dados e conteúdos que você insere no Prime Ges (por exemplo, cadastros de clientes, produtos, vendas e movimentações) continuam sendo seus. Você nos autoriza a armazená-los e processá-los apenas para prestar o serviço, conforme a Política de Privacidade.",
        "Você é o responsável pelo conteúdo que cadastra e pelas informações de terceiros (como os seus clientes) que inclui na plataforma, inclusive por ter base legal para tratá-las e por atender os pedidos desses titulares. Nesse caso, a empresa usuária é a controladora desses dados e a Prime Ges atua em nome dela, como operadora.",
        "Recomendamos que você mantenha cópias das informações que considerar críticas para o seu negócio. Depois do encerramento da conta, você pode pedir uma cópia dos seus dados dentro do prazo informado na Política de Privacidade.",
      ],
    },
    {
      id: "propriedade",
      title: "Propriedade intelectual",
      paragraphs: [
        "O software, a marca, o layout e os demais elementos do Prime Ges pertencem à Prime Ges ou a seus licenciantes. Estes Termos concedem a você apenas um direito de uso pessoal, limitado, não exclusivo e intransferível, pelo período do plano contratado.",
        "Se você acreditar que algum conteúdo na plataforma viola direito autoral ou outro direito seu, avise pelo canal de atendimento com a identificação do conteúdo e do seu direito, para que possamos analisar e, se for o caso, remover.",
      ],
    },
    {
      id: "seguranca",
      title: "Segurança e disponibilidade",
      paragraphs: [
        "Adotamos medidas técnicas e organizacionais razoáveis para proteger a plataforma, incluindo separação dos dados por empresa e controle de acesso por funções. Nenhum sistema é totalmente imune a falhas ou ataques.",
        "Buscamos manter o serviço disponível, mas ele pode ficar indisponível por manutenção, falha de terceiros ou eventos fora do nosso controle. Atualmente não oferecemos um acordo de nível de serviço (SLA) com garantia de disponibilidade. Quando a indisponibilidade for relevante e de nossa responsabilidade, vale a seção \"Outros casos de reembolso\".",
      ],
    },
    {
      id: "terceiros",
      title: "Serviços de terceiros",
      paragraphs: [
        "O Prime Ges depende de prestadores como o Clerk (autenticação), o Supabase (banco de dados), a Vercel (hospedagem) e um prestador de pagamentos Pix. Esses serviços têm termos próprios e podem sofrer interrupções ou mudanças que afetem a plataforma.",
        "A Prime Ges responde pela escolha e pela contratação desses prestadores, mas não responde por falhas exclusivamente atribuíveis a eles quando não houver falha nossa, nos limites permitidos em lei.",
      ],
    },
    {
      id: "suporte",
      title: "Suporte e comunicações",
      paragraphs: [
        "Os planos pagos incluem suporte por e-mail, conforme descrito na página de planos. O teste gratuito não inclui suporte.",
        "Podemos enviar comunicações necessárias ao serviço (avisos de segurança, de cobrança, de alteração destes Termos). Comunicações de marketing, se existirem, dependerão de consentimento próprio e opcional, separado destes Termos.",
        "Canal oficial de suporte e de atendimento: " + BLOCKED + ".",
      ],
    },
    {
      id: "suspensao",
      title: "Suspensão e encerramento",
      paragraphs: [
        "Podemos suspender ou encerrar uma conta, de forma proporcional, em caso de violação destes Termos, risco à segurança, uso fraudulento ou determinação legal. Sempre que possível, avisaremos antes ou logo depois da medida e você poderá pedir a revisão dela.",
        "Você pode deixar de usar o serviço a qualquer momento. Ao final do período pago, o acesso é bloqueado conforme a seção \"Planos, período de acesso e pagamento\".",
        "Os prazos de guarda e de eliminação dos dados depois do encerramento estão na Política de Privacidade.",
      ],
    },
    {
      id: "responsabilidade",
      title: "Limitação de responsabilidade",
      paragraphs: [
        "A Prime Ges responde pelos danos que causar por falha do serviço, nos termos da lei. Nas relações de consumo, nada nestes Termos reduz os direitos previstos no Código de Defesa do Consumidor.",
        "Nas demais relações, na extensão permitida pela lei e exceto em caso de dolo ou culpa grave, a Prime Ges não responde por lucros cessantes, perda de oportunidade ou danos indiretos decorrentes do uso ou da impossibilidade de uso da plataforma, nem por decisões de negócio tomadas com base nas informações nela registradas. A responsabilidade total fica limitada ao valor pago pela Empresa nos 12 meses anteriores ao fato.",
        "Nada nestes Termos exclui responsabilidades que a lei não permita limitar.",
      ],
    },
    {
      id: "alteracoes",
      title: "Alterações destes Termos",
      paragraphs: [
        "Podemos atualizar estes Termos. Cada versão tem número e data de vigência. Em alterações materiais, publicaremos uma nova versão e poderemos pedir que você aceite novamente antes de continuar usando a plataforma. O histórico dos seus aceites anteriores é mantido. Mudanças não alteram um período já pago em seu prejuízo.",
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
        "Quando o Usuário for consumidor, o foro competente é o do seu domicílio (art. 101, I, do CDC). Nos demais casos, as controvérsias serão resolvidas no foro da comarca de " + BLOCKED + ".",
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
