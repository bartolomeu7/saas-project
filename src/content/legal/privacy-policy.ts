import type { LegalDocument } from "./types";

const BLOCKED = "[BLOCKED — DADO EMPRESARIAL NECESSÁRIO]";

/**
 * Política de Privacidade do Prime Ges — texto ORIGINAL, descrevendo o que a aplicação
 * realmente faz (verificado no código e nas migrations). Não afirma "conformidade total" com a
 * LGPD e não substitui aconselhamento jurídico: recomenda-se a revisão por advogado
 * especialista antes da publicação.
 *
 * As seções "escopo", "quem-somos" e "direitos*" também alimentam a página pública
 * /direitos-do-titular (ver src/lib/legal/documents.ts): uma única fonte, um único hash.
 *
 * Os únicos marcadores pendentes são dados da empresa (BLOCKED). Eles não podem ser inventados.
 */
export const privacyPolicy: LegalDocument = {
  type: "PRIVACY_POLICY",
  slug: "politica-de-privacidade",
  title: "Política de Privacidade",
  version: "1.0.0-rc.3",
  effectiveAt: "2026-10-22",
  summary:
    "Quais dados o Prime Ges trata, para quê, com quem compartilha, por quanto tempo guarda e como você exerce seus direitos.",
  sections: [
    {
      id: "quem-somos",
      title: "Quem é o responsável",
      paragraphs: [
        "Esta Política explica como o Prime Ges (a \"Prime Ges\") trata dados pessoais, em linguagem direta e de acordo com a Lei Geral de Proteção de Dados (LGPD, Lei nº 13.709/2018).",
        "Identificação do responsável pelos dados de conta: " + BLOCKED + " (razão social, CNPJ e endereço).",
        "Contato sobre privacidade e dados pessoais: " + BLOCKED + ". Encarregado pelo tratamento de dados (DPO): " + BLOCKED + ".",
      ],
    },
    {
      id: "escopo",
      title: "Escopo e papéis na LGPD",
      paragraphs: [
        "Esta Política vale para o site público, para o cadastro e para o uso da plataforma Prime Ges. Há dois tipos de dados e, por isso, dois papéis:",
        "1) Dados da conta de quem usa a plataforma (nome, e-mail, acesso, pagamento da assinatura). Aqui a Prime Ges decide as finalidades e atua como controladora.",
        "2) Dados que a empresa usuária cadastra sobre os seus próprios clientes, fornecedores, colaboradores, produtos e vendas. Nesse caso a empresa usuária é a controladora e a Prime Ges trata os dados em nome dela, conforme as suas instruções, como operadora, apenas para prestar o serviço. A empresa deve ter base legal para esses dados e atender os pedidos dos seus clientes. Se um pedido chegar até nós, repassamos à empresa ou orientamos o titular a procurá-la.",
      ],
    },
    {
      id: "dados",
      title: "Quais dados tratamos",
      paragraphs: ["Tratamos as categorias abaixo, conforme o uso que você faz da plataforma. Não tratamos dados pessoais sensíveis (art. 5º, II, da LGPD) para as nossas próprias finalidades."],
      items: [
        "Cadastro e identificação: nome, e-mail, foto de perfil quando você usa login social, e identificadores técnicos da conta.",
        "Autenticação: a verificação de login e senha é feita pelo provedor Clerk. A Prime Ges não armazena a sua senha.",
        "Empresa: nome e tipo de negócio, vínculos entre pessoas e empresa e as funções atribuídas (por exemplo, proprietário, administrador, funcionário).",
        "Assinatura e pagamentos: plano, período de acesso, valor, status, referências e identificadores da cobrança Pix. Depois do pagamento, o prestador Pix devolve dados do pagador (nome, documento e identificador da transação), que ficam registrados para conciliar a cobrança e atender pedidos de reembolso.",
        "Uso e segurança: data do último acesso, sinal periódico de presença enquanto a plataforma está aberta (usado para indicar se a conta está ativa), identificador da sessão de login (usado para controlar quantas sessões simultâneas o plano permite) e registros de auditoria de operações relevantes (quem fez, o quê e quando).",
        "Prevenção de abuso do teste grátis: ao criar a empresa, geramos um identificador irreversível da sua conexão (resultado de uma função de embaralhamento com chave secreta do servidor aplicada ao endereço IP). O endereço IP em si não é gravado nesse registro. Ele serve para limitar cadastros repetidos do teste e é apagado automaticamente após 30 dias (prazo padrão).",
        "Registro de aceite: qual versão dos Termos de Uso e da Política de Privacidade você aceitou, o contexto e a data e hora do aceite. Não guardamos o seu IP nem o seu navegador nesse registro.",
        "Dados técnicos de acesso: a infraestrutura de hospedagem registra informações técnicas das requisições (como endereço IP e tipo de navegador) para operar e proteger o serviço.",
        "Comunicação com o suporte: o que você nos enviar ao pedir ajuda (mensagem, e-mail e anexos).",
        "Dados cadastrados pela empresa sobre terceiros (clientes, fornecedores, colaboradores, produtos, vendas, caixa e financeiro): tratados em nome da empresa, conforme a seção de papéis.",
      ],
    },
    {
      id: "finalidades",
      title: "Para que usamos os dados e em que base legal",
      paragraphs: [
        "Cada finalidade abaixo tem uma base legal da LGPD (art. 7º). Só usamos os dados para essas finalidades e não os usamos para propaganda ou criação de perfil comercial.",
      ],
      items: [
        "Criar e manter a conta, autenticar o acesso e prestar o serviço contratado. Base: execução de contrato (art. 7º, V).",
        "Cobrar, confirmar pagamentos, liberar o período de acesso e atender pedidos de reembolso. Base: execução de contrato (art. 7º, V) e cumprimento de obrigação legal ou regulatória (art. 7º, II).",
        "Proteger a plataforma, prevenir fraudes e abusos (inclusive o uso repetido do teste grátis) e manter registros de auditoria. Base: legítimo interesse (art. 7º, IX), limitado ao mínimo necessário. Você pode pedir informações sobre a avaliação desse interesse e se opor ao tratamento (art. 18, § 2º).",
        "Mostrar presença e último acesso e controlar as sessões simultâneas permitidas pelo plano. Base: execução de contrato (art. 7º, V).",
        "Guardar o registro de aceite dos documentos legais para poder comprová-lo. Base: exercício regular de direitos (art. 7º, VI) e cumprimento de obrigação legal (art. 7º, II).",
        "Atender solicitações de titulares e de autoridades e responder a processos. Base: cumprimento de obrigação legal (art. 7º, II) e exercício regular de direitos (art. 7º, VI).",
        "Comunicações de marketing: hoje não enviamos. Se passarmos a enviar, dependerão de consentimento específico, opcional e revogável (art. 7º, I), separado deste aceite e sem efeito sobre o uso do serviço.",
        "Decisões automatizadas: não tomamos decisões exclusivamente automatizadas que afetem seus interesses de forma relevante. A limitação de cadastros repetidos do teste grátis é uma regra simples de contagem e, se você for barrado indevidamente, pode pedir revisão por uma pessoa pelo canal de contato (art. 20).",
      ],
    },
    {
      id: "compartilhamento",
      title: "Com quem compartilhamos",
      paragraphs: [
        "Não vendemos dados pessoais. Compartilhamos o necessário com prestadores que nos ajudam a operar o serviço, que atuam como operadores ou suboperadores:",
      ],
      items: [
        "Clerk: autenticação e gestão de sessão de login.",
        "Supabase: banco de dados e armazenamento dos dados da plataforma.",
        "Vercel: hospedagem e entrega da aplicação.",
        "Prestador de pagamentos Pix (EvoPay): geração e confirmação de cobranças. Enviamos valor, referência e endereço de retorno; o prestador devolve o status e dados do pagador.",
        "Autoridades e terceiros, quando houver obrigação legal ou ordem de autoridade competente.",
      ],
    },
    {
      id: "transferencias",
      title: "Transferências internacionais",
      paragraphs: [
        "Alguns prestadores armazenam ou processam dados fora do Brasil. O banco de dados do Prime Ges está hospedado em região dos Estados Unidos, e outros prestadores (autenticação e hospedagem) podem operar a partir do exterior.",
        "Essas transferências seguem o art. 33 da LGPD e a regulamentação da ANPD sobre transferência internacional de dados (Resolução CD/ANPD nº 19/2024), e contratamos prestadores que assumem obrigações contratuais de proteção de dados. Você pode pedir mais informações sobre o mecanismo aplicável pelo canal de contato.",
      ],
    },
    {
      id: "cookies",
      title: "Cookies e tecnologias semelhantes",
      paragraphs: [
        "Usamos apenas cookies e armazenamento necessários ao funcionamento: cookies de sessão e segurança do provedor de login (Clerk) e uma preferência de interface (estado do menu lateral). Esses itens não dependem de consentimento porque são indispensáveis ao serviço que você pediu. Hoje não usamos cookies de publicidade, de análise de audiência nem rastreadores de terceiros.",
        "A fonte de texto é entregue pelo próprio site. A página inicial não carrega imagens de serviços externos.",
        "Se passarmos a usar cookies não essenciais, pediremos o seu consentimento antes, com opção de recusar, e atualizaremos esta Política.",
      ],
    },
    {
      id: "seguranca",
      title: "Segurança",
      paragraphs: [
        "Adotamos medidas técnicas e organizacionais para proteger os dados, incluindo separação dos dados de cada empresa com regras de acesso no banco de dados, controle de acesso por funções, autenticação por provedor especializado, conexão criptografada (HTTPS) e cabeçalhos de segurança no site.",
        "Nenhuma medida elimina todo o risco. Em caso de incidente de segurança que possa causar risco ou dano relevante, comunicaremos a Autoridade Nacional de Proteção de Dados (ANPD) e os titulares afetados, nos termos do art. 48 da LGPD e da regulamentação da ANPD, descrevendo o que aconteceu, os dados envolvidos e as medidas adotadas.",
        "Se você encontrar uma falha de segurança, fale conosco pelo canal de contato de privacidade e não explore a falha além do necessário para demonstrá-la.",
      ],
    },
    {
      id: "retencao",
      title: "Por quanto tempo guardamos os dados",
      paragraphs: [
        "Guardamos os dados somente pelo tempo necessário para cumprir as finalidades acima, obrigações legais e a defesa de direitos. Depois disso, eliminamos ou anonimizamos.",
      ],
      items: [
        "Conta, perfil e dados da empresa: enquanto a conta existir. Depois do encerramento, ficam disponíveis para você pedir uma cópia por 30 dias e são eliminados em até 90 dias do encerramento, salvo o que a lei nos obrigue a guardar.",
        "Pagamentos, cobranças e registros que sustentam obrigações fiscais, contábeis e contratuais: 5 anos, contados do fato, prazo compatível com a prescrição e com as obrigações tributárias.",
        "Registro de aceite dos documentos legais: durante a relação e por 5 anos depois dela, para comprovação.",
        "Registros de auditoria: enquanto existir o ambiente da empresa a que pertencem.",
        "Identificador antifraude do teste grátis: 30 dias (prazo padrão).",
        "Histórico de entregas de notificações de pagamento: 60 dias.",
        "Registros técnicos de acesso da infraestrutura de hospedagem: pelo prazo do prestador e, quando a lei exigir guarda de registros de acesso a aplicações, por no mínimo 6 meses (Marco Civil da Internet, art. 15).",
        "Cópias de segurança: podem conter os dados por um período limitado até o fim do ciclo de cópias do prestador de banco de dados.",
      ],
    },
    {
      id: "direitos",
      title: "Seus direitos como titular",
      paragraphs: [
        "Nos termos do art. 18 da LGPD, você pode pedir, a qualquer momento e sem custo:",
      ],
      items: [
        "confirmação de que tratamos dados seus;",
        "acesso aos seus dados;",
        "correção de dados incompletos, inexatos ou desatualizados;",
        "anonimização, bloqueio ou eliminação de dados desnecessários, excessivos ou tratados em desconformidade com a lei;",
        "portabilidade dos dados a outro fornecedor, mediante requisição expressa;",
        "eliminação dos dados tratados com o seu consentimento;",
        "informação sobre com quem compartilhamos seus dados;",
        "informação sobre a possibilidade de não fornecer consentimento e sobre as consequências da negativa;",
        "revogação do consentimento, quando essa for a base do tratamento;",
        "oposição a tratamento feito sem consentimento, se você entender que há descumprimento da lei;",
        "revisão por uma pessoa de decisões tomadas exclusivamente de forma automatizada.",
      ],
    },
    {
      id: "direitos-como-exercer",
      title: "Como exercer os seus direitos",
      paragraphs: [
        "Envie o pedido para o canal de privacidade: " + BLOCKED + ". Informe o seu nome, o e-mail da conta e qual direito quer exercer. Quanto mais claro o pedido, mais rápido o atendimento.",
        "Para a sua segurança, podemos pedir uma confirmação de que você é mesmo o titular (por exemplo, responder a partir do e-mail da conta). Só pedimos o necessário para essa confirmação e não usamos esses dados para outra finalidade.",
        "Hoje a plataforma não oferece exclusão nem exportação da conta por conta própria dentro do sistema: esses pedidos são atendidos por nós, manualmente, pelo canal acima. A cópia dos dados é entregue em formato eletrônico de uso comum (por exemplo, CSV ou JSON).",
        "Se você é cliente, fornecedor ou colaborador de uma empresa que usa o Prime Ges, a empresa é a controladora dos seus dados. Faça o pedido a ela. Se o pedido chegar até nós, repassamos à empresa ou indicamos como procurá-la.",
        "Quando o pedido envolver os dados de uma empresa inteira (por exemplo, eliminar todos os dados), podemos pedir a confirmação de quem tem poderes de proprietário do ambiente.",
      ],
    },
    {
      id: "direitos-prazos",
      title: "Prazos de resposta",
      paragraphs: [
        "Confirmamos o recebimento do pedido imediatamente ou em poucos dias. Respondemos de forma completa em até 15 dias contados do recebimento do pedido, nos termos do art. 19, II, da LGPD. Pedidos mais simples, como a confirmação de que tratamos seus dados, podem ser respondidos de imediato, em formato simplificado.",
        "Se um pedido não puder ser atendido (por exemplo, porque o dado precisa ser mantido por obrigação legal), explicamos o motivo. Se faltar informação, pedimos e o prazo recomeça quando você responder.",
      ],
    },
    {
      id: "direitos-limites",
      title: "Quando não podemos eliminar ou entregar o dado",
      paragraphs: [
        "A eliminação dos dados tem exceções previstas no art. 16 da LGPD. Podemos manter o dado, de forma restrita, para cumprir obrigação legal ou regulatória (por exemplo, registros de pagamento por 5 anos), para exercer ou defender direitos em processo, e para o estudo ou a prevenção de fraude, em formato anonimizado sempre que possível.",
        "Também não entregamos dados de outras pessoas nem informações que revelem segredo de negócio ou comprometam a segurança da plataforma, mas sempre informamos o que for possível.",
      ],
    },
    {
      id: "direitos-reclamacao",
      title: "Reclamações e a ANPD",
      paragraphs: [
        "Se não ficar satisfeito com a nossa resposta, você tem o direito de peticionar à Autoridade Nacional de Proteção de Dados (ANPD), em gov.br/anpd, e de procurar os órgãos de defesa do consumidor ou o Poder Judiciário.",
      ],
    },
    {
      id: "menores",
      title: "Crianças e adolescentes",
      paragraphs: [
        "O Prime Ges é destinado a empresas e a pessoas maiores de 18 anos. Não coletamos intencionalmente dados de crianças e adolescentes. Se tomarmos conhecimento de que uma conta foi criada por menor de idade, vamos suspendê-la e eliminar os dados, ressalvadas as obrigações legais. Se for responsável por uma criança ou adolescente e acreditar que há dados dela no sistema, fale conosco pelo canal de privacidade.",
      ],
    },
    {
      id: "aceite",
      title: "Registro do aceite dos documentos",
      paragraphs: [
        "Ao se cadastrar, você aceita os Termos de Uso e declara estar ciente desta Política de Privacidade. São dois registros separados.",
        "Cada registro guarda a pessoa, o documento, a versão, uma impressão digital (hash) do texto publicado, a data e hora no servidor e o contexto (cadastro ou novo aceite). Quando um documento muda de forma relevante, publicamos nova versão e podemos pedir novo aceite; os registros anteriores permanecem.",
      ],
    },
    {
      id: "alteracoes",
      title: "Alterações desta Política",
      paragraphs: [
        "Podemos atualizar esta Política. Cada versão tem número e data de vigência. Mudanças relevantes serão informadas e, quando necessário, será solicitado novo aceite.",
      ],
    },
  ],
};
