# 03 — Interface, recursos visuais, voz e infraestrutura

Base visual existente (conferida no código): tema **escuro por padrão** com tema claro opcional (Configurações → Aparência), cor de marca azul (`--primary`), componentes em `src/components/ui` (shadcn/Radix): accordion, alert, alert-dialog, avatar, badge, breadcrumb, button, card, checkbox, collapsible, command, dialog, dropdown-menu, input, label, native-select, popover, progress, scroll-area, select, separator, sheet, sidebar, skeleton, sonner (toasts), switch, table, tabs, textarea, tooltip. Ícones `lucide-react`. Já existem o **menu de busca/comandos** (`command-menu`, atalho Ctrl K), regiões `aria-live` em formulários e o padrão de módulo `.prime-module-page`. **Não existe biblioteca de gráficos**: o Dashboard e Relatórios usam barras em CSS/tabela.
Regra: **reaproveitar o que existe**; nenhuma dependência nova é necessária para o MVP (lista de opcionais na seção 9).

## 1. Mapa de telas e rotas
| Tela | Rota | Quem vê | Fase |
|------|------|---------|------|
| Chat AI (conversa) | `/app/chat` | quem tem o módulo ligado e plano | 2 |
| Histórico de conversas (painel lateral/gaveta) | dentro de `/app/chat` | o próprio usuário | 2 |
| Configurações do Chat AI | `/app/configuracoes/chat-ai` | dono (gerente só leitura) | 2 |
| Atalho "Falar com a {agente}" no menu de comandos | global (Ctrl K) | todos | 2 |
| Botão flutuante (mobile) | global na área logada | todos | 6 |
| Painel de uso e qualidade | `/admin/chat-ai` (plataforma) | admin da plataforma | 3 |
Itens de navegação: entrada "Chat AI" no menu lateral (ícone `MessagesSquare` ou `Sparkles`, **a confirmar com o dono**), nome na trilha de navegação em `route-labels` ("Chat AI"), permissão do módulo na matriz.

## 2. Tela principal (`/app/chat`)
### 2.1 Layout
**Desktop (≥ 1024 px)**
```
┌────────────────────────────────────────────────────────────────────┬───────────────┐
│ Cabeçalho: avatar Cláudia · nome · status (Online/Pensando) · [Nova]│ Painel direito│
├────────────────────────────────────────────────────────────────────┤ (opcional)    │
│ Lista de mensagens (rolável)                                        │ • Prévia do   │
│   bolhas do usuário (direita) · cartões da Cláudia (esquerda)       │   registro    │
│                                                                    │ • Histórico   │
├────────────────────────────────────────────────────────────────────┤   de conversas│
│ Sugestões rápidas (chips)                                           │               │
│ Caixa de texto [ mic ] [ enviar ]  contador de caracteres           │               │
└────────────────────────────────────────────────────────────────────┴───────────────┘
```
**Celular (< 640 px):** tela cheia; cabeçalho compacto; histórico vira gaveta (`Sheet`); painel direito some (a prévia abre em `Sheet`); caixa de texto fixa no rodapé respeitando teclado virtual e área segura do aparelho; **cuidado já conhecido:** elementos `position: fixed` dentro de `.prime-module-page` dependem da correção do PR #89 (animação sem `transform` residual) — incluir teste visual.
**Tablet:** como desktop sem painel direito.

### 2.2 Estados da tela
| Estado | O que aparece |
|--------|---------------|
| Vazio (primeira vez) | Saudação da agente, 1 linha do que sabe fazer, **6 chips de exemplo por perfil** ("Agendar um serviço", "Cadastrar produto", "Lançar despesa", "O que tenho amanhã?"…) |
| Carregando histórico | `Skeleton` de 3 bolhas |
| Digitando/Pensando | indicador de 3 pontos + "Cláudia está conferindo…" (`aria-live=polite`); botão enviar vira "parar" |
| Aguardando resposta | foco na caixa de texto; chips de resposta rápida quando houver opções |
| Aguardando confirmação | cartão `confirm` em destaque; composer continua ativo para correção por texto |
| Executando | botões desabilitados, "Gravando…"; nunca permite segundo clique |
| Sucesso | cartão `result` + toast discreto (`sonner`) |
| Erro | cartão `error` com ação ("Tentar de novo", "Abrir na tela") |
| Offline | faixa "Sem conexão: não consigo enviar agora"; mensagens ficam em fila só para texto, **nunca confirmações** |
| Cota/plan | faixa com mensagens restantes; ao esgotar, explica e linka para planos |
| Módulo desligado / sem permissão | cartão `notice` com a razão |
| Sessão expirada | pede login e preserva o texto digitado |
| Provedor de IA fora do ar | faixa "Modo simples: vou guiar por perguntas" (continua funcionando) |

### 2.3 Composer (caixa de entrada)
- Textarea que cresce até 6 linhas; **Enter envia, Shift+Enter quebra linha**; limite visível (ex.: 1.000 caracteres); botão enviar desabilitado se vazio.
- Botão de microfone (fase 5): estados ociosa / pedindo permissão / ouvindo (indicador de nível) / transcrevendo / erro / sem permissão. **A transcrição aparece editável na caixa antes de enviar** (nunca envia o que ouviu sozinha).
- Chips de resposta rápida acima da caixa (opções da pergunta atual).
- `Esc` cancela o rascunho em andamento (com confirmação leve).
- Colar texto longo: corta no limite e avisa.

## 3. Biblioteca de cartões (um componente por tipo de mensagem)
Todos: ocupam a largura da coluna, têm título acessível, ícone do módulo, versão do rascunho (texto pequeno), e são **somente leitura depois de resolvidos** (ficam como histórico).

### 3.1 Bolha de texto (usuário e agente)
Nome/avatar, hora, estado de entrega (enviando/enviado/falhou com "reenviar"). Sem HTML vindo de dados; links só internos montados por nós.

### 3.2 `ask` — pergunta
Texto da pergunta + **botões de opção** quando existirem (profissionais, horários livres como grade de horas, formas de pagamento, categorias) + campo livre. Opção "Pular" quando o campo é recomendado.

### 3.3 `disambiguate` — escolha de cadastro
Lista de até 5 itens: avatar/iniciais, nome, **dado que distingue** (telefone final, última visita, categoria, preço), botão "Escolher"; rodapé "Nenhum desses — cadastrar novo". Navegação por setas; seleção também por número ("1", "2").

### 3.4 `confirm` — cartão de confirmação (o mais importante)
```
┌─────────────────────────────────────────────────────┐
│ [ícone] Agenda › Novo agendamento      [R1 • Criar] │  ← módulo + nível de risco (cor)
│ ─────────────────────────────────────────────────── │
│ Cliente        João Ferreira ↗                      │  ← ↗ abre o perfil (nova aba/gaveta)
│ Serviço        Lavagem detalhada                    │
│ Profissional   Lúcio ↗                              │
│ Quando         qui, 12/11 · 14:00 às 16:30 (2h30)   │
│ Valor          R$ 120,00  (preço do serviço)        │
│ ⚠ Aviso: Lúcio tem folga marcada às 12h (sem conflito)│
│ ─────────────────────────────────────────────────── │
│ [ Confirmar ]   [ Corrigir ]   [ Cancelar ]   v3     │
└─────────────────────────────────────────────────────┘
```
Regras de interface:
- **Cor do nível:** R1 azul (criar), R2 âmbar (alterar/movimentar), R3 vermelho (difícil de desfazer). Nunca só cor: texto do nível sempre presente.
- **Antes → depois** em alterações (R2): duas colunas ou setas, com o campo alterado destacado.
- **Valores em destaque** (moeda formatada em pt-BR); datas por extenso + dia da semana.
- **Linhas com origem do padrão** ("preço do serviço", "calculado") para o usuário saber o que veio de regra.
- **Avisos** (âmbar) e **bloqueios** (vermelho, botão Confirmar desabilitado com a razão ao lado).
- **Confirmar:** foco inicial no cartão (não no botão), clique único, estado "Gravando…", depois troca para `result`.
- **Corrigir:** abre campo de texto "O que você quer mudar?" ou edição por campo clicando na linha.
- **R3:** campo "digite CONFIRMAR" + botão; texto explicando o que não dá para desfazer.
- Versão visível ("v3"); cartão desatualizado ganha faixa "Este resumo foi atualizado" e botões desabilitados.
- Teto de valor (D8): faixa "Valor acima de R$ 1.000: confirme duas vezes" com segundo passo.

### 3.5 `result` — resultado
Ícone de sucesso, "Pronto: agendamento criado", resumo de 1 linha, botão **Abrir registro**, botão "Fazer outro", e, se houver, a **oferta de próximo passo** (ex.: após baixa de estoque, "Registrar compra para repor?").

### 3.6 `info` — consulta (R0) com recursos gráficos
| Consulta | Visual |
|----------|--------|
| Agenda do dia | **Linha do tempo vertical** por profissional (blocos coloridos pela cor do profissional, como a Agenda) |
| Horários livres | Grade de botões de horário |
| Vendas hoje/mês | 2–3 **KPIs** (faturamento, nº de vendas, ticket médio) + mini **barras por dia** (SVG simples, mesmo estilo do Dashboard) |
| Saldo do caixa | KPIs (esperado em espécie, entradas por forma) + barras horizontais por forma de pagamento |
| Estoque baixo | Lista com **barra de progresso** saldo/mínimo (`Progress`) e selo "baixo/zerado" |
| A pagar / a receber | Tabela curta com **selo de vencimento** (em dia, vence hoje, atrasado) |
| Resultado do mês | KPIs + mini barras receita × despesa |
Regra: gráficos são **componentes SVG/CSS próprios e pequenos** (sem biblioteca), com **tabela equivalente oculta** para leitor de tela e valores sempre escritos. Botão "Abrir {módulo}" em todos. Máximo de 5 linhas por consulta no chat.

### 3.7 `error` e `notice`
Mensagem em português do catálogo (arquivo 01/§8), ícone, **sempre** com a próxima ação. Códigos curtos de suporte só em erro inesperado.

## 4. Voz (fase 5)
| Item | Especificação |
|------|---------------|
| Entrada | Botão de microfone no composer; atalho (tecla pressionada para falar no desktop) opcional |
| Motor | v1: reconhecimento do navegador (pt-BR); v2: modelo no navegador ou API hospedada (decisão D2) |
| **Captura do áudio para guardar** | A voz do navegador (Web Speech API) **devolve só texto, não entrega o arquivo de áudio**. Para guardar o áudio temporariamente é preciso **gravar em paralelo** (`MediaRecorder`) ou usar um motor em que o áudio já passa por nós (modelo no navegador ou API hospedada). Gravar em paralelo com o reconhecimento do navegador **pode conflitar no microfone em alguns aparelhos: provar na prova de conceito**. Ver decisão D12 |
| Permissão | Fluxo de pedido com explicação ("Para ouvir você, preciso do microfone"); estado "negado" com instrução de como liberar |
| Indicadores | Nível de áudio em tempo real, tempo gravado, botão parar; limite de duração (ex.: 60 s) |
| Transcrição | Mostrada **editável** antes de enviar; destaque visual de números e nomes (os mais propensos a erro) |
| Detecção de silêncio | Para sozinha após pausa (opcional; biblioteca de detecção de voz é uma das opções do levantamento) |
| Privacidade e guarda | O áudio é **guardado temporariamente até a ordem terminar** e depois apagado; **fica só o texto** (arquivo 01/§6.1). Aviso na primeira vez e permanente junto do microfone: "Guardo seu áudio só até concluir este pedido; depois fica só o texto." |
| Ouvir de novo | Botão de reproduzir em cada fala enquanto a ordem está aberta (link assinado de 60 s); some quando o áudio é apagado, ficando só a transcrição |
| Estado do áudio na bolha | Selo discreto: "áudio disponível" e depois "áudio apagado (só texto)" quando a ordem termina |
| Falhas | Sem suporte no navegador → esconde o botão e explica; erro de rede → "tente digitar"; ruído → pede para repetir |
| Teste | Matriz de aparelhos reais (Android Chrome, iPhone Safari, desktop Chrome/Edge) |
| Resposta falada | **Fora da v1** (ouvir a Cláudia); só texto |

## 5. Histórico e privacidade na tela
- Gaveta com conversas por data, título automático, busca simples. Mensagens de voz aparecem só como **texto transcrito** (com o ícone de microfone); o áudio nunca aparece no histórico depois da conclusão.
- **Excluir conversa** (apaga mensagens; o registro de auditoria da gravação permanece).
- Aviso permanente discreto: "Eu só gravo depois do seu Confirmar."
- Link "Como seus dados são tratados" (Política de Privacidade, atualizada se houver provedor externo).

## 6. Configurações do Chat AI (`/app/configuracoes/chat-ai`)
Campos: ligar/desligar; **nome da agente**; módulos habilitados (caixas por módulo, respeitando perfis); **teto de valor** para segunda confirmação; tempo de validade do rascunho; retenção de mensagens; ver uso do mês e cota; **prazo máximo de guarda do áudio** (padrão 24 h, só reduzível), com a explicação da regra de apagar ao concluir. Somente dono altera (gerente lê). Mudança grava em `audit_logs`.

## 7. Painel interno (admin da plataforma) — `/admin/chat-ai`
Tabelas e gráficos de: mensagens por dia, acerto por intenção, % de correção/descarte, falhas por código, custo por empresa, tempo p95, empresas com Chat ligado, últimas falhas (sem conteúdo sensível). Reaproveita a casca e componentes do painel admin atual.

## 8. Ativos visuais e conteúdo a produzir
| Ativo | Detalhe | Quem |
|-------|---------|------|
| **Avatar da Cláudia** | Ilustração/ícone em 3 tamanhos (24, 40, 96 px), em escuro e claro; estados: neutro, pensando, ouvindo | Design (decisão do dono: estilo — ilustração, monograma ou ícone) |
| Ícones por módulo | `lucide-react`: Agenda `CalendarClock`, Produtos/Estoque `Package`, Serviços `Wrench`, Clientes `Users`, Vendas `ShoppingCart`, Financeiro `Wallet`, Caixa `Landmark`/`Banknote`, Compras `Truck`, RH `UserCog`, nível de risco `PenLine`/`ArrowLeftRight`/`ShieldAlert` | Dev |
| Ilustração do estado vazio | Opcional; pode ser só avatar + texto | Design |
| Cores de risco | R1 azul da marca; R2 âmbar; R3 vermelho; sucesso verde; tokens nos dois temas com contraste ≥ 4,5:1 | Dev (tokens em `globals.css`) |
| Sons | Nenhum na v1 (opcional futuro, desligado por padrão) | — |
| Textos (microcopy) | Planilha única com: saudação, perguntas por campo, ofertas, erros, avisos, vazios; **revisada pelo dono** | Dono + Dev |
| Exemplos por perfil | Chips da tela vazia diferentes para dono, gerente e funcionário | Dono |
| Documentação para cliente | Página curta "O que a Cláudia faz" + vídeo curto (depois do piloto) | Marketing |

## 9. Dependências, serviços e infraestrutura
**Código novo, sem biblioteca nova (MVP):** `chrono` (datas, a provar), `recognizers-number`/`-number-with-unit` (valores, a provar), `zod` (já existe) para validar saída do modelo. Componentes de UI: os existentes.
**Opcionais conforme provas de conceito:** Transformers.js (voz no navegador), biblioteca de detecção de voz, assistant-ui (só se a tela crescer), Fuse.js (desambiguação). Cada uma entra por PR próprio com `npm audit`.
| Recurso | Decisão |
|---------|---------|
| Provedor do modelo de linguagem | A escolher (D1): um modelo pequeno e rápido basta para extração; chave em variável de ambiente; **timeout e limite de gasto** |
| Chaves/variáveis na Vercel | `CHAT_LLM_PROVIDER`, `CHAT_LLM_API_KEY`, `CHAT_LLM_MODEL`, `CHAT_STT_*` (se voz hospedada), `CHAT_GLOBAL_ENABLED` (interruptor) |
| Rotas | `POST /api/chat/turn`, `POST /api/chat/confirm`, `GET /api/chat/history`; todas com autenticação; resposta em partes (streaming) opcional |
| Limites da Vercel | Definir `maxDuration` das rotas e orçar a latência (alvo: resposta em < 3 s sem modelo, < 6 s com) |
| Rate limit / cota | Tabela `chat_usage` + verificação atômica (hoje não existe no projeto) ou serviço dedicado |
| Armazenamento de áudio | Bucket privado `chat-audio` no Supabase Storage (mesmo padrão do bucket de documentos), políticas por caminho, limite de tamanho e tipo, links assinados curtos |
| Agendador | Rotina horária que apaga áudio vencido e confere se o apagamento ocorreu; rotina diária de retenção de mensagens e de expiração de rascunhos |
| Observabilidade | `audit_logs` (existe) + eventos próprios + painel admin; alerta de custo/falha |
| Ambientes | Tudo primeiro no **TEST**; Production só com "Autorizo" por migration |
| Feature flags | Interruptor global + por empresa + por módulo (`chat_settings` e plano) |
| Documentação | Atualizar Política de Privacidade; manual curto para o dono |

## 10. Acessibilidade e idioma (critérios de aceite da interface)
- Teclado completo: Tab percorre cartões e botões; Enter/Espaço ativam; Esc cancela; setas nas listas de escolha.
- Leitores de tela: nova mensagem anunciada em região `aria-live=polite`; **cartão de confirmação anunciado com título e resumo**; botões com nome completo ("Confirmar agendamento de João Ferreira, quinta 14h"); estados do microfone anunciados.
- Foco: ao chegar cartão que exige ação, o foco vai para ele; depois de resolver, volta ao composer.
- Contraste ≥ 4,5:1 nos dois temas; não depender só de cor (nível de risco tem texto e ícone).
- Respeita "reduzir movimento" (sem animação do indicador de digitação).
- Alvos de toque ≥ 44 px no celular; sem rolagem horizontal; zoom até 200% sem perda.
- 100% em português do Brasil, datas e moeda no formato local, fuso America/Sao_Paulo.
- Auditoria automática de acessibilidade na rotina de testes (arquivo 04).

## 11. Performance e robustez da interface
- Lista de mensagens virtualizada ou limitada às últimas 100 (carregar mais).
- Envio otimista **só** para texto do usuário; cartões vêm sempre do servidor.
- Reenvio seguro (mesma chave de idempotência) em falha de rede.
- Sem rolagem automática se o usuário rolou para cima; botão "ir para a última mensagem".
- Cartões grandes (venda com muitos itens) recolhem a lista após 5 linhas.
- Medir: tempo até primeira resposta, quadros por segundo da rolagem, tamanho do pacote da página (não carregar código de voz até o primeiro toque no microfone).
