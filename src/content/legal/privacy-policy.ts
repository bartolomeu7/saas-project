import type { LegalDocument } from "./types";

const CONTACT = "suporte@primeges.com.br";

/**
 * Política de Privacidade do Prime Ges — texto ORIGINAL, descrevendo o que a aplicação
 * realmente faz (verificado no código e nas migrations). Não afirma "conformidade total" com a
 * LGPD e não substitui aconselhamento jurídico: recomenda-se a revisão por advogado
 * especialista antes da publicação.
 *
 * As seções "escopo", "quem-somos" e "direitos*" também alimentam a página pública
 * /direitos-do-titular (ver src/lib/legal/documents.ts): uma única fonte, um único hash.
 *
 * Identificação PROVISÓRIA (Nexora Group, definida pelo dono em 25/11/2026; nenhum nome ou CPF de pessoa é publicado): ainda não há CNPJ nem endereço
 * publicado. Ao abrir a empresa, publicar nova versão. Dados que faltam não são inventados.
 */
export const privacyPolicy: LegalDocument = {
  type: "PRIVACY_POLICY",
  slug: "politica-de-privacidade",
  title: "Política de Privacidade",
  version: "1.0.0-rc.4",
  effectiveAt: "2026-11-25",
  summary:
    "Quais dados o Prime Ges trata, para quê, com quem compartilha, por quanto tempo guarda e como você exerce seus direitos.",
  sections: [
    {
      id: "quem-somos",
      title: "Quem é o responsável",
      paragraphs: [
        "Esta Política explica como o Prime Ges (a \"Prime Ges\") trata dados pessoais, em linguagem direta e de acordo com a Lei Geral de Proteção de Dados (LGPD, Lei nº 13.709/2018).",
        "Responsável (controlador) pelos dados de conta: o Prime Ges é operado pela Nexora Group. A Nexora Group ainda não tem CNPJ: a identificação será completada quando houver.",
        "Contato sobre privacidade, dados pessoais e suporte: " + CONTACT + ". Os pedidos dos titulares são atendidos por esse canal.",
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
        "Assinatura e pagamentos: plano, período de acesso, valor, status, referências e identificadores da cobrança Pix. Para gerar a cobrança usamos o nome e o CPF ou CNPJ do pagador (e, conforme o prestador, e-mail e telefone). Depois do pagamento, o prestador Pix devolve dados do pagador (nome, documento e identificador da transação), que ficam registrados para conciliar a cobrança e atender pedidos de reembolso.",
        "Uso e segurança: data do último acesso, sinal periódico de presença enquanto a plataforma está aberta (usado para indicar se a conta está ativa), identificador da sessão de login (usado para controlar quantas sessões simultâneas o plano permite) e registros de auditoria de operações relevantes (quem fez, o quê e quando).",
        "Prevenção de abuso do teste grátis: ao criar a empresa, geramos um identificador irreversível da sua conexão (resultado de uma função de embaralhamento com chave secreta do servidor aplicada ao endereço IP). O endereço IP em si não é gravado nesse registro. Ele serve para limitar cadastros repetidos do teste e é apagado automaticamente após 30 dias (prazo padrão).",
        "Registro de aceite: qual versão dos Termos de Uso e da Política de Privacidade você aceitou, o contexto e a data e hora do aceite. Não guardamos o seu IP nem o seu navegador nesse registro.",
        "Dados técnicos de acesso: o servidor e a Cloudflare registram informações técnicas das requisições (como endereço IP e tipo de navegador) para operar, proteger e medir o desempenho do serviço.",
        "Comunicação com o suporte: o que você nos enviar ao pedir ajuda (mensagem, e-mail e anexos), inclusive os chamados abertos sobre uma ordem de pagamento.",
        "Assistente de agenda (chat): as mensagens que você digita ou dita, em texto, os rascunhos e o resultado de cada pedido. O ditado usa o reconhecimento de voz do seu navegador, que pode enviar o áudio ao serviço dele (no Chrome, ao Google); a Prime Ges não recebe nem guarda o áudio.",
        "Dados que a empresa cadastra sobre os seus clientes e fornecedores (como nome, documento, contatos, endereço, data de nascimento, anotações, anexos, agendamentos, orçamentos, vendas e pontos de fidelidade): tratados em nome da empresa, conforme a seção de papéis.",
        "Dados que a empresa cadastra sobre a sua equipe (módulos Equipe e RH, como nome, telefone, data de nascimento, função, chave Pix, remuneração, presença, vales, pagamentos, férias, número de dependentes e vale-transporte): tratados em nome da empresa, conforme a seção de papéis.",
      ],
    },
    {
      id: "origem",
      title: "De onde vêm os dados e o que é obrigatório",
      paragraphs: [
        "Recebemos os dados de você; da empresa que cadastrou ou convidou você; do provedor de login social, quando você o escolhe; do prestador de pagamentos, depois de um Pix; e automaticamente, pelo uso do site e da plataforma.",
      ],
      items: [
        "Obrigatórios para ter conta: nome, e-mail e aceite dos documentos. Sem eles não é possível criar o acesso.",
        "Obrigatórios para contratar plano pago: CPF ou CNPJ do pagador e os dados que o prestador de pagamentos exigir. Sem eles a cobrança não é gerada.",
        "Os demais campos são opcionais ou escolhidos pela empresa usuária; deixar de informar apenas limita o recurso correspondente.",
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
        "Medir o acesso e o desempenho do site, em estatísticas agregadas. Base: legítimo interesse (art. 7º, IX).",
        "Atender solicitações de titulares e de autoridades e responder a processos. Base: cumprimento de obrigação legal (art. 7º, II) e exercício regular de direitos (art. 7º, VI).",
        "Comunicações de marketing: hoje não enviamos. Se passarmos a enviar, dependerão de consentimento específico, opcional e revogável (art. 7º, I), separado deste aceite e sem efeito sobre o uso do serviço.",
        "Decisões automatizadas: não tomamos decisões exclusivamente automatizadas que afetem seus interesses de forma relevante. A limitação de cadastros repetidos do teste grátis é uma regra simples de contagem e, se você for barrado indevidamente, pode pedir revisão por uma pessoa pelo canal de contato (art. 20).",
      ],
    },
    {
      id: "compartilhamento",
      title: "Com quem compartilhamos",
      paragraphs: [
        "O banco de dados e a aplicação ficam em servidor operado pelo responsável, no Brasil.",
        "Não vendemos dados pessoais. Compartilhamos o necessário com prestadores que nos ajudam a operar o serviço, que atuam como operadores ou suboperadores:",
      ],
      items: [
        "Clerk: autenticação e gestão de sessão de login.",
        "Cloudflare: entrega e proteção do site, acesso seguro ao servidor e medição de acessos e desempenho (Cloudflare Web Analytics).",
        "Prestadores de pagamentos Pix (MisticPay e, quando ativado, SyncPay) e as instituições financeiras que liquidam a cobrança: enviamos valor, referência, endereço de retorno, nome e CPF ou CNPJ do pagador (na SyncPay, também e-mail e telefone); eles devolvem o status e os identificadores da cobrança.",
        "Google, Microsoft ou Discord: somente se você escolher entrar com uma dessas contas.",
        "Fornecedor do seu navegador (por exemplo, o Google), somente quando você usa o ditado por voz do assistente.",
        "Provedor de e-mail: recebe as mensagens que você envia ao canal de suporte.",
        "Autoridades e terceiros, quando houver obrigação legal ou ordem de autoridade competente.",
      ],
    },
    {
      id: "acesso-interno",
      title: "Quem pode ver os dados",
      paragraphs: [
        "Dentro de uma empresa, cada pessoa vê o que a sua função permite (proprietário, administrador ou funcionário).",
        "Quem opera o Prime Ges pode consultar e ajustar dados de conta, empresa, assinatura, pagamento e chamados. O acesso a dados do ambiente de uma empresa se limita ao necessário para suporte, segurança, correção de falhas ou cumprimento de ordem legal, sob sigilo. Ações administrativas relevantes ficam registradas em auditoria.",
        "Se a operação do Prime Ges passar a uma pessoa jurídica constituída para isso, ou a quem a suceder, os dados seguem junto, protegidos por esta Política, e os usuários serão avisados.",
      ],
    },
    {
      id: "transferencias",
      title: "Transferências internacionais",
      paragraphs: [
        "O banco de dados do Prime Ges fica no Brasil. Prestadores como a Clerk (Estados Unidos), a Cloudflare (rede em vários países) e, quando você os usa, Google, Microsoft e Discord podem tratar dados fora do Brasil.",
        "Essas transferências são feitas para prestar o serviço e devem seguir o art. 33 da LGPD e a regulamentação da ANPD sobre transferência internacional de dados (Resolução CD/ANPD nº 19/2024). Você pode pedir mais informações pelo canal de contato.",
      ],
    },
    {
      id: "cookies",
      title: "Cookies e tecnologias semelhantes",
      paragraphs: [
        "Usamos apenas cookies e armazenamento do navegador necessários ao funcionamento ou às preferências que você escolhe: cookies de sessão e segurança do provedor de login (Clerk), um cookie temporário (1 hora) que leva o seu aceite durante o cadastro, o estado do menu lateral, o tema claro ou escuro, a forma de recebimento usada na agenda e a marcação de avisos já vistos. Eles não dependem de consentimento porque são indispensáveis ao serviço que você pediu ou guardam uma escolha sua. Não usamos cookies de publicidade. Você pode apagá-los no navegador; sem os de login não é possível entrar.",
        "Para medir acessos e desempenho, o site usa o Cloudflare Web Analytics, que, segundo o fornecedor, não usa cookies nem armazenamento no seu navegador para isso.",
        "A fonte de texto é entregue pelo próprio site. A página inicial não carrega imagens de serviços externos.",
        "Se passarmos a usar cookies não essenciais, pediremos o seu consentimento antes, com opção de recusar, e atualizaremos esta Política.",
      ],
    },
    {
      id: "seguranca",
      title: "Segurança",
      paragraphs: [
        "Adotamos medidas técnicas e organizacionais para proteger os dados, incluindo separação dos dados de cada empresa com regras de acesso no banco de dados, controle de acesso por funções, autenticação por provedor especializado, conexão criptografada (HTTPS), cabeçalhos de segurança no site e cópias de segurança diárias, com uma cópia criptografada.",
        "Nenhuma medida elimina todo o risco. Em caso de incidente de segurança que possa causar risco ou dano relevante, comunicaremos a Autoridade Nacional de Proteção de Dados (ANPD) e os titulares afetados, nos termos do art. 48 da LGPD e da regulamentação da ANPD, descrevendo o que aconteceu, os dados envolvidos e as medidas adotadas.",
        "Você também protege os dados: use um e-mail seguro, não compartilhe o acesso, retire quem saiu da equipe e não registre em campos de anotação ou no assistente números de cartão, senhas ou dados sensíveis, como os de saúde.",
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
        "Conta, perfil e dados da empresa: enquanto a conta existir. Quando você exclui a conta em Privacidade e segurança, seus dados pessoais e os dados das empresas que só você usava são eliminados na hora, inclusive os arquivos anexados. Pedidos feitos ao nosso canal de atendimento são cumpridos em até 15 dias.",
        "Pagamentos, cobranças e registros que sustentam obrigações fiscais, contábeis e contratuais: 5 anos, contados do fato, prazo compatível com a prescrição e com as obrigações tributárias. Quando a conta é excluída, ficam apenas valor, data, situação e identificador da cobrança, sem nome nem documento do pagador.",
        "Registro de aceite dos documentos legais: durante a relação e por 5 anos depois dela, para comprovação. Depois que a conta é excluída, ele fica ligado apenas a um identificador interno que não identifica a pessoa.",
        "Dados que a empresa cadastra sobre clientes, fornecedores, equipe, agenda e demais registros: enquanto o ambiente da empresa existir ou até a empresa apagá-los.",
        "Conversas e rascunhos do assistente de agenda: apagados automaticamente depois de 90 dias (prazo padrão).",
        "Registros de auditoria: enquanto existir o ambiente da empresa a que pertencem.",
        "Identificador antifraude do teste grátis: 30 dias (prazo padrão).",
        "Histórico de entregas de notificações de pagamento: 60 dias.",
        "Registros técnicos de acesso do servidor e dos prestadores de infraestrutura: pelo prazo de cada um e, quando a lei exigir guarda de registros de acesso a aplicações, pelo prazo legal (Marco Civil da Internet, art. 15).",
        "Cópias de segurança: as de rotina são substituídas em ciclos de até 8 semanas; cópias feitas em mudanças de infraestrutura são eliminadas quando deixam de ser necessárias.",
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
        "Envie o pedido para o canal de privacidade: " + CONTACT + ". Informe o seu nome, o e-mail da conta e qual direito quer exercer. Quanto mais claro o pedido, mais rápido o atendimento.",
        "Para a sua segurança, podemos pedir uma confirmação de que você é mesmo o titular (por exemplo, responder a partir do e-mail da conta). Só pedimos o necessário para essa confirmação e não usamos esses dados para outra finalidade.",
        "Excluir a conta você mesmo: em Privacidade e segurança (menu do usuário, \"Excluir minha conta\"), a qualquer momento e sem custo. A tela mostra antes o que será apagado; a eliminação é imediata e, quando o envio de e-mails estiver disponível, enviamos um e-mail de confirmação. Se você for a única pessoa da empresa, os dados da empresa também são apagados por inteiro. Se você for o único proprietário de uma empresa com outras pessoas, transfira a propriedade ou remova a equipe antes. Contas de administradores da plataforma não são excluídas por essa tela.",
        "A exportação (cópia) dos dados ainda não é feita pela plataforma: é atendida por nós, manualmente, pelo canal acima, em formato eletrônico de uso comum (por exemplo, CSV ou JSON). Peça a cópia antes de excluir a conta.",
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
        "A eliminação dos dados tem exceções previstas no art. 16 da LGPD. Podemos manter o dado, de forma restrita, para cumprir obrigação legal ou regulatória (por exemplo, registros de pagamento por 5 anos), para exercer ou defender direitos em processo, e para a prevenção de fraude (o identificador irreversível do teste grátis é apagado sozinho em 30 dias, por padrão), sempre em formato anonimizado ou que não identifica você.",
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
