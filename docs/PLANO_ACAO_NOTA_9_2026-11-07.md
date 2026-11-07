# Plano de ação — levar todos os módulos do Prime Ges à nota 9,0

Data: 07/11/2026. Base: `docs/AUDITORIA_MODULOS_2026-11-07.md` (média dos módulos do cliente hoje: 7,0).
Uma fase só, todos os módulos andando juntos, organizada **por ação do cliente** (o que ele faz no dia a dia), e não por pasta de código.

---

## 1. O que é "nota 9,0" (a régua)

Um módulo só recebe 9,0 quando passa nos **7 critérios** abaixo, com evidência. Sem evidência, a nota não sobe.

| # | Critério | Como se prova |
|---|---|---|
| R1 | **Fluxo completo**: começa e termina sem beco sem saída | roteiro do caminho principal executado sem erro |
| R2 | **Recursos que o cliente espera** para o tipo de negócio dele | lista de recursos do módulo (seção 5) toda marcada |
| R3 | **Funcionário consegue trabalhar** (permissão certa por papel) | matriz papel × módulo testada |
| R4 | **Testado**: unitário + banco + teste de tela (E2E) do caminho principal | testes verdes no CI |
| R5 | **Provado com dado real** em produção (rodada de uso) | relatório da rodada, falhas corrigidas |
| R6 | **Celular e acessibilidade**: usável no celular, axe com 0 violações, teclado | medição axe + teste em 375 px |
| R7 | **Erros monitorados e ajuda na tela**: estados vazio/carregando/erro, aviso curto de como usar | Sentry recebendo, textos de ajuda revisados |

Nota final = reauditoria no fim, módulo a módulo, marcando R1–R7 com a evidência. Eu não me dou nota sem prova.

---

## 2. Menu organizado por ação (e como o cliente enxerga)

Hoje o menu agrupa por "tipo de cadastro" (Gestão, Operação, Análises, Empresa). Proposta: agrupar pelo que a pessoa **quer fazer**.

| Grupo (ação) | Itens | Observação |
|---|---|---|
| **Início** | Dashboard | Atalhos mudam por tipo de negócio e por papel |
| **Vender** | Vendas · Orçamentos (novo) · Caixa · Agenda | O caminho do dinheiro entrando |
| **Cadastros** | Clientes · Produtos · Serviços · Fornecedores | Tudo com "Importar planilha" |
| **Estoque e compras** | Estoque · Compras | Reposição sugerida liga os dois |
| **Dinheiro** | Financeiro · Relatórios | Contas, fluxo de caixa, lucro |
| **Relacionar** | Fidelidade | Pontos, campanhas, aniversariantes |
| **Minha empresa** | Equipe · Assinatura · Configurações · Ajuda | |

Regras do menu (para o cliente ver só o que importa):
- **Por papel**: funcionário só vê o que a matriz de permissões libera (hoje vê tudo e leva erro ao clicar).
- **Por tipo de negócio** (padaria, lava-rápido, mercadinho, salão, oficina etc.): itens ficam em destaque ou recolhidos conforme o segmento (ex.: lava-rápido destaca Agenda e Serviços; mercadinho destaca Produtos e Estoque). Nada é removido, só reordenado.
- **Nada "Em breve" solto**: o atalho "Novo orçamento" hoje aparece desabilitado; passa a existir de verdade (VEN-3).

**Vitrine pública (o que o visitante vê):** o site hoje lista só 8 módulos. Compras, Fornecedores, Agenda, Equipe e Relatórios existem e não aparecem. A página inicial passa a mostrar os mesmos grupos acima, com print real do sistema (dados de demonstração) e uma página por tipo de negócio. (SIT-1 a SIT-4)

---

## 3. Como executar tudo ao mesmo tempo (sem um pisar no outro)

Sete frentes, cada uma mexendo em áreas de código diferentes. Cada frente vira seu próprio conjunto de PRs pequenos (um assunto por PR) para você revisar e mesclar.

| Frente | Cuida de | Áreas de código |
|---|---|---|
| **A. Fundação** | Next.js, Sentry, E2E, CI, rate limit, backup, CSP, segurança | `package.json`, `tests/`, `.github`, `next.config.js`, `middleware` |
| **B. Vender** | Vendas, Orçamentos, Caixa, recibo | `lib/sales`, `lib/cash-register`, `app/vendas`, `app/caixa`, novo `orcamentos` |
| **C. Cadastros** | Clientes, Produtos, Serviços, Fornecedores, importação | `lib/customers`, `lib/products`, `lib/services`, `lib/suppliers` |
| **D. Estoque e dinheiro** | Estoque, Compras, Financeiro, Relatórios | `lib/purchases`, `lib/finance`, `lib/reports`, `app/estoque` |
| **E. Pessoas e relacionamento** | Agenda, Equipe, Fidelidade, permissões | `lib/agenda`, `lib/team`, `lib/loyalty` |
| **F. Comunicação e conta** | E-mail, WhatsApp, Assinatura, Configurações, Dashboard, Jurídico | `lib/billing`, `lib/settings`, `lib/legal`, dashboard |
| **G. Vitrine e ajuda** | Menu por ação, site público, Ajuda, PWA, documentação | `components/app/nav-items.ts`, `config/marketing.ts`, `docs/` |

**Regras para não dar conflito:**
1. Arquivos compartilhados têm **um dono**: `nav-items.ts` e `route-labels.ts` (G), `middleware.ts` e `package.json` (A), `types/supabase.ts` (quem criar a migration regenera só a própria parte).
2. Migrations com horário único e nunca editar migration já aplicada.
3. **Banco: sempre no TEST primeiro, com bateria SQL e rollback. Produção só com sua autorização por migration** (como combinado).
4. Cada PR passa em tipos, lint, testes e build antes de você ver. Você mescla.
5. A Frente A entrega primeiro a base (E2E, Sentry, Next novo); as outras já usam isso ao testar.

---

## 4. Ações transversais (valem para todos os módulos)

### T1. Fundação de qualidade (Frente A)
| ID | Ação | Tam. | Critério |
|---|---|---|---|
| FUN-1 | Atualizar Next.js 16.3.8 → 16.4.5 (3 avisos de segurança) e republicar | P | R4 |
| FUN-2 | Sentry (tela + servidor) com alerta por e-mail/WhatsApp | M | R7 |
| FUN-3 | Monitor de site fora do ar (uptime) + página de saúde no admin | P | R7 |
| FUN-4 | Playwright E2E: cadastro → empresa → produto → venda → caixa; roda no CI contra o TEST isolado | G | R4 |
| FUN-5 | Baterias SQL rodando no CI (Postgres descartável) | M | R4 |
| FUN-6 | Axe nas telas logadas (CI) e teste em 375 px | M | R6 |
| FUN-7 | Limite de tentativas/requisições (Vercel Firewall ou Upstash) nas ações sensíveis | M | R4 |
| FUN-8 | CSP em modo "só relatório" → depois ativar; `security.txt` | M | — |
| FUN-9 | Prova de **restauração** do backup do banco (restaurar em projeto de teste e conferir) | M | — |
| FUN-10 | Zod 3 → 4 (aviso de memória) em PR isolado | G | — |

### T2. Permissões do funcionário (Frente E, usa tudo)
| ID | Ação | Tam. |
|---|---|---|
| PER-1 | **Matriz papel × módulo** documentada (dono, admin, funcionário) e aprovada por você | P |
| PER-2 | Menu e botões respeitam a matriz (esconder o que não pode, em vez de dar erro) | M |
| PER-3 | Banco confere a mesma matriz (funções já checam; revisar caixa, financeiro, estoque) | M |
| PER-4 | Teste automatizado: cada papel × cada módulo | M |

### T3. Entrada e saída de dados (Frente C)
| ID | Ação | Tam. |
|---|---|---|
| DAD-1 | Importar planilha (CSV/XLSX) de clientes, produtos, serviços e fornecedores, com prévia e relatório de erros por linha | G |
| DAD-2 | Modelo de planilha para baixar em cada tela | P |
| DAD-3 | Exportar CSV em todas as listas | M |

### T4. Documentos imprimíveis (Frente B)
| ID | Ação | Tam. |
|---|---|---|
| DOC-1 | Recibo de venda (imprimir, PDF, enviar por WhatsApp/e-mail) com logo e dados da empresa | M |
| DOC-2 | Comprovante de fechamento de caixa | P |
| DOC-3 | Orçamento em PDF/imprimir | P |
| DOC-4 | Relatórios em PDF | M |

### T5. Comunicação (Frente F)
| ID | Ação | Tam. |
|---|---|---|
| COM-1 | E-mail transacional (Resend, domínio verificado): boas-vindas, recibo de assinatura, aviso de vencimento, exclusão de conta | M |
| COM-2 | WhatsApp por **link** (`wa.me`, sem custo de API) em ficha do cliente, recibo, agenda e cobrança | M |
| COM-3 | Canal de suporte: botão **Ajuda** no app (e-mail + WhatsApp) | P |
| COM-4 | WhatsApp automático via API oficial (custo por mensagem) — só se você decidir | G |

### T6. Ajuda e primeiros passos (Frente G)
| ID | Ação | Tam. |
|---|---|---|
| AJU-1 | Assistente de início por tipo de negócio (já existe "Primeiros passos" no dashboard; completar com modelos de produtos/serviços do segmento) | M |
| AJU-2 | Central de ajuda dentro do app (passo a passo curto de cada módulo) | M |
| AJU-3 | Dica de uso em cada tela vazia ("o que fazer aqui") | M |
| AJU-4 | PWA: instalar no celular como app (manifesto + ícones) | P |

---

## 5. Ações por módulo (do menu por ação)

Legenda de tamanho: **P** = pequeno (poucas horas), **M** = médio (1 a 2 sessões), **G** = grande (várias sessões).
"Hoje → alvo" usa as notas da auditoria. Tudo abaixo, mais as transversais, é o que leva ao 9,0.

### VENDER

#### Vendas (7,5 → 9,0) — Frente B
| ID | Ação | Tam. | Critério |
|---|---|---|---|
| VEN-1 | Recibo imprimível/enviável (DOC-1) | M | R2 |
| VEN-2 | **Venda rápida de balcão**: busca por código de barras (leitor USB já "digita"), atalhos de teclado, concluir em poucos toques | M | R1 R2 |
| VEN-3 | **Orçamentos**: criar, enviar, aprovar e converter em venda (módulo novo; tabela + funções no banco) | G | R2 |
| VEN-4 | Pagamento dividido, troco e venda a prazo (liga em contas a receber, que já existe) | M | R2 |
| VEN-5 | Vendedor/atendente em cada venda (base para comissão) | P | R2 |
| VEN-6 | E2E: vender, cancelar, devolver estoque | M | R4 |
| VEN-7 | Rodada real: 20 vendas variadas (Pix, dinheiro, desconto, pontos, cancelamento) | M | R5 |

#### Caixa (7 → 9,0) — Frente B
| ID | Ação | Tam. | Critério |
|---|---|---|---|
| CAI-1 | **Funcionário opera o caixa** (abrir/fechar/lançar), com sangria e ajuste só pelo dono | M | R3 |
| CAI-2 | Um caixa por operador/turno (hoje é um por empresa) | G | R1 |
| CAI-3 | Fechamento por forma de pagamento (dinheiro, Pix, débito, crédito) com diferença destacada | M | R2 |
| CAI-4 | Comprovante de fechamento (DOC-2) | P | R2 |
| CAI-5 | E2E: abrir → vender → sangria → fechar | M | R4 |

#### Agenda (6 → 9,0) — Frente E
| ID | Ação | Tam. | Critério |
|---|---|---|---|
| AGE-1 | Visões **semana e mês** em grade, além do dia | G | R2 |
| AGE-2 | Remarcar clicando/arrastando; cores por status e por profissional | M | R2 |
| AGE-3 | Lembrete ao cliente por WhatsApp (link pré-preenchido, COM-2) | P | R2 |
| AGE-4 | Agendar direto da ficha do cliente e do serviço | P | R1 |
| AGE-5 | Atendimento concluído vira venda com um clique (a ligação `sale_id` já existe no banco) | M | R1 |
| AGE-6 | Página pública de agendamento para o cliente final (opcional, vira diferencial) | G | R2 |
| AGE-7 | E2E: marcar → remarcar → concluir → venda | M | R4 |

### CADASTROS

#### Clientes (8 → 9,0) — Frente C
| ID | Ação | Tam. |
|---|---|---|
| CLI-1 | Importar planilha (DAD-1) e exportar (DAD-3) | — |
| CLI-2 | Botões WhatsApp / ligar / e-mail na ficha (COM-2) | P |
| CLI-3 | Aniversariantes do mês e **clientes sem comprar há X dias** (lista para reativar) | M |
| CLI-4 | Detectar e mesclar duplicados (mesmo telefone/CPF) | M |
| CLI-5 | E2E: cadastrar, editar, desativar, documento | M |

#### Produtos (7,5 → 9,0) — Frente C
| ID | Ação | Tam. |
|---|---|---|
| PRO-1 | Importar/exportar planilha (DAD-1/3) | — |
| PRO-2 | Foto do produto (Storage) | M |
| PRO-3 | Margem e preço sugerido visíveis no cadastro (custo e preço já existem) | P |
| PRO-4 | Validade e lote (opcional; padaria e mercadinho) com alerta de vencimento | M |
| PRO-5 | Etiqueta com código de barras para imprimir | M |
| PRO-6 | Variações (tamanho/cor) — opcional, só se houver demanda de segmento | G |
| PRO-7 | E2E: cadastrar, ajustar estoque, desativar | M |

#### Serviços (7,5 → 9,0) — Frente C
| ID | Ação | Tam. |
|---|---|---|
| SER-1 | Duração e profissional padrão amarrados à Agenda | M |
| SER-2 | Preço por **porte/variação** (ex.: carro pequeno/médio/grande no lava-rápido) | M |
| SER-3 | Pacotes e combos de serviços | M |
| SER-4 | Importar/exportar (DAD) e E2E | M |

#### Fornecedores (6,5 → 9,0) — Frente C
| ID | Ação | Tam. |
|---|---|---|
| FOR-1 | Ficha com histórico de compras, preços pagos e contas em aberto | M |
| FOR-2 | Produtos por fornecedor na tela (a tabela já existe no banco) | M |
| FOR-3 | WhatsApp/e-mail rápido (COM-2); importar/exportar (DAD) | P |
| FOR-4 | E2E | P |

### ESTOQUE E COMPRAS

#### Estoque (6 → 9,0) — Frente D
| ID | Ação | Tam. |
|---|---|---|
| EST-1 | **Tela de movimentações**: entradas, saídas, ajustes, perdas; filtro por produto, tipo e período | M |
| EST-2 | Contagem/inventário guiado (comparar contado × sistema e ajustar de uma vez) | G |
| EST-3 | Perdas e quebras com motivo | P |
| EST-4 | **Sugestão de reposição** (abaixo do mínimo) que cria o pedido de compra | M |
| EST-5 | Lista completa de alertas com paginação (hoje só 20) e filtro por categoria | P |
| EST-6 | Exportar; E2E | M |

#### Compras (7,5 → 9,0) — Frente D
| ID | Ação | Tam. |
|---|---|---|
| COP-1 | Criar pedido a partir da sugestão (EST-4) | P |
| COP-2 | Conta a pagar parcelada ao receber | M |
| COP-3 | Histórico de preço pago por produto e fornecedor | M |
| COP-4 | Anexar nota/arquivo ao pedido | M |
| COP-5 | E2E: pedir → receber → estoque entra → conta a pagar nasce | M |
| COP-6 | Rodada real de compra e recebimento | P |

### DINHEIRO

#### Financeiro (7 → 9,0) — Frente D
| ID | Ação | Tam. |
|---|---|---|
| FIN-1 | **Fluxo de caixa** realizado e previsto (30/60/90 dias) | G |
| FIN-2 | **DRE simples** mensal (receita, custo, despesas, resultado) | M |
| FIN-3 | Contas recorrentes (aluguel, luz, internet) geradas todo mês | M |
| FIN-4 | Contas a receber com vencimento e cobrança por WhatsApp (COM-2) | M |
| FIN-5 | Conciliação simples caixa × financeiro | M |
| FIN-6 | Exportar para o contador (CSV/PDF) | M |
| FIN-7 | Permissão do funcionário conforme matriz (PER) | P |
| FIN-8 | E2E; rodada real de pagar e receber | M |

#### Relatórios (6 → 9,0) — Frente D
| ID | Ação | Tam. |
|---|---|---|
| REL-1 | Período livre e **comparação** com o período anterior | M |
| REL-2 | **Lucro** por venda, produto e serviço (o custo já é gravado) | M |
| REL-3 | Por funcionário/profissional: vendas, atendimentos, comissão | M |
| REL-4 | Clientes: melhores, inativos, ticket médio | M |
| REL-5 | PDF/imprimir e CSV em cada relatório (DOC-4) | M |
| REL-6 | Resumo diário ou semanal por e-mail (COM-1) | M |

### RELACIONAR

#### Fidelidade (7 → 9,0) — Frente E
| ID | Ação | Tam. |
|---|---|---|
| FID-1 | Modelos prontos por tipo de negócio (1 clique configura níveis e campanhas) | M |
| FID-2 | Consulta de saldo pelo cliente (link/QR simples) | M |
| FID-3 | Pontos prestes a vencer + aviso por WhatsApp (COM-2) | M |
| FID-4 | Relatório do programa: pontos emitidos, resgatados, custo | M |
| FID-5 | **Testes de cálculo** (níveis, multiplicadores, ordem de uso dos pontos, limite de resgate): hoje só 2 arquivos | M |
| FID-6 | E2E: ganhar pontos na venda e resgatar | M |

### MINHA EMPRESA

#### Equipe (6,5 → 9,0) — Frente E
| ID | Ação | Tam. |
|---|---|---|
| EQU-1 | **Convite por e-mail/link** (hoje só adiciona quem já tem conta) | G |
| EQU-2 | Tela da matriz de permissões (PER-1) | M |
| EQU-3 | Comissão por profissional (% sobre serviço/venda) | M |
| EQU-4 | Desempenho por pessoa (liga em REL-3) | M |
| EQU-5 | Histórico de ações da empresa visível ao dono (a auditoria já existe) | M |
| EQU-6 | E2E: convidar, aceitar, trocar papel, remover | M |

#### Assinatura (8 → 9,0) — Frente F
| ID | Ação | Tam. |
|---|---|---|
| ASS-1 | Aviso de vencimento (7, 3 e 0 dias) por e-mail (COM-1) | M |
| ASS-2 | Recibo da assinatura por e-mail e na tela | P |
| ASS-3 | Renovar com um toque (Pix já gerado, QR e copia-e-cola) | P |
| ASS-4 | Troca de plano clara (subir/descer) e histórico | M |
| ASS-5 | **Pagamento real de teste em produção** com sua autorização (valor mínimo) | P |

#### Configurações e Conta (7,5 → 9,0) — Frente F
| ID | Ação | Tam. |
|---|---|---|
| CFG-1 | Mesclar PR #66 e ligar a chave da 2FA | P |
| CFG-2 | Teste logado de tudo: foto, e-mail, senha, aparelhos, tema, 2FA, editar empresa | M |
| CFG-3 | Dados da empresa para o recibo: logo, endereço, telefone, CNPJ opcional | M |
| CFG-4 | Formas de pagamento aceitas e horário de funcionamento | P |
| CFG-5 | Tema claro revisado em todos os módulos | M |

#### Dashboard (7 → 9,0) — Frente F
| ID | Ação | Tam. |
|---|---|---|
| DAS-1 | Comparação com ontem/semana/mês anterior | M |
| DAS-2 | **Meta de faturamento** do mês com barra de progresso | M |
| DAS-3 | Atalhos por tipo de negócio e por papel | P |
| DAS-4 | Funcionário vê só o que a matriz libera | P |
| DAS-5 | Conferir com dado real depois da rodada | P |

---

## 6. Plataforma (Admin, banco, jurídico, site) — Frentes A, F, G

| ID | Ação | Tam. | Módulo (hoje → alvo) |
|---|---|---|---|
| ADM-1 | Painel de saúde: erros recentes, webhooks com falha, assinaturas vencendo | M | Admin (8,5 → 9,0) |
| ADM-2 | Central de pedidos de reembolso e de direitos do titular (hoje é por e-mail manual) | G | Admin / Jurídico |
| ADM-3 | Comunicado para todas as empresas (aviso na tela) | M | Admin |
| ADM-4 | Rotina de expurgo de cobranças retidas (5 anos) | P | Banco |
| ADM-5 | E2E do admin | M | Admin |
| BAN-1 | Remover 2 índices duplicados e ajustar 1 política (avisos do Supabase) | P | Banco (9 → 9,5) |
| BAN-2 | Decidir o **gate comercial** em produção (hoje só no TEST) | P | Banco/Cobrança |
| JUR-1 | Dados da empresa nos textos legais → versão rc.4 e novo aceite | M | Jurídico (6 → 9,0) |
| JUR-2 | Revisão por advogado | — | Jurídico |
| JUR-3 | E-mail de suporte oficial nos textos e no site | P | Jurídico |
| SIT-1 | Site mostra **todos** os módulos nos mesmos grupos do menu | M | Site (8 → 9,0) |
| SIT-2 | Prints reais do sistema com dados de demonstração | M | Site |
| SIT-3 | Uma página por tipo de negócio (padaria, lava-rápido, mercadinho, salão, oficina, restaurante) | G | Site |
| SIT-4 | Perguntas frequentes e "como começar" | P | Site |
| DOC-5 | Atualizar `README.md` e `docs/architecture.md` (estão desatualizados) | P | Documentação (6 → 9,0) |
| DOC-6 | Manual de operação: incidente, backup, deploy, rollback | M | Documentação |
| MEN-1 | Menu agrupado por ação + regras por papel e segmento (seção 2) | M | Frente G |

---

## 7. Fora do escopo do 9,0 (decisão sua)

- **Nota fiscal (NF-e/NFC-e):** hoje o site diz que o Prime Ges **não emite nota**. Entrar exige integração com um serviço fiscal (custo mensal, certificado digital do cliente, regras por estado). Recomendo tratar como produto à parte, depois do 9,0. Pode ser decisão sua de que é essencial para o seu público.
- **WhatsApp automático pela API oficial** (COM-4): tem custo por mensagem; o link `wa.me` entrega 80% do valor sem custo.
- **Agendamento público** (AGE-6) e **variações de produto** (PRO-6): diferenciais; entram no 9,0 só se você quiser.

## 8. Decisões que preciso de você

1. Domínio e e-mail de envio (Resend) e e-mail de suporte oficial.
2. Conta do Sentry (gratuita basta no começo) e do monitor de site.
3. Nota fiscal: fica fora do 9,0?
4. Gate comercial no banco de produção: instalar agora ou depois?
5. Matriz de permissões (PER-1): eu proponho, você aprova.
6. Autorização por migration para aplicar no banco de produção, como sempre.
7. Quem faz a **rodada de uso real**: você logado no painel, com uma empresa de teste dedicada (a "teste1" serve).

## 9. Ordem sugerida dentro da fase única

Tudo corre em paralelo, mas há dependências:
1. **Primeiro (base):** FUN-1 a FUN-4, PER-1, CFG-1, COM-1 e COM-3.
2. **Em seguida (módulos):** cada frente entrega suas ações por PR pequeno; CAI-1, VEN-2, EST-1 e AGE-1 são as que mais mudam a vida do cliente.
3. **Rodada real (R5):** módulo por módulo, assim que o PR dele está no ar; falhas viram correção imediata.
4. **Por último:** vitrine (MEN-1, SIT-*), documentação e **reauditoria** com a régua R1–R7.

## 10. Como vamos medir o andamento
- Placar por módulo com os 7 critérios (R1–R7) em verde/amarelo/vermelho, atualizado a cada PR.
- Reauditoria final com evidências (links de PR, relatório da rodada, medições). O módulo que ficar abaixo de 9,0 entra com a lista exata do que falta.
