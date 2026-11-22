# Plano: igualar o MinhaAgenda nas 8 áreas e depois superar

Data: 08/11/2026 · Base: auditoria do mesmo dia (`AUDITORIA_CONCORRENTE_MINHAAGENDA_2026-11-08.md`).
Áreas deste plano (as que o dono escolheu): Leitura e visualização · Recursos de agendamento · Agendamento online · Equipe e comissão · Qualidade da informação · Eficiência · Clientes/CRM · Acesso (app e web).
**Fora deste plano de propósito:** comunicação com o cliente (WhatsApp/lembretes) e as áreas onde o Prime Ges já ganha. Ela continua sendo a maior diferença nota a nota (1 × 7) e fica para depois.

## 1. Metas por área

| Área | Hoje | Meta "igualar" | Meta "superar" (fase 2 do plano) |
|---|---|---|---|
| Leitura e visualização | 6,5 | 8 | Colunas por profissional lado a lado, arrastar para remarcar, modo foco, atalhos |
| Recursos de agendamento | 6,5 | 8,5 | Pacote com saldo de sessões, lista de espera, encaixe, feriados, ações em lote |
| Agendamento online | 0 | 6 | **Sem login do cliente**, escolha de profissional, **sinal por Pix** (o Pix já está integrado), cliente remarca sozinho |
| Equipe e comissão | 6 | 8 | Comissão escalonada, metas por profissional, extrato do profissional, vale/adiantamento |
| Qualidade da informação | 5 | 7,5 | Ocupação e receita por horário, conciliação automática, alertas de divergência |
| Eficiência | 5,5 (estimativa; medido: página 1,4–2,3 s, salvar 2,3 s) | 8 | Página abaixo de 1 s e ação abaixo de 1,5 s (p75), atalhos de teclado, ações em lote |
| Clientes / CRM | 7 | 8 | Anamnese **guardada e criptografada** com assinatura (o concorrente não guarda), linha do tempo única, retorno automático |
| Acesso (app e web) | 4 | 7 com app instalável (PWA); 9 com as lojas | Push, lojas Android e iOS |

Projeção: agenda de 4,4 para cerca de 7,6 e geral de 5,6 para cerca de 7,3 ao fim da fase 4 (empata com os 7,3 do concorrente). Estimativa: depende de cada nota ser alcançada.

## 2. Ponto de partida medido (08/11/2026, teste1)
- Páginas autenticadas respondem em **1,4 a 2,3 s** (3 medidas em cada uma de Agenda, Clientes, Financeiro e Relatórios). O endpoint público `/api/health` responde em 0,25 a 0,37 s.
- Cadeia: navegador → borda em São Paulo (gru1) → função na Virgínia/EUA (iad1) → banco na Virgínia (us-east-1). Banco e função estão juntos; o que pesa é a distância do usuário e o número de chamadas em fila.
- O `middleware` faz até 5 consultas em sequência por requisição (perfil, vaga de sessão, 2FA, consentimento, assinatura).
- **Correção:** o "salvar leva de 8 a 15 s" que apareceu na auditoria vinha das esperas dos meus testes, não de medição. Medido de verdade no navegador: **confirmar atendimento = 2,4 s e criar atendimento = 2,3 s** no total (1,7 s até a resposta). O ponto fraco real é cerca de **1,4 a 2,3 s por página**.
- Hoje a agenda guarda **um serviço por agendamento** (`appointments.service_id`), existe `sale_id` sem uso, e não há tabela de comissão, de anamnese, de página pública nem manifesto de app.

## 3. Fases, PRs e ordem

Regras mantidas: PR pequeno; o dono mescla; banco primeiro no TESTE com bateria e rollback; **Produção só com "Autorizo" por migração**; testes novos em cada PR; reteste no site real depois do deploy.

### Fase 1 — Velocidade e base (eleva Eficiência, Informação e Acesso)
| PR | O que entrega | Banco |
|---|---|---|
| 1.1 Medição | Tempo de servidor por etapa (Server-Timing + logs), tabela de linha de base de 10 ações-chave | não |
| 1.2 Identidade em cache | Cada página repetia a chamada à API do Clerk e a consulta de "quem é o usuário" cerca de 8 vezes; passa a 1 por requisição; leituras do layout em paralelo | não |
| 1.3 Porteiro (middleware) em paralelo | As 4 a 5 consultas do middleware passam a rodar juntas (só depois de medir o ganho do 1.2) | não |
| 1.4 Ações rápidas | Menos revalidação pesada, consultas em paralelo, resposta imediata na tela (otimista) em status de agenda, vendas e cadastros | não |
| 1.5 Concluir vira venda | Concluir atendimento cria a venda e a cobrança em um clique, idempotente, ligada a `appointments.sale_id` | 1 função (autorização) |
| 1.6 PWA | Manifesto, ícones, instalar na tela inicial, abertura rápida, tela offline amigável, menu inferior no celular | não |
| 1.7 (decisão) | Mover o banco para São Paulo (sa-east-1): maior ganho de velocidade, mas é migração de dados com janela de manutenção; só com decisão do dono | projeto novo |

### Fase 2 — Agenda de primeira linha (Leitura e Recursos)
| PR | O que entrega | Banco |
|---|---|---|
| 2.1 Linha do tempo | Dia com duração proporcional, linha do "agora", visão de mês, colunas por profissional, busca, PDF do dia | não |
| 2.2 Arrastar | Arrastar para remarcar com a mesma validação de conflito | não |
| 2.3 Vários serviços e pacote | Um atendimento com N serviços (duração e preço somados); pacote de serviços | sim (itens do atendimento, migra os atuais) |
| 2.4 Produtos, multa e cobrança | Produtos no atendimento; multa por não comparecimento em % e em R$; cobranças em aberto por cliente | sim |
| 2.5 Recorrência | Repetir semanal, quinzenal, mensal; lembrete de periodicidade | sim |

### Fase 3 — Equipe, comissão e informação
| PR | O que entrega | Banco |
|---|---|---|
| 3.1 Comissão | Percentual por profissional e por serviço; base bruta ou líquida da taxa do cartão; cálculo ao concluir; relatório por período; pagar comissão gera despesa e movimento de caixa | sim |
| 3.2 Agenda por profissional | O profissional vê só a própria agenda; compartilhar agenda; metas por profissional | sim (leve) |
| 3.3 Informação | Relatórios de agenda por profissional, serviço e cliente; taxa de não comparecimento; ocupação; fluxo de caixa diário; metas financeiras; visão geral única de entradas e saídas | não |

### Fase 4 — Agendamento online (o maior item novo)
| PR | O que entrega | Banco |
|---|---|---|
| 4.1 Base pública | Página `/agendar/<empresa>` sem login do cliente; horários livres calculados com disponibilidade, bloqueios, conflitos e duração; nome e telefone; cria agendamento "a confirmar"; link para o cliente cancelar ou remarcar | sim (funções públicas restritas) |
| 4.2 Segurança | Limite de tentativas, desafio anti-robô, validação de telefone, consentimento LGPD, nenhuma tabela exposta (só funções específicas) | junto com 4.1 |
| 4.3 Painel | Ativar, escolher serviços e profissionais, antecedência mínima, limite de dias, aprovação automática ou manual, aviso de novos pedidos, lista de pendentes | sim (configuração) |
| 4.4 Confirmação | Página de confirmação e link de WhatsApp com texto pronto (e-mail só depois da decisão do domínio) | não |

### Fase 5 — Clientes / CRM
| PR | O que entrega | Banco |
|---|---|---|
| 5.1 Anamnese | Modelos de ficha com campos configuráveis; preencher no painel ou enviar link para o cliente preencher e assinar; **guardar criptografada**; consentimento específico para dado de saúde; PDF | sim (autorização, dado sensível) |
| 5.2 Relacionamento | Clientes sumidos, novos × recorrentes, aniversariantes com alerta visível no painel, etiquetas, importar CSV, linha do tempo única (agenda, vendas, cobranças) | sim (leve) |

### Fase 6 — Lojas
| PR | O que entrega |
|---|---|
| 6.1 Push | Avisos no celular (novo pedido de agendamento, atendimento do dia) |
| 6.2 Android | PWA empacotado para o Google Play |
| 6.3 iOS | Empacotamento para a App Store (exige conta paga e atenção às regras de assinatura da Apple) |

## 4. Critérios de aceite (como saber que igualou)
- **Eficiência:** página autenticada abaixo de 1 s e ação de salvar abaixo de 1,5 s no p75, medidos na teste1 antes e depois (linha de base: 1,4–2,3 s e 2,3 s).
- **Leitura:** dia em linha do tempo proporcional, mês, colunas por profissional, tudo legível no celular.
- **Recursos:** criar atendimento com 2 serviços, pacote, recorrente e com multa; tudo reaparece correto nos relatórios.
- **Online:** um cliente novo, sem conta, marca um horário no celular em até 4 toques; horário ocupado nunca aparece; 50 tentativas seguidas são barradas.
- **Comissão:** o valor do profissional bate entre a tela de comissão, o relatório e a despesa paga (o ponto fraco do concorrente).
- **Informação:** concluir atendimento, venda, caixa, financeiro e relatório batem número a número (rodada de teste com dados inventados, como as 3 anteriores).
- **CRM:** ficha preenchida pelo cliente por link, assinada, guardada e reaberta no cadastro.
- **Acesso:** instalar na tela inicial e abrir em menos de 2 s.

## 5. Riscos
1. **Páginas públicas expostas à internet** (agendamento online): spam, leitura indevida de dados, LGPD. Mitigação: só funções restritas, limite de tentativas, revisão de segurança antes de cada Produção.
2. **Anamnese é dado de saúde** (LGPD, dado sensível): consentimento específico, criptografia, prazo de guarda e exclusão.
3. **Migração de vários serviços por atendimento** toca os agendamentos existentes: copiar o serviço atual para a nova tabela, com prova de retorno (rollback) no TESTE.
4. **Lojas de aplicativos** têm regras de pagamento próprias (a Apple cobra comissão sobre assinatura dentro do app e restringe Pix externo): decisão do dono antes da fase 6.
5. **Mover o banco de região** é a maior alavanca de velocidade e o maior risco: só com decisão e janela combinada.
6. **Escopo:** são cerca de 25 PRs. A ordem acima entrega valor a cada fase; dá para parar depois de qualquer uma.

## 6. Decisões que preciso do dono (nenhuma bloqueia a Fase 1)
1. Comissão: base padrão **bruta** ou **líquida da taxa do cartão**?
2. Agendamento online: aprovação **automática** ou **manual** por padrão? Cobrar **sinal por Pix**?
3. Lojas: aceita criar as contas de desenvolvedor (Google Play e Apple) e entrar nas regras de assinatura delas?
4. Mover o banco para São Paulo (ganho grande de velocidade)? Faço o estudo de custo e risco antes de pedir autorização.
5. E-mail (Resend e domínio): ainda pendente; só afeta confirmações por e-mail.
6. Quando entrar em "superar", incluir a comunicação por WhatsApp (lembretes e confirmações)?

## 7. Como vou trabalhar
Mesma rotina das 3 últimas rodadas: investigar, PR pequeno, TESTE com bateria, link para o dono mesclar, autorização por migração, reteste no site real, memória atualizada. Ao fim de cada fase, nova nota comparada com o concorrente.

## 8. Resultado medido da Fase 1 (velocidade) — 08/11/2026
Mediana do tempo até a resposta, teste1 (4 medidas por página):

| | Antes | Depois do PR #76 (identidade em cache) | Depois do PR #77 (middleware em paralelo) |
|---|---|---|---|
| Agenda | 2,20 s | 1,54 s | **1,07 s** |
| Clientes | 1,72 s | 1,38 s | **0,88 s** |
| Financeiro | 1,77 s | 1,30 s | **0,90 s** |
| Relatórios | 1,49 s | 1,33 s | **0,95 s** |
| Criar atendimento (total) | 2,3 s | 1,5 s (concluir) | **1,2 s** |

Referência: o endpoint público responde em 0,23 a 0,30 s (piso de rede). Meta (página abaixo de 1 s, ação abaixo de 1,5 s): praticamente atingida. Sobra cerca de 0,6 a 0,8 s de servidor por página; o próximo ganho grande seria o banco em São Paulo (decisão do dono, item 1.7).
