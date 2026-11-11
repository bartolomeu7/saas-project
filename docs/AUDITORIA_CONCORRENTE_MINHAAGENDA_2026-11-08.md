# Auditoria do concorrente — MinhaAgenda (minhaagendaapp.com.br) × Prime Ges

Data: 08/11/2026 · Escopo: só fontes públicas. **Não criei conta** no concorrente (o cadastro só existe pelos aplicativos de celular e eu não crio contas em serviços de terceiros); por isso não testei a velocidade nem a tela real da agenda. Onde a nota depende disso, está marcado como "estimativa".

## 1. Quem é o concorrente
- **Produto:** MinhaAgenda, da HighEnd Tecnologia (Araguari/MG, CNPJ 19.496.533/0001-34). No ar desde março de 2020, versões 1.322 a 1.324 em ago/out de 2026 (atualização ativa).
- **Público:** profissional autônomo de atendimento com hora marcada (esteticista, manicure, barbeiro, tatuador, personal, dentista, médico…).
- **Tração:** mais de 1 milhão de downloads no Android, nota 4,9 (12,7 mil avaliações no Google Play; 22 mil na App Store, 4,9, nº 63 em Produtividade no Brasil).
- **Canais:** aplicativo Android e iOS (principal) e portal web (`portal.minhaagendaapp.com.br`, só login: quem não tem conta é mandado para as lojas).
- **Não confundir com:** minhaagenda.ai, minhaagendavirtual.com.br, minhaagendaonline.com e minhaagenda.cloud — são empresas diferentes (CNPJs diferentes).

## 2. Módulos e ferramentas encontrados
Menu do aplicativo (captura oficial): Agenda · Cobranças · Comandas · Mensagens pré-definidas · Clientes · Serviços e Pacotes · Produtos e Estoque · Despesas · Funcionários · Relatórios (Performance, Resumo Financeiro, Melhores Clientes) · Configurações · Suporte e Ajuda.

| Módulo | O que oferece (fonte pública) |
|---|---|
| Agenda digital | Linha do tempo do dia com blocos coloridos, faixa da semana, busca, remarcar, status "a confirmar", agendamento com vários serviços/pacote, produtos no agendamento, exportar em PDF, ícone de aniversariantes, compartilhar a agenda |
| Engajamento | Lembrete e mensagens por WhatsApp (um toque abre a conversa com texto pronto), mensagens pré-definidas e "mensagem múltipla", aniversariantes dos próximos 14 dias, cartão fidelidade |
| Agendamento online | Link para o cliente marcar; **o cliente precisa entrar com Google ou e-mail** (conta) para marcar (conferido na página pública) |
| Clientes | Cadastro detalhado, ficha de anamnese (preenchida e assinada pelo cliente; vai por e-mail ao profissional e **não fica guardada no sistema**, segundo os Termos), melhores clientes, clientes sumidos, novos × antigos |
| Cobranças | Registro de dívidas por cliente, multa por não comparecimento (em % e em R$), recibo personalizado (relato de clientes) |
| Financeiro e relatórios | Receita, gastos e lucro do mês, formas de pagamento em %, top serviços, receita por mês no ano, fluxo de caixa diário, despesas fixas e variáveis, **metas financeiras**, várias contas |
| Equipe | Funcionários, comissão (com dedução da taxa do cartão), compartilhamento de agenda |
| Produtos e estoque | Cadastro e controle simples, venda de produtos, comandas |
| Plataforma | Dados na nuvem, celular, tablet e web |
| Suporte | Somente WhatsApp (texto/áudio), em horário comercial; sem ligação |
| Outros apps da empresa | Turmas Pilates, Turmas Aluno, MinhaAgenda Serviço (ordem de serviço e orçamento) |

**Planos e preço:** os preços ficam dentro das lojas (compras no app) e **não são públicos**; não consegui verificar o valor. Teste grátis: 30 dias nas lojas, mas **14 dias nos Termos de Uso** (inconsistência). Há planos mensal, semestral e anual. Após o teste sem pagar, o acesso é suspenso e os dados são apagados depois de 180 dias.

**Limitações e reclamações públicas:** lembrete automático não existe (usuários pedem desde 2024); financeiro "básico" e confuso (valores de comissão e resumo financeiro diferentes, falta uma visão geral de entradas e saídas, 2026); alerta de aniversário discreto; anamnese sem envio para o cliente preencher (2023, a empresa respondeu que existe como personalizar); proibido integrar por API/robô sem autorização; imagens do site são de 2021.

## 3. A agenda do concorrente a fundo
Evidências: captura oficial do dia (blocos por horário com cliente, serviço, observação e etiqueta de situação), tela do cartão do atendimento (ligar, WhatsApp, editar, apagar, cobrança), "novidades" das versões, Termos e avaliações.
- **Leitura:** linha do tempo do dia, com cor por bloco e duração proporcional; faixa de 7 dias no topo; cabe numa tela de celular. Ícones de PDF, aniversário, busca e calendário.
- **Fluxo:** marcar rápido, buscar e alterar, registrar não comparecimento e aplicar multa, registrar cobrança. Pacote com vários serviços e produtos no atendimento (novidades de 2026).
- **Comunicação:** do próprio atendimento abre o WhatsApp com lembrete pronto. **É manual**: o profissional precisa tocar para cada cliente.
- **Qualidade da informação:** o atendimento liga cliente, serviço, cobrança e relatórios (agendamentos por cliente). Ponto fraco: números de comissão e resumo financeiro divergem na visão dos usuários.
- **Eficiência:** aplicativo nativo, com avaliação alta dizendo "rápido e fácil" (estimativa; não medi).

## 4. O que o Prime Ges tem hoje (conferido no código e no site)
Clientes (com histórico, documentos, indicadores) · Produtos · Serviços · Vendas · Fidelidade (pontos, níveis, campanhas, multiplicadores, sorteio) · Estoque · Compras e Fornecedores · Caixa (abertura, fechamento, conferência) · Financeiro (contas a pagar e receber, categorias, centros de custo, DRE) · Relatórios com CSV · Equipe com permissões por papel · Agenda (dia e 3 semanas, status, remarcar, disponibilidade e bloqueios por profissional, serviços por profissional, bloqueio de conflito) · Pix · 2FA · LGPD · painel de administração da plataforma.
**Não tem:** WhatsApp (só guarda o número), lembretes, agendamento online, anamnese, comissão, metas, recibo, multa de não comparecimento, pacote/vários serviços, recorrência, aplicativo ou PWA, nota fiscal. A agenda concluída **não gera venda nem cobrança**. Teste grátis de **1 dia**. Planos: Mensal R$ 89, Trimestral R$ 240, Anual R$ 899 (2 usuários extras).

## 5. Notas (0 a 10)
### Agenda
| Item | Concorrente | Prime Ges | Por quê |
|---|---|---|---|
| Leitura e visualização | 8 | 6,5 | Concorrente: linha do tempo com duração e cor, pensada para celular. Prime Ges: 3 semanas, grade por hora e cores de situação (boas), mas sem mês, sem arrastar, bloco sem duração proporcional, faixa fixa de 8h às 18h |
| Recursos de agendamento | 8,5 | 6,5 | Concorrente: pacote, vários serviços, produtos, multa, cobrança, mensagens prontas. Prime Ges: regras fortes (conflito, disponibilidade, bloqueios, serviços por profissional), mas sem pacote, recorrência nem multa |
| Comunicação com o cliente | 7 | 1 | Concorrente: WhatsApp em um toque, aniversário, mensagens prontas (manual, não automático). Prime Ges: nada |
| Agendamento online | 6 | 0 | Concorrente tem, mas o cliente precisa criar conta (atrito). Prime Ges não tem |
| Equipe e comissão | 8 | 6 | Concorrente: funcionários, comissão e taxa do cartão. Prime Ges: papéis e permissões, sem comissão |
| Qualidade da informação | 7,5 | 5 | Concorrente liga atendimento a cobrança e relatórios (com críticas de divergência). Prime Ges: dados conferidos e batendo, mas a agenda não alimenta vendas/cobrança e o relatório da agenda é só contagem |
| Eficiência | 8 | 5,5 | Concorrente: app nativo (estimativa). Prime Ges: concluir em um clique e salvar em cerca de 2,3 s (medido depois), mas as páginas levam 1,4 a 2,3 s e não há automação |
| **Média da agenda** | **7,5** | **4,4** | |

### Plataforma
| Item | Concorrente | Prime Ges |
|---|---|---|
| Financeiro e relatórios | 7 | 7,5 |
| Clientes / CRM | 8 | 7 |
| Vendas, produtos, estoque, compras | 5 | 8 |
| Fidelidade | 6 | 8 |
| Segurança e LGPD | 6 | 8,5 |
| Acesso (app e web) | 9 | 4 |
| Suporte (estimativa) | 8 | 4 |
| Prova social e maturidade | 10 | 1,5 |
| Teste grátis e porta de entrada | 6,5 | 4 |
| **Geral (agenda com peso dobrado)** | **7,3** | **5,6** |

## 6. O que fazer primeiro (maior efeito, menor custo)
1. **Atendimento concluído vira venda/cobrança em um clique** — aproveita o que o Prime Ges tem de melhor (vendas, caixa, financeiro) e o concorrente faz de forma mais simples.
2. **Lembrete e confirmação por WhatsApp com texto pronto** (link `wa.me` com mensagem preenchida; o número do cliente já existe). Sem custo de API. Depois, envio automático.
3. **Agendamento online por link público sem exigir conta do cliente** — o concorrente exige login; aqui há vantagem clara.
4. **Teste grátis maior** (hoje 1 dia, o concorrente dá 14 a 30).
5. **Pacote/vários serviços, comissão e multa por não comparecimento.**
6. **PWA instalável** (ícone na tela do celular) e **visão de mês** na agenda.
7. **Velocidade das páginas** (1,4 a 2,3 s por página é o ponto mais fraco de eficiência; salvar leva cerca de 2,3 s).

## 7. Como validar melhor
Se quiser uma análise por dentro da agenda do concorrente, você mesmo cria o teste grátis no celular e me envia prints ou gravação de tela; eu analiso sem eu mesmo criar conta.
