import type { LegalDocument } from "./types";

const BLOCKED = "[BLOCKED — DADO EMPRESARIAL NECESSÁRIO]";
const REVIEW = "[VALIDAÇÃO JURÍDICA NECESSÁRIA]";

/**
 * Política de Privacidade do Prime Ges — texto ORIGINAL, descrevendo o que a aplicação
 * realmente faz hoje (verificado no código e no banco). Não afirma "conformidade total" com a
 * LGPD e NÃO é parecer jurídico: cada base legal e cada prazo marcado exige revisão por
 * advogado especialista antes de Production.
 */
export const privacyPolicy: LegalDocument = {
  type: "PRIVACY_POLICY",
  slug: "politica-de-privacidade",
  title: "Política de Privacidade",
  version: "1.0.0-rc.1",
  effectiveAt: "2026-10-08",
  summary:
    "Quais dados o Prime Ges trata, para quê, com quem compartilha, por quanto tempo e como você exerce seus direitos.",
  sections: [
    {
      id: "quem-somos",
      title: "Quem é o responsável",
      paragraphs: [
        "Esta Política explica como o Prime Ges (a \"Prime Ges\") trata dados pessoais, em linguagem direta e de acordo com a Lei Geral de Proteção de Dados (LGPD, Lei nº 13.709/2018).",
        "Identificação do responsável pelos dados de conta: " + BLOCKED + " (razão social, CNPJ e endereço).",
        "Contato sobre privacidade e dados pessoais: " + BLOCKED + ". Encarregado pelo tratamento de dados (DPO), quando houver: " + BLOCKED + ".",
      ],
    },
    {
      id: "escopo",
      title: "Escopo e papéis na LGPD",
      paragraphs: [
        "Esta Política vale para o site público, para o cadastro e para o uso da plataforma Prime Ges. Há dois tipos de dados e, por isso, dois papéis possíveis:",
        "1) Dados da conta de quem usa a plataforma (nome, e-mail, acesso, pagamento da assinatura). Aqui, a Prime Ges decide as finalidades e atua, em regra, como controladora.",
        "2) Dados que a empresa usuária cadastra sobre os seus próprios clientes, fornecedores, colaboradores, produtos e vendas. Nesse caso, em regra, a empresa usuária é a controladora e a Prime Ges trata os dados em nome dela, como operadora, para prestar o serviço. A empresa deve ter base legal para esses dados e atender os pedidos dos seus clientes.",
        "A classificação exata dos papéis em cada situação precisa de confirmação jurídica. " + REVIEW,
      ],
    },
    {
      id: "dados",
      title: "Quais dados tratamos",
      paragraphs: ["Tratamos as categorias abaixo, conforme o uso que você faz da plataforma:"],
      items: [
        "Cadastro e identificação: nome, e-mail, foto de perfil quando você usa login social, e identificadores técnicos da conta.",
        "Autenticação: a verificação de login e senha é feita pelo provedor Clerk. A Prime Ges não armazena a sua senha.",
        "Empresa: nome e tipo de negócio, vínculos entre pessoas e empresa e as funções atribuídas (por exemplo, proprietário, administrador, funcionário).",
        "Assinatura e pagamentos: plano, período de acesso, valor, status, referências e identificadores da cobrança Pix. Depois do pagamento, o prestador Pix devolve dados do pagador (nome, documento e identificador da transação), que ficam registrados.",
        "Uso e segurança: data do último acesso, sinal periódico de presença enquanto a plataforma está aberta (usado para indicar se a conta está ativa), e registros de auditoria de operações relevantes (quem fez, o quê e quando).",
        "Registro de aceite: qual versão dos Termos de Uso e da Política de Privacidade você aceitou, o contexto e a data e hora do aceite. Não guardamos o seu IP nem o seu navegador nesse registro.",
        "Dados técnicos de acesso: a infraestrutura de hospedagem pode registrar informações técnicas das requisições (como endereço IP e tipo de navegador) para operar e proteger o serviço. " + REVIEW,
        "Dados cadastrados pela empresa sobre terceiros (clientes, fornecedores, colaboradores, produtos, vendas, caixa e financeiro): tratados em nome da empresa, conforme a seção de papéis.",
      ],
    },
    {
      id: "finalidades",
      title: "Para que usamos os dados e em que base legal",
      paragraphs: [
        "Cada finalidade abaixo está ligada a uma base legal provável. Isto é uma proposta técnica e todas as bases precisam de validação jurídica. " + REVIEW,
      ],
      items: [
        "Criar e manter a conta, autenticar o acesso e prestar o serviço contratado. Base provável: execução de contrato (LGPD, art. 7º, V).",
        "Cobrar, confirmar pagamentos e liberar o período de acesso. Base provável: execução de contrato (art. 7º, V) e cumprimento de obrigação legal ou regulatória quando houver (art. 7º, II).",
        "Proteger a plataforma, prevenir fraudes e abusos e manter registros de auditoria. Base provável: legítimo interesse (art. 7º, IX), com avaliação de impacto a validar.",
        "Mostrar presença e último acesso para operação e suporte da conta. Base provável: legítimo interesse (art. 7º, IX) ou execução de contrato, a definir.",
        "Guardar o registro de aceite dos documentos legais para poder comprová-lo. Base provável: exercício regular de direitos (art. 7º, VI) e cumprimento de obrigação legal (art. 7º, II).",
        "Atender solicitações de titulares e autoridades. Base provável: cumprimento de obrigação legal (art. 7º, II).",
        "Comunicações de marketing: hoje não enviamos. Se passarmos a enviar, dependerão de consentimento específico, opcional e revogável (art. 7º, I), separado deste aceite e sem efeito sobre o uso do serviço.",
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
        "Alguns prestadores armazenam ou processam dados fora do Brasil. O banco de dados do Prime Ges está hospedado em região dos Estados Unidos, e outros prestadores (autenticação e hospedagem) podem operar a partir do exterior. Essas transferências devem seguir um dos mecanismos previstos no art. 33 da LGPD, e o mecanismo adotado precisa ser confirmado. " + REVIEW,
      ],
    },
    {
      id: "cookies",
      title: "Cookies e tecnologias semelhantes",
      paragraphs: [
        "Usamos apenas cookies e armazenamento necessários ao funcionamento: cookies de sessão e segurança do provedor de login (Clerk) e uma preferência de interface (estado do menu lateral). Hoje não usamos cookies de publicidade, de análise de audiência nem rastreadores de terceiros.",
        "A fonte de texto é entregue pelo próprio site. A página inicial não carrega imagens de serviços externos.",
        "Se passarmos a usar cookies não essenciais, pediremos o seu consentimento antes e atualizaremos esta Política. " + REVIEW,
      ],
    },
    {
      id: "seguranca",
      title: "Segurança",
      paragraphs: [
        "Adotamos medidas técnicas e organizacionais para proteger os dados, incluindo separação dos dados de cada empresa com regras de acesso no banco de dados, controle de acesso por funções, autenticação por provedor especializado e cabeçalhos de segurança no site.",
        "Nenhuma medida elimina todo o risco. Em caso de incidente de segurança que possa causar risco ou dano relevante, comunicaremos a Autoridade Nacional de Proteção de Dados (ANPD) e os titulares afetados, nos termos do art. 48 da LGPD. " + REVIEW,
      ],
    },
    {
      id: "retencao",
      title: "Por quanto tempo guardamos os dados",
      paragraphs: [
        "Guardamos os dados enquanto a conta existir e pelo tempo necessário para cumprir as finalidades acima, obrigações legais e a defesa de direitos.",
        "O histórico de entregas de notificações de pagamento é apagado automaticamente depois de 60 dias. Os demais prazos de retenção e de eliminação (inclusive depois do encerramento da conta) ainda não estão definidos nesta versão: " + REVIEW + " (prazos a definir).",
        "O registro de aceite dos documentos legais é mantido como histórico, para comprovação.",
      ],
    },
    {
      id: "direitos",
      title: "Seus direitos como titular",
      paragraphs: [
        "Nos termos do art. 18 da LGPD, você pode solicitar, quando aplicável: confirmação de que tratamos seus dados; acesso; correção; anonimização, bloqueio ou eliminação de dados desnecessários ou tratados em desconformidade; portabilidade; informação sobre compartilhamento; informação sobre a possibilidade de não consentir e suas consequências; e revogação de consentimento.",
        "Para exercer seus direitos, use o canal indicado na seção de contato: " + BLOCKED + ". Hoje a plataforma não oferece exclusão ou exportação de conta por conta própria; esses pedidos são atendidos manualmente pelo canal acima.",
        "Se você é cliente de uma empresa que usa o Prime Ges, em regra deve fazer o pedido à própria empresa, que é a controladora dos seus dados.",
        "Você também pode reclamar à ANPD (gov.br/anpd).",
      ],
    },
    {
      id: "menores",
      title: "Crianças e adolescentes",
      paragraphs: [
        "O Prime Ges é destinado a empresas e a pessoas maiores de 18 anos. Não coletamos intencionalmente dados de crianças e adolescentes. " + REVIEW,
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
