import type { LegalDocument } from "./types";

const CONTACT = "suporte@primeges.com.br";

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
 * Identificação PROVISÓRIA (Nexora Group, definida pelo dono em 25/11/2026; nenhum nome ou CPF de pessoa é publicado): ainda não há CNPJ nem endereço
 * publicado. Ao abrir a empresa, publicar nova versão. Dados que faltam não são inventados.
 */
export const termsOfUse: LegalDocument = {
  type: "TERMS_OF_USE",
  slug: "termos-de-uso",
  title: "Termos de Uso",
  version: "1.0.0-rc.4",
  effectiveAt: "2026-11-25",
  summary:
    "Regras para usar o Prime Ges: conta, planos e pagamento, cancelamento e reembolso, uso permitido, responsabilidades e encerramento.",
  sections: [
    {
      id: "objeto",
      title: "Objeto e aceite",
      paragraphs: [
        "Estes Termos de Uso regulam o acesso e o uso do Prime Ges, plataforma online de gestão para pequenos negócios, oferecida pelo responsável identificado na seção \"Identificação do prestador\" (a \"Prime Ges\").",
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
        "Cada cobrança gera uma ordem de pagamento com número próprio, que serve de referência para atendimento. Tributos incidentes, quando houver, estão incluídos no preço exibido.",
        "Se um pagamento for estornado, devolvido, contestado ou obtido por fraude, podemos encerrar o período de acesso correspondente. Cobrança em valor diferente do exibido não libera o acesso e é tratada conforme a seção \"Outros casos de reembolso\".",
        "Licenças concedidas por nós como cortesia, teste estendido ou acesso \"vitalício\" valem nas condições informadas na concessão. \"Vitalício\" significa sem data de vencimento enquanto o serviço for oferecido, não pela vida da pessoa; é pessoal da empresa que o recebeu, não pode ser vendido ou transferido e pode ser encerrado por violação destes Termos ou pelo encerramento do serviço, na forma destes Termos.",
        "As regras de cancelamento, arrependimento e reembolso estão nas próximas seções e valem para todos os planos pagos.",
      ],
    },
    {
      id: "cancelamento",
      title: "Cancelamento",
      paragraphs: [
        "Como não há cobrança recorrente automática, você não precisa cancelar nada para evitar novas cobranças: basta não contratar um novo período.",
        "Você pode deixar de usar o serviço a qualquer momento. Depois do prazo de arrependimento (próxima seção), o período já pago continua valendo e você mantém o acesso até o último dia dele; não devolvemos valor proporcional pelos dias não usados, exceto nos casos da seção \"Outros casos de reembolso\".",
        "Se você quiser encerrar a conta e eliminar os seus dados, faça isso você mesmo, a qualquer momento, em Privacidade e segurança (menu do usuário), no botão \"Excluir minha conta\". A exclusão não devolve valores já pagos: para desistir em até 7 dias, peça o reembolso antes. Veja a Política de Privacidade para o que é apagado e o que a lei nos obriga a manter.",
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
        "Peça na própria ordem de pagamento (Assinatura, Histórico, \"Preciso de ajuda com esta ordem\", assunto reembolso) ou pelo canal de atendimento: " + CONTACT + ". Informe o e-mail da conta, o nome da empresa e a data e o valor do pagamento (ou o identificador da cobrança, se tiver). Para o arrependimento, basta dizer que quer desistir.",
        "Respondemos o pedido em até 5 dias úteis. Aprovado o pedido, devolvemos o valor por Pix, para a conta de origem do pagamento, em 10 a 15 dias úteis contados da aprovação, sem desconto de tarifas. Se a conta de origem não puder receber a devolução, combinamos com você outra forma de pagamento em seu nome.",
        "Guardamos o registro do pedido e do estorno para a sua comprovação e para as obrigações fiscais, conforme a Política de Privacidade.",
        "Se não ficar satisfeito com a resposta, você pode procurar o Procon, a plataforma consumidor.gov.br ou o Poder Judiciário.",
      ],
    },
    {
      id: "responsabilidades-empresa",
      title: "Responsabilidades da Empresa e do Usuário",
      paragraphs: [
        "A plataforma registra e organiza o que a Empresa informa. Por isso, são de responsabilidade da Empresa:",
      ],
      items: [
        "a veracidade, a legalidade e a atualização das informações cadastradas, e a conferência dos resultados antes de tomar decisões ou fazer pagamentos;",
        "as obrigações fiscais, contábeis, trabalhistas, previdenciárias, sanitárias e de defesa do consumidor do seu negócio;",
        "as relações com os seus clientes, fornecedores e funcionários, inclusive preços, orçamentos, entregas, garantias, cobranças e atendimento, das quais a Prime Ges não é parte;",
        "escolher quem acessa o ambiente e com qual função, retirar o acesso de quem sai e responder pelos atos dessas pessoas na plataforma;",
        "proteger os próprios aparelhos, e-mails e senhas usados para entrar;",
        "não registrar na plataforma números completos de cartão, senhas, dados de saúde, biometria ou outros dados pessoais sensíveis, inclusive em campos de anotação, anexos e no assistente.",
      ],
    },
    {
      id: "recursos-especificos",
      title: "Regras de recursos específicos",
      paragraphs: [
        "Alguns recursos exigem cuidado adicional:",
      ],
      items: [
        "Equipe e RH: cálculos de salário, férias, 13º, encargos, vales e presença são estimativas para controle interno. Não substituem holerite, eSocial, ponto oficial, contrato de trabalho, o contador ou o advogado.",
        "Financeiro, caixa, estoque e relatórios: refletem os lançamentos feitos. Não são escrituração contábil nem documento fiscal.",
        "Orçamentos e documentos gerados: são propostas e registros da Empresa, que responde pelo seu conteúdo.",
        "Fidelidade e sorteios: a Empresa define as regras e responde por elas perante os participantes e as autoridades. Promoções com sorteio ou distribuição de prêmios podem exigir autorização prévia (Lei nº 5.768/1971 e regulamentação): obtê-la é obrigação da Empresa. A ferramenta apenas organiza participantes e registra o resultado e não é uma autorização.",
        "Assistente de agenda: interpreta texto ou ditado de forma automatizada e pode errar. Confira o resumo antes de confirmar; o que for confirmado vale como lançamento da Empresa.",
        "Pagamentos dos clientes da Empresa: a plataforma apenas registra a forma e a situação informadas; não recebe, não processa e não garante esses pagamentos.",
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
        "copiar telas, textos ou funcionamento para construir produto concorrente, ou extrair dados da plataforma em massa por robôs;",
        "testar vulnerabilidades sem autorização escrita (falhas encontradas por acaso devem ser comunicadas ao canal de atendimento);",
        "compartilhar a conta de forma que prejudique a segurança ou ultrapasse os limites do plano.",
      ],
    },
    {
      id: "conteudo",
      title: "Seus dados e conteúdo",
      paragraphs: [
        "Os dados e conteúdos que você insere no Prime Ges (por exemplo, cadastros de clientes, produtos, vendas e movimentações) continuam sendo seus. Você nos autoriza a armazená-los e processá-los apenas para prestar o serviço, conforme a Política de Privacidade.",
        "Você é o responsável pelo conteúdo que cadastra e pelas informações de terceiros (como os seus clientes) que inclui na plataforma, inclusive por ter base legal para tratá-las e por atender os pedidos desses titulares. Nesse caso, a empresa usuária é a controladora desses dados e a Prime Ges atua em nome dela, como operadora.",
        "Mantenha cópias próprias das informações críticas para o seu negócio e das que a lei obriga você a guardar: o Prime Ges não é o seu arquivo fiscal, contábil ou trabalhista. A exclusão da conta apaga os dados na hora e não pode ser desfeita; peça a sua cópia antes.",
        "Podemos produzir estatísticas agregadas e anonimizadas, que não identificam pessoas nem empresas, para operar, proteger e melhorar o serviço.",
      ],
    },
    {
      id: "dados-empresa",
      title: "Tratamento de dados em nome da Empresa",
      paragraphs: [
        "Quanto aos dados pessoais que a Empresa cadastra (de clientes, fornecedores e equipe), a Empresa é a controladora e a Prime Ges é a operadora (art. 5º, VI e VII, e art. 39 da LGPD).",
        "A Empresa deve ter base legal para tratar esses dados, informar as pessoas, inclusive os seus funcionários, e cadastrar somente o necessário.",
      ],
      items: [
        "a Prime Ges trata esses dados apenas para prestar o serviço, conforme estes Termos e as instruções da Empresa dadas pelo uso da plataforma;",
        "quem tiver acesso a eles pela Prime Ges deve manter sigilo;",
        "a Prime Ges adota as medidas de segurança descritas na Política de Privacidade e usa os prestadores (suboperadores) ali informados;",
        "se tomar conhecimento de um incidente de segurança que afete os dados da Empresa, a Prime Ges a avisa sem demora injustificada, com as informações disponíveis;",
        "a Prime Ges ajuda a Empresa a atender pedidos de titulares e da ANPD, dentro do que a plataforma permite;",
        "ao excluir o ambiente, os dados são eliminados conforme a Política de Privacidade; a cópia deve ser pedida antes da exclusão;",
        "a Prime Ges pode recusar instrução que pareça contrária à lei, explicando o motivo;",
        "a Empresa autoriza o uso dos suboperadores informados na Política de Privacidade; mudanças relevantes na lista serão publicadas em nova versão;",
        "a pedido, a Prime Ges presta informações razoáveis sobre o tratamento e a segurança, sem expor dados de terceiros nem enfraquecer a proteção da plataforma.",
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
        "A aplicação e o banco de dados ficam em servidor operado pelo responsável. O Prime Ges também depende de prestadores como a Clerk (autenticação), a Cloudflare (rede, proteção e acesso ao site) e prestadores de pagamentos Pix. Esses serviços têm termos próprios e podem sofrer interrupções ou mudanças que afetem a plataforma.",
        "A Prime Ges responde pela escolha e pela contratação desses prestadores, mas não responde por falhas exclusivamente atribuíveis a eles quando não houver falha nossa, nos limites permitidos em lei.",
      ],
    },
    {
      id: "mudancas-servico",
      title: "Evolução, manutenção e encerramento do serviço",
      paragraphs: [
        "Podemos corrigir, melhorar, incluir, alterar ou retirar funcionalidades. Se a retirada de uma funcionalidade essencial prejudicar de forma relevante um período já pago, você pode pedir o reembolso proporcional.",
        "Manutenções podem deixar o serviço indisponível por algum tempo; quando programadas, procuramos avisar na plataforma. Funcionalidades em teste podem mudar ou ser retiradas sem aviso.",
        "Se decidirmos encerrar o serviço, avisaremos com pelo menos 30 dias de antecedência, salvo impedimento legal ou de segurança, devolveremos o valor proporcional ao período não usado e atenderemos os pedidos de cópia dos dados feitos dentro desse prazo.",
        "Não respondemos por indisponibilidade, atraso ou perda causados por caso fortuito ou força maior (art. 393 do Código Civil), falhas de energia ou internet, ataques que não pudessem ser razoavelmente evitados, atos de autoridade ou falhas exclusivas de terceiros, do Usuário ou da Empresa.",
      ],
    },
    {
      id: "suporte",
      title: "Suporte e comunicações",
      paragraphs: [
        "Os planos pagos incluem suporte por e-mail, conforme descrito na página de planos. O teste gratuito não inclui suporte.",
        "Podemos enviar comunicações necessárias ao serviço (avisos de segurança, de cobrança, de alteração destes Termos). Comunicações de marketing, se existirem, dependerão de consentimento próprio e opcional, separado destes Termos.",
        "Canal oficial de suporte e de atendimento: " + CONTACT + ".",
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
        "Na extensão permitida pela lei, a Prime Ges também não responde por prejuízos causados por informações erradas ou incompletas cadastradas pelo Usuário, pelo descumprimento de obrigações fiscais, trabalhistas ou legais da Empresa, pelo uso de senhas ou aparelhos do Usuário por terceiros, por exclusões feitas pelo próprio Usuário ou pelo uso em desacordo com estes Termos.",
        "Nada nestes Termos exclui responsabilidades que a lei não permita limitar.",
      ],
    },
    {
      id: "indenizacao",
      title: "Indenização",
      paragraphs: [
        "Na extensão permitida pela lei, e sem prejuízo dos direitos do consumidor, a Empresa deve ressarcir a Prime Ges por prejuízos, condenações, multas e despesas razoáveis, inclusive honorários, causados por reclamação de terceiro ou de autoridade que decorra de:",
      ],
      items: [
        "dados cadastrados sem base legal ou em desacordo com a lei;",
        "violação destes Termos ou da lei pela Empresa ou por pessoas a quem ela deu acesso;",
        "relações da Empresa com os seus clientes, fornecedores e funcionários, inclusive promoções, sorteios e cobranças.",
      ],
    },
    {
      id: "comunicacoes-eletronicas",
      title: "Comunicações e provas eletrônicas",
      paragraphs: [
        "O aceite eletrônico destes Termos, os registros de acesso, de operações, de pagamentos e de chamados mantidos pela plataforma são meios válidos de comprovação, admitida a prova em contrário.",
        "Avisos podem ser feitos na própria plataforma ou no e-mail da conta, que você deve manter atualizado. Você fala conosco pelo canal indicado na seção \"Identificação do prestador\".",
      ],
    },
    {
      id: "disposicoes-gerais",
      title: "Disposições gerais",
      paragraphs: [
        "A Prime Ges pode transferir estes Termos, com os direitos e deveres deles, à pessoa jurídica que vier a ser constituída para operar o serviço ou a quem a suceder na operação, avisando os Usuários e mantendo as condições do período já pago. O Usuário não pode transferir a conta sem autorização.",
        "Se uma cláusula for considerada inválida, as demais continuam valendo. Deixar de exigir um direito não significa renunciar a ele.",
        "Estes Termos não criam sociedade, vínculo de trabalho, representação ou franquia entre as partes. Junto com a Política de Privacidade e as condições exibidas na contratação, formam o acordo entre elas sobre o serviço.",
        "Obrigações que por natureza continuam depois do fim do contrato, como propriedade intelectual, proteção de dados, responsabilidade, indenização e foro, permanecem válidas.",
        "Antes de uma disputa, procure o canal de atendimento: tentaremos resolver de forma amigável. Isso não impede o consumidor de procurar o Procon, o consumidor.gov.br ou o Poder Judiciário.",
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
        "Quando o Usuário for consumidor, o foro competente é o do seu domicílio (art. 101, I, do CDC). Nos demais casos, vale o foro definido pela legislação processual.",
      ],
    },
    {
      id: "identificacao",
      title: "Identificação do prestador",
      paragraphs: [
        "Responsável: o Prime Ges é operado pela Nexora Group.",
        "E-mail de contato e suporte: " + CONTACT + ".",
        "A Nexora Group ainda não tem CNPJ: esta identificação é provisória e será completada quando houver.",
      ],
    },
  ],
};
