# Planejamento — Chat AI com bots (voz e texto) no Prime Ges

Base: `Planejamento_ChatAI_Bots_SaaS.pdf` (09/11/2026), adaptado ao que o sistema já tem hoje (código e banco de 11/11/2026).
Status: **planejamento, nada implementado**. Decisões abertas na seção 9.

## 1. Resumo em 5 linhas
1. Uma aba **Chat AI** em `/app/chat`: o usuário escreve ou fala ("agenda polimento pro Felipe amanhã às 14h com o Lúcio"), o sistema entende, pergunta só o que falta, mostra um resumo e **só grava depois do clique em Confirmar**.
2. Sem LLM pesado: **regras + dicionário de tags + extração (datas, valores, nomes)**. LLM só como plano B futuro.
3. O Chat **não cria caminho novo de escrita**: cada ação chama as mesmas RPCs que as telas já usam (`create_appointment`, `create_financial_entry`, `adjust_product_stock`…), com a sessão do próprio usuário. Isolamento, permissões e limites de plano vêm de graça.
4. Grande diferença do PDF: **hoje não existe cadastro de veículo/placa** no sistema. Precisa ser decidido antes (seção 9).
5. Estimativa: **MVP em texto (agendar + despesa + estoque) em ~3 semanas**; voz e demais intenções depois.

## 2. Onde o PDF encontra o sistema real
| PDF | Hoje no Prime Ges | Ajuste no plano |
|-----|-------------------|-----------------|
| Isolamento "pelo ID do usuário logado (Clerk)" | O isolamento real é por **empresa** (`company_members` + RLS), e as RPCs resolvem a empresa de `auth.uid()` | Chat usa o cliente Supabase **da sessão** (nunca service role). Mesma barreira das telas |
| Cliente, veículo, colaborador com tags | Existem clientes e profissionais (Equipe). **Veículo não existe** | Criar `aliases` (tags) em clientes/profissionais; veículo: decisão 9.1 |
| Agendar | `create_appointment` aceita cliente/profissional opcionais | Chat exige o que o PDF manda (cliente, serviço, profissional, data, hora); regra configurável por intenção |
| Registrar venda | Venda é rascunho → itens → pagamento → concluir (várias etapas) | Um "executor de venda" orquestra as etapas no servidor, tudo ou nada (como `complete_appointment`) |
| Lançar despesa | `create_financial_entry` | Direto |
| Ajuste de caixa | `create_cash_movement` (exige caixa aberto; agora recusa saída acima do saldo) | Direto, respeitando as mesmas travas |
| Entrada de estoque | Entrada "de verdade" é por **Compras** (gera conta a pagar); ajuste manual é `adjust_product_stock` | Decisão 9.3 |
| Baixa de estoque | `adjust_product_stock` (exige motivo) | Direto |
| Histórico do funcionário (RH) | RH tem presença, vales e pagamentos, **sem histórico de serviços** | Registro do serviço fica no agendamento/venda; vínculo com RH é fase futura |
| Whisper local, "baixo consumo de hardware no servidor local" | O site roda na **Vercel** (sem servidor próprio) | Voz: decisão 9.2 |

## 3. Arquitetura proposta
```
Navegador (/app/chat)                 Servidor (Next.js, Vercel)                  Banco (Supabase)
 texto ou áudio ──► [STT] ──texto──► POST /api/chat/message
                                       1. autentica (Clerk) + empresa + permissão
                                       2. detector de intenção (regras)
                                       3. extratores: data/hora, valor, quantidade, forma de pagamento
                                       4. buscador de tags (cliente, serviço, produto, profissional, veículo)
                                       5. validador de campos obrigatórios da intenção
                                       6. grava/atualiza o "rascunho da ação" ──────────► chat_pending_actions
 ◄── pergunta ou resumo de confirmação ◄─┘
 [Confirmar] ──► POST /api/chat/confirm (id do rascunho + chave de idempotência)
                                       7. recarrega o rascunho DO BANCO (o cliente não manda dados)
                                       8. executor da intenção chama a RPC existente (sessão do usuário)
                                       9. audit_logs (origem = chat) + revalidate das telas
```
Pontos de segurança:
- **O servidor guarda o rascunho**; o botão Confirmar só envia o id. Ninguém altera o que será gravado entre o resumo e a gravação.
- **Idempotência:** confirmar duas vezes (duplo clique, rede lenta) executa uma vez.
- **Rascunho expira** (ex.: 30 min) e é de uso único.
- **Permissão por intenção**, usando `can()` da matriz: funcionário não lança despesa nem ajusta estoque pelo chat se não puder pela tela.
- **Limites de plano** e a trava de assinatura já existentes valem do mesmo jeito (mesmas RPCs/guardas).
- **Sem exclusões/cancelamentos na v1** (só criar). Valor acima de um teto (configurável) pede segunda confirmação.
- **Áudio não é guardado**: transcreve e descarta; só o texto fica (LGPD). Atualizar a Política de Privacidade se o áudio sair do navegador.
- Rate limit por usuário/empresa; tamanho máximo de texto e de áudio.

## 4. Modelo de dados (migrations novas)
- `chat_sessions` (empresa, usuário, criada em) e `chat_messages` (sessão, papel, texto, intenção detectada). Só texto.
- `chat_pending_actions` (empresa, usuário, intenção, `draft jsonb`, `missing text[]`, status `collecting|ready|executed|cancelled|expired`, `expires_at`, `executed_at`, `result_ref`). RLS por empresa **e** usuário.
- `aliases text[]` em `customers`, `services`, `products` e no perfil profissional, com índice GIN; nome tokenizado entra automaticamente (sem exigir cadastro manual de tags).
- Busca: `unaccent` + `pg_trgm` (nome aproximado, sem acento, "Lucio" = "Lúcio"). **Verificar se as extensões estão ativas em Production e TEST** antes.
- Veículos (se aprovado): `customer_vehicles` (empresa, cliente, placa, modelo, cor, `aliases`, ativo), placa única por empresa, formato Mercosul/antigo validado.
- Cada migration com rollback e bateria SQL no TEST (padrão do projeto); **nada em Production sem "Autorizo"**.

## 5. Intenções da v1 e campos obrigatórios
| Intenção | Obrigatórios | Executor (RPC existente) | Permissão | Fase |
|----------|--------------|--------------------------|-----------|------|
| Agendar serviço | cliente, serviço, profissional, data, hora (+ veículo se segmento exigir) | `create_appointment` | qualquer membro | 2 |
| Lançar despesa | descrição, valor, categoria, data (forma de pagamento padrão: a mais usada) | `create_financial_entry` | `finance.view` (gestores) | 2 |
| Baixa de estoque | produto, quantidade, motivo | `adjust_product_stock` | `stock.adjust` | 2 |
| Entrada de estoque | produto, quantidade, valor unitário (+ fornecedor se for compra) | `adjust_product_stock` ou Compras | `stock.adjust` | 3 |
| Ajuste de caixa | tipo (entrada/saída), valor, motivo | `create_cash_movement` | `cash.manual_movement` | 3 |
| Registrar venda | cliente (opcional), itens, valor, forma de pagamento, data | orquestra rascunho→itens→pagamento→`complete_sale` | qualquer membro | 4 |
| Consultas (só leitura): "o que tenho amanhã?", "quanto vendi hoje?" | — | consultas existentes | por permissão | 4 |

Regras de entendimento (pt-BR, sem LLM):
- **Datas/horas:** "hoje", "amanhã", "depois de amanhã", "sexta", "dia 15", "às 14h", "14:30", "duas da tarde". Fuso **America/Sao_Paulo** (usar `src/lib/timezone.ts`). Avaliar `chrono-node` (verificar suporte a português) contra parser próprio.
- **Valores:** "R$ 150", "150 reais", "cento e cinquenta", "1.234,56" (já corrigido o parser no Financeiro; reaproveitar `parseMoneyInput`).
- **Forma de pagamento:** pix, dinheiro, débito, crédito.
- **Desambiguação:** mais de um cliente/produto → lista numerada para escolher. Hoje há clientes com **mesmo CPF e nomes parecidos** nos dados de teste, então esse passo é essencial.
- **Pergunta objetiva do que falta**, uma de cada vez, aceitando resposta curta ("amanhã 14h").

## 6. Tela
- Item de menu "Chat AI" e rota `/app/chat` (adicionar em `route-labels` e na matriz).
- Conversa em bolhas; botão de microfone (fase de voz); sugestões de exemplo no estado vazio.
- **Cartão de confirmação:** campos com links para abrir o perfil (cliente, profissional, produto, venda), valor em destaque, botões **Confirmar** e **Corrigir** (volta a perguntar o campo). Após gravar: resultado com link para o registro criado.
- Mobile em primeiro lugar (é onde se fala no microfone); acessibilidade: tudo operável por teclado, mensagens com `role=status`.

## 7. Voz
| Opção | Prós | Contras |
|-------|------|---------|
| **A. Reconhecimento de voz do navegador** (Web Speech API) | Sem custo, sem servidor, áudio não passa pelo nosso backend | Qualidade varia, melhor no Chrome/Android, no iPhone é irregular; áudio pode ir para o Google |
| B. API hospedada de transcrição (Whisper/similar) | Boa qualidade em pt-BR, funciona em qualquer aparelho | Custo por minuto, áudio sai do sistema (LGPD/política), chave de API em env |
| C. Whisper rodando no navegador (WASM) | Privacidade total | Download grande, lento em celular fraco |
| D. Whisper em servidor próprio (o do PDF) | Controle | Exige servidor 24h e GPU/CPU: fora da nossa infra (Vercel) |

**Recomendação:** lançar **texto primeiro**, depois **A** (rápido de entregar) e **B** como melhoria paga por plano. O motor de intenção recebe sempre texto, então a voz não muda o resto. Escolha final: decisão 9.2.

## 8. Fases, entregas e testes
| Fase | Entrega | Prova de pronto | Estimativa |
|------|---------|-----------------|-----------|
| 0 | Decisões da seção 9; checar extensões `unaccent`/`pg_trgm`; escolher intenções do MVP | Documento aprovado | 2 dias |
| 1 | Migrations: aliases, `chat_*`; busca por tags; (veículos se aprovado). Cadastros ganham campo de tags | Bateria SQL no TEST (isolamento entre empresas, RLS, rascunho de outro usuário inacessível) | 1 semana |
| 2 | Motor texto: detector, extratores, validador, desambiguação; intenções **agendar, despesa, baixa de estoque**; tela e cartão de confirmação; executores | Corpus de **100+ frases reais** em testes unitários (golden), todos os executores com falha simulada | 2 semanas |
| 3 | Entrada de estoque, ajuste de caixa; teto de valor; consultas simples | Testes de permissão por papel (dono/gerente/funcionário) | 1 semana |
| 4 | Venda completa (orquestrada) e consultas | Venda tudo-ou-nada provada com falha no meio | 1,5 semana |
| 5 | Voz (opção A, depois B) | Teste em Android e iPhone reais | 1 semana |
| 6 | Piloto na empresa teste1, depois liberação por plano (flag) | Taxa de acerto e de correção medidas (abaixo) | 1 semana |

Testes obrigatórios (o que os testes reais de hoje mostraram que dá errado em produção):
- **Isolamento:** empresa A nunca vê/confirma rascunho da empresa B; funcionário não executa intenção de gestor.
- **Idempotência:** confirmar 2× grava 1×; rascunho expirado/executado recusa.
- **Frases ruins:** valor com "1.234,56", data no passado, "domingo" quando o profissional não atende (a Agenda já recusa, o chat deve explicar), cliente duplicado, produto com estoque insuficiente, caixa fechado.
- **Não regressão:** o Chat só usa as RPCs; nenhum teste existente muda.
- **Métricas do piloto:** % de ações confirmadas sem correção, % abandonadas, tempo até confirmar, erros por intenção.

## 9. Decisões que preciso de você
1. **Veículos/placa.** O PDF nasceu para estética automotiva, mas o sistema atende vários segmentos (salão, padaria, oficina…). *Recomendo* criar um cadastro de veículo **opcional e só visível para os segmentos automotivos** (estética automotiva, lava-rápido, oficina) e deixar a intenção "agendar" pedir veículo só nesses segmentos. Alternativa: um "item do cliente" genérico (veículo, pet, imóvel).
2. **Voz.** Começar só com texto + navegador (opção A)? *Recomendo sim*, deixando a API hospedada (B) para depois, com aviso na Política de Privacidade.
3. **Entrada de estoque.** Por chat, "entrada" deve gerar **compra com conta a pagar** (como Compras) ou só **ajuste de saldo**? *Recomendo* ajuste de saldo com motivo no MVP e compra completa numa fase posterior.
4. **Quem usa.** Funcionário pode agendar e vender pelo chat, e só gestor lança despesa, ajusta estoque e caixa (igual às telas)? *Recomendo sim.*
5. **Plano.** Chat AI incluído em todos os planos ou recurso de plano superior? Impacta o gerenciamento de planos.
6. **Teto de valor** para segunda confirmação (ex.: acima de R$ 1.000).

## 10. Riscos e como reduzir
- **Entender errado e gravar errado** (dinheiro): confirmação obrigatória, nada de exclusão na v1, teto de valor, histórico no `audit_logs` com origem "chat".
- **Cadastros sujos** (nomes parecidos, CPF repetido): validações de documento já corrigidas (PR #90); desambiguação sempre que houver mais de um resultado.
- **Expectativa de "IA" que entende tudo:** o escopo fixo de intenções é mostrado na tela ("posso agendar, lançar despesa…"); frase não reconhecida vira ajuda objetiva, não adivinhação.
- **Voz imprecisa:** o cartão de confirmação mostra o texto transcrito e permite corrigir antes de qualquer gravação.
- **Custo e abuso:** rate limit, tamanho máximo, flag por plano.
- **Manutenção das regras:** intenções declaradas em um registro único (campos, executor, permissão), com testes de frases; adicionar intenção não exige mexer no motor.

---

# Adendo (decisão do dono, 11/11/2026): persona "Cláudia" e conversa guiada por pré-requisitos

Este adendo **prevalece** sobre o que estiver diferente acima.

## A) Nome e papel
- O módulo no menu se chama **Chat AI**. A agente que conversa se chama **Cláudia** (nome configurável por empresa, padrão "Cláudia").
- O usuário dá uma ordem curta ("Cláudia, faz um agendamento de lavagem detalhada pro cliente João Ferreira"). A Cláudia **entende o tipo de tarefa**, vê **o que o módulo exige** e **pergunta só o que falta**, até ter tudo.
- **Regra de ouro: a Cláudia nunca grava sozinha.** Sempre mostra o resumo e espera o clique em **Confirmar**. Sem confirmação, nada muda no sistema.

## B) Como ela sabe o que perguntar: pré-requisitos vêm dos módulos reais
Cada intenção tem uma ficha com dois níveis, tirada do que o módulo realmente pede:
- **Obrigatório:** sem isso não dá para avançar; a Cláudia pergunta.
- **Recomendado:** ela oferece uma vez ("quer informar o valor? posso usar o preço do serviço") e o usuário pode pular. Evita interrogatório.
- **Padrão:** o que o sistema preenche sozinho (ex.: valor = preço do serviço, data de lançamento = hoje).

| Intenção | Obrigatório | Recomendado | Padrão do sistema | Conferências antes de confirmar |
|----------|-------------|-------------|-------------------|--------------------------------|
| **Agendar serviço** (estética automotiva) | serviço, cliente, profissional, data, hora de início | veículo/placa (se aprovado), observações, valor | **hora de término = início + duração do serviço** (pode ser ajustada); valor = preço do serviço | profissional habilitado para o serviço, dentro do expediente e sem bloqueio/conflito (a Agenda já recusa e a Cláudia explica o motivo); serviço com duração |
| **Cadastrar produto** | nome | categoria, unidade, preço de venda, preço de custo, SKU/código de barras, estoque inicial e mínimo | unidade = un, estoque 0 | SKU/código de barras repetido |
| **Baixa/perda de estoque** ("acabou o limpa-baú") | produto, quantidade que sai (ou "acabou" = saldo 0), motivo | observação | motivo sugerido "perda" ou "acabou" | **o sistema ajusta pelo saldo novo**, então a Cláudia calcula o saldo final a partir da saída pedida e mostra "de 12 para 0" |
| **Entrada de estoque** | produto, quantidade, motivo | valor de custo, fornecedor | — | decisão: ajuste de saldo ou compra (9.3) |
| **Registrar venda** | itens (produto/serviço e quantidade), forma de pagamento ou "a receber" | cliente, desconto, observação | data = hoje | estoque suficiente; total confere |
| **Lançar despesa/receita** | tipo, valor, descrição | categoria, centro de custo, forma de pagamento | data = hoje | valor maior que zero |
| **Movimento de caixa** | entrada/saída, valor, forma, descrição | — | — | caixa aberto; saída em dinheiro não pode passar do saldo (já bloqueado) |

A ficha de cada intenção fica num **registro único** no código; alterar um módulo (ex.: passar a exigir um campo) é mudar a ficha, e os testes acusam quando a ficha e o módulo divergem.

## C) Exemplo de conversa (agendamento)
> **Você:** Cláudia, faz um agendamento de lavagem detalhada pro cliente João Ferreira.
> **Cláudia:** Entendi: **agendamento** de *Lavagem detalhada* para **João Ferreira**. Para marcar eu preciso de:
> 1. **Data e horário de início** (o término eu calculo: a lavagem detalhada dura 2h30)
> 2. **Quem vai fazer o serviço** (Rafael, Lúcio)
> **Você:** Amanhã às 14h com o Lúcio.
> **Cláudia:** Conferi: o Lúcio atende amanhã das 9h às 18h, sem bloqueios. Quer informar a placa ou uma observação? *(pode pular)*
> **Você:** Pode pular.
> **Cláudia:** Confirma este agendamento?
> • Cliente: **João Ferreira** (abrir perfil) • Serviço: Lavagem detalhada • Profissional: **Lúcio** (abrir perfil) • **12/11, 14:00 às 16:30** • Valor: R$ 120,00
> [ **Confirmar** ] [ Corrigir ]

Se houver dois "João Ferreira", a Cláudia mostra os dois (com telefone) e pede para escolher. Se o horário estiver ocupado, ela diz e **oferece os próximos horários livres do profissional**.

## D) Outro exemplo (estoque)
> **Você:** Cláudia, acabou o limpa-baú de 50 litros.
> **Cláudia:** Entendi: **baixa de estoque** de *Limpa-baú 50 L* (estoque atual: 4 un). Vai a zero. Motivo: *acabou*. Deseja registrar uma **compra para repor**? *(pode pular)*
> [ **Confirmar baixa** ] [ Corrigir ]

E para "quero adicionar um produto no estoque, um limpa-baú de 50 litros": ela reconhece **cadastrar produto**, vê que só o nome é obrigatório e pergunta o que o módulo de Produtos/Estoque costuma pedir (categoria, unidade, preço de venda, custo, estoque inicial e mínimo), deixando pular o resto.

## E) Consequências para o plano
1. **Entender "o que a pessoa quis dizer" fica mais importante**: as ordens são faladas livremente ("acabou", "limpa-baú", "faz um agendamento"). Isso reforça a recomendação do **modelo híbrido** (um modelo de linguagem só para *ler* a frase e preencher a ficha; nosso código valida, resolve cadastros e grava). Decisão 9.1 do plano principal e da análise crítica continua em aberto.
2. **Conversa em etapas** (preencher ficha → conferir regras do sistema → resumo → confirmar), com estado salvo no servidor (`chat_pending_actions`) para o usuário poder responder depois ou por partes.
3. **Perguntas econômicas**: obrigatório pergunta; recomendado oferece uma vez; padrão não pergunta.
4. **Teste por ficha**: cada intenção tem um conjunto de frases e conversas completas (ordem incompleta, ordem completa, resposta fora de ordem, mudança de ideia no meio, nome repetido, horário ocupado) antes de ser liberada.
5. **Personalização futura:** nome da agente (Cláudia), tom e fichas por segmento (estética automotiva pede veículo; salão não).
