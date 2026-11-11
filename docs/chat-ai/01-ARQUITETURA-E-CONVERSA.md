# 01 — Arquitetura, conversa e dados

## 1. Visão geral
```
Navegador (/app/chat)
  texto (ou áudio→texto) ──► POST /api/chat/turn
                                │ 1. autentica (Clerk), resolve empresa e papel, confere plano/flag/cota
                                │ 2. Cláudia (orquestradora)
                                │      a. entende: módulo + intenção + campos soltos (LLM 1 chamada, ou regras)
                                │      b. entrega ao SUBAGENTE do módulo
                                │ 3. Subagente: resolve cadastros → valida → decide a próxima pergunta
                                │ 4. salva rascunho (versão+1) e devolve UMA mensagem estruturada (cartão)
  ◄── cartão: pergunta | desambiguação | confirmação | resultado | erro ──┘
  [Confirmar] ──► POST /api/chat/confirm { draftId, version, idempotencyKey }
                                │ 5. recarrega o rascunho do banco, confere dono/empresa/validade/versão
                                │ 6. revalida TUDO de novo (o mundo pode ter mudado desde o resumo)
                                │ 7. executor chama a função do banco (sessão do usuário) → audit_logs
  ◄── cartão de resultado (link para o registro criado) ──┘
```
Dois endpoints apenas. Nenhum caminho de gravação novo: o executor usa as funções já existentes (ver arquivo 02).

## 2. A Cláudia (orquestradora)
Responsabilidades:
- Conversa em português do Brasil, tom cordial e objetivo, frases curtas, sem jargão técnico.
- **Roteia**: descobre o módulo e a intenção. Se a confiança for baixa ou houver duas leituras possíveis ("acabou o produto": estoque ou venda?), **pergunta** com botões.
- **Guarda o estado**: um rascunho ativo por vez por sessão. Assunto novo com rascunho aberto: pergunta "Descarto o agendamento em andamento?".
- **Padroniza a experiência**: formato dos cartões, perguntas, confirmação, erros. Subagente só fornece dados.
- **Aplica as regras comuns**: permissão, plano, cota, teto de valor, expiração, idempotência, auditoria.
- **Nunca inventa**: se não achou o cliente, diz que não achou e oferece cadastrar (R1, com confirmação própria).

Nome da agente: configurável por empresa (padrão "Cláudia"). Também configuráveis: módulos ligados, teto de valor.

### 2.1 Entendimento da frase (duas camadas)
1. **Extratores determinísticos (sempre):** datas e horas (chrono, fuso America/Sao_Paulo), valores e números (Recognizers-Text + `parseMoneyInput`), formas de pagamento, quantidades com unidade, palavras de comando ("cancela", "corrige", "confirma", "não").
2. **Modelo de linguagem (se D1 aprovada), uma chamada por mensagem:** recebe a frase, as últimas mensagens, a data de hoje, a lista de intenções **permitidas para este papel** (nome + nomes de campos, sem IDs e sem dados da empresa). Devolve um JSON fixo:
```json
{ "module": "agenda", "intent": "agendar", "confidence": 0.0-1.0,
  "slots": { "cliente": {"text":"João Ferreira"}, "servico": {"text":"lavagem detalhada"} },
  "unclear": ["data", "profissional"], "followup_question": null }
```
Regras de segurança desse JSON:
- Validado com **zod** (chaves desconhecidas rejeitadas; tamanho máximo).
- Todo `text` de um campo precisa **existir (aproximadamente) na frase do usuário**; senão é descartado (barra "alucinação").
- O modelo **não decide valores monetários, datas finais nem IDs**: isso vem dos extratores e do banco.
- Se o provedor cair ou demorar mais que o limite (ex.: 8 s): **cai para as regras** e para perguntas guiadas; a conversa continua.
- Sem ferramentas, sem acesso a rede, sem memória entre empresas.

### 2.2 Regras de entendimento que já sabemos que dão problema
| Caso | Regra |
|------|-------|
| "limpa-baú de **50 litros**" | O "50" é parte do nome, não quantidade. Quantidade só com pista ("2 unidades", "x2", "duas caixas", "quantidade 5") ou resposta à pergunta "quantos?". Na dúvida, pergunta |
| "amanhã de tarde" | Faixa, não hora: pergunta "A que horas?" (sugere horários livres) |
| "dia 15" sem mês | Próxima ocorrência futura; mostra a data por extenso no cartão |
| "sexta" | Próxima sexta (se hoje é sexta e já passou das 18h, pergunta qual) |
| "meio-dia", "duas da tarde", "14h30", "às 2" | Extratores cobrem; "às 2" sem período pergunta manhã/tarde |
| Valor "R$ 1.234,56", "1234,56", "mil e duzentos" | Aceitos; sempre repetidos no cartão |
| Nome repetido ("João") | Lista candidatos com telefone e última visita; nunca escolhe sozinha |
| "o mesmo de ontem" | Não suportado na v1: responde que não sabe e pede os dados |
| Dois pedidos numa frase | Trata **um por vez**: confirma o primeiro e pergunta se segue com o segundo |
| Frase fora do escopo | Diz o que sabe fazer e mostra botões de exemplos |
| Palavras de cancelamento ("deixa pra lá", "cancela isso") | Descarta o rascunho com confirmação leve |

## 3. Contrato do subagente
Todo módulo implementa a mesma interface (TypeScript, um arquivo de registro por módulo):
```ts
interface Subagent {
  id: "agenda" | "estoque" | "clientes" | "vendas" | "financeiro" | "caixa" | "compras" | "rh" | ...
  intents: IntentSpec[]            // lista com ficha, risco, permissão, plano
}
interface IntentSpec {
  id: string; risk: "R0"|"R1"|"R2"|"R3"; permission: Permission | null;
  fields: FieldSpec[];             // ficha: tipo, nível, pergunta, resolver, validação
  validate(draft, ctx): Problem[]  // regras do módulo (expediente, estoque, caixa aberto…)
  summarize(draft, ctx): Card      // dados do cartão de confirmação
  execute(draft, ctx): Result      // só após Confirmar; chama a função do banco
  examples: ExampleDialog[]        // vira teste automático
}
interface FieldSpec {
  key: string; label: string; level: "required"|"recommended"|"default";
  kind: "text"|"money"|"qty"|"date"|"time"|"datetime"|"enum"|"entity"|"bool";
  entity?: "cliente"|"servico"|"produto"|"profissional"|"fornecedor"|"funcionario";
  default?(ctx): any; ask: string; askOptions?(ctx): Option[];   // pergunta e botões
  parse?(text, ctx): Parsed;       // extração específica
  check?(value, ctx): Problem|null // validação do campo
}
```
Contrato de comportamento (testado igual para **todos** os subagentes, ver arquivo 04):
1. Rascunho incompleto nunca executa.
2. `execute` só roda a partir de `/api/chat/confirm` com versão igual à do rascunho.
3. Sem permissão: não responde detalhes, diz que não está disponível para o perfil.
4. Executar duas vezes com a mesma chave grava uma vez.
5. Dado de outra empresa/usuário: não resolve, não enxerga, não executa.
6. Erro do banco vira mensagem em português da tabela de erros (seção 8), nunca texto técnico.

## 4. Máquina de estados do rascunho
```
 NOVO ─► COLETANDO ─► VALIDANDO ─► AGUARDANDO_CONFIRMACAO ─► EXECUTANDO ─► CONCLUIDO
            │  ▲           │                │   │                  │
            │  └───────────┘ (falta/erro)   │   └─ CORRIGINDO ─────┘(volta a COLETANDO, versão+1)
            ├──► DESCARTADO (usuário)       ├──► EXPIRADO (30 min sem resposta)
            └──► FALHOU (erro na gravação, mostra o motivo e permite tentar de novo)
```
Regras:
- **Versão** aumenta a cada alteração do rascunho (correção, nova resposta). O Confirmar só vale para a versão exibida; cartão antigo na tela fica inativo com aviso "este resumo foi atualizado".
- **Expira em 30 min** (configurável); depois, o clique em Confirmar mostra "Esse pedido expirou. Quer que eu refaça?" e recria o rascunho com os mesmos dados.
- **Idempotência:** chave única por (rascunho, versão). Duplo clique, reenvio de rede e retry do navegador gravam uma vez; a segunda chamada devolve o resultado da primeira.
- **Revalidação na confirmação:** estoque, horário livre, caixa aberto, saldo e permissão são checados de novo no instante de gravar. Se mudou, volta a AGUARDANDO_CONFIRMACAO com aviso do que mudou (não grava com dado velho).
- **Falha na gravação:** estado FALHOU, nada parcial: a função do banco é tudo-ou-nada (para vendas ver 02/2.5).
- **Cancelar a qualquer momento:** botão e palavra. Descartado não aparece mais para confirmar.

## 5. Conversa: protocolo de mensagens
Cada resposta da Cláudia é **uma** mensagem estruturada (nunca texto solto com ação escondida):
| Tipo | Quando | Conteúdo | Ações do usuário |
|------|--------|----------|------------------|
| `ask` | falta campo obrigatório | pergunta curta + opções clicáveis quando existirem (profissionais, horários livres, formas de pagamento) | responder por texto/voz ou clicar numa opção |
| `offer` | campo recomendado | "Quer informar X? Posso usar Y" | Informar / Pular |
| `disambiguate` | mais de um cadastro | lista de candidatos com dados que distinguem | escolher / "nenhum, cadastrar novo" |
| `confirm` | rascunho completo e válido | cartão (arquivo 03/§3.4), avisos, versão | Confirmar / Corrigir / Cancelar |
| `result` | gravado | o que foi criado + link | Abrir registro / Fazer outro |
| `info` | consulta R0 | cartão de leitura (KPIs, tabela curta, mini gráfico) | Abrir módulo completo |
| `error` | validação ou gravação falhou | motivo em português + o que fazer | tentar de novo / corrigir |
| `notice` | aviso do sistema (cota, módulo desligado, sem permissão) | texto curto | — |

Regras de pergunta:
- **Uma pergunta por vez**, com o mínimo de campos obrigatórios juntos quando forem naturais (data+hora).
- Máximo de **5 perguntas** por rascunho; passou disso, oferece abrir o formulário da tela já preenchido ("Abrir na Agenda com o que já tenho").
- Responde ao que a pessoa **disse**, não ao que esperava ("amanhã às 14h" cobre data e hora).
- Correção em linguagem natural ("troca pro Rafael", "na verdade é quinta") altera só o campo citado e **reapresenta o cartão** (versão+1).
- Toda mensagem tem versão em texto simples para leitores de tela.

## 6. Modelo de dados (migrations novas, cada uma com reversão e bateria no TEST)
| Tabela | Colunas principais | Observações |
|--------|--------------------|-------------|
| `chat_settings` | `company_id` PK, `enabled`, `agent_name`, `modules text[]`, `value_ceiling`, `retention_days` | Uma linha por empresa; só dono/gestor altera |
| `chat_sessions` | `id`, `company_id`, `user_id`, `created_at`, `last_active_at`, `title` | Uma conversa |
| `chat_messages` | `id`, `session_id`, `company_id`, `role` (user/agent), `kind`, `text`, `transcript text` (texto do áudio, quando a mensagem veio por voz), `input_mode` (texto/voz), `payload jsonb` (cartão), `draft_id`, `created_at` | O **texto da transcrição fica** (até a retenção das mensagens); o áudio não fica aqui |
| `chat_audio` | `id`, `company_id`, `user_id`, `session_id`, `draft_id`, `message_id`, `storage_path`, `mime`, `size_bytes`, `duration_s`, `created_at`, `expires_at`, `deleted_at`, `delete_reason` | **Áudio temporário** (decisão do dono, 11/11): vive só até a ordem terminar; ver seção 6.1 |
| `chat_drafts` | `id`, `company_id`, `user_id`, `session_id`, `module`, `intent`, `risk`, `slots jsonb` (valores já resolvidos, com IDs), `raw jsonb` (o que foi dito), `missing text[]`, `warnings jsonb`, `version int`, `status`, `expires_at`, `executed_at`, `result jsonb`, `idempotency_key text unique`, `created_at` | IDs só aqui, nunca vão ao modelo |
| `chat_feedback` | `draft_id`, `field`, `old_value`, `new_value`, `kind` (correção, descarte, falha) | Alimenta a medição de acerto |
| `chat_usage` | `company_id`, `day`, `messages`, `llm_calls`, `llm_tokens` | Cota e custo |
| `aliases text[]` | nas tabelas `customers`, `services`, `products`, perfil profissional, `suppliers`, `hr_employees` | Índice GIN; nome tokenizado entra sozinho |
Segurança de dados:
- **RLS** em todas: `company_id` do usuário **e**, em `chat_drafts`/`chat_sessions`, `user_id = usuário atual` (nem o dono vê o rascunho de outro funcionário pelo chat).
- Funções de apoio `SECURITY DEFINER` com `EXECUTE` revogado de `anon`/`authenticated` quando só o servidor usa (mesmo padrão das migrations recentes).
- Retenção: mensagens apagadas após `retention_days` (padrão 90) por rotina agendada; rascunhos executados mantêm só o resumo.
- **Áudio:** guardado temporariamente e apagado quando a ordem termina (seção 6.1). **O texto transcrito permanece** junto da atividade.

### 6.1 Ciclo de vida do áudio (decisão do dono, 11/11/2026)
**Regra:** o áudio fica guardado **temporariamente, até a ordem de atividade ser concluída**. Depois disso o arquivo é **apagado** e fica **apenas o texto** da transcrição (e o resumo da atividade).
| Momento | O que acontece com o áudio |
|---------|----------------------------|
| Usuário solta o botão de gravar | O arquivo é enviado para um **bucket privado** (`chat-audio`) no caminho `{empresa}/{usuário}/{rascunho}/{n}.webm`; cria linha em `chat_audio` com `expires_at` = agora + 24 h (teto de segurança) |
| Transcrição | O texto vai para `chat_messages.transcript` e aparece editável na caixa; o áudio continua guardado |
| Conversa em andamento (perguntas, correções) | Cada fala nova vira outro arquivo ligado ao **mesmo rascunho**; o usuário pode **ouvir de novo** a própria fala na tela |
| Ordem **concluída** (gravou com sucesso) | Todos os áudios do rascunho são apagados na hora (arquivo + `deleted_at`, `delete_reason = concluida`) |
| Ordem **descartada/cancelada**, **expirada** (30 min) ou **falhou sem nova tentativa** | Apagados na hora (`delete_reason = descartada, expirada ou falhou`) |
| Usuário **exclui a conversa** | Apagados na hora (`excluida`) |
| Rascunho nunca chegou a um estado final (aba fechada, erro) | Rotina a cada hora apaga o que passou de `expires_at` (24 h) (`delete_reason = teto`) |
| Conta/empresa excluída | Apagados junto com os demais dados (reusa a rotina de exclusão de conta, que já remove arquivos do storage) |
"Ordem concluída" = rascunho em estado final: `CONCLUIDO`, `DESCARTADO`, `EXPIRADO` ou `FALHOU` (sem nova tentativa em 30 min). Enquanto o rascunho estiver em `COLETANDO`, `AGUARDANDO_CONFIRMACAO` ou `EXECUTANDO`, o áudio é mantido.
Regras de proteção:
- Bucket **privado**, tipos permitidos de áudio, tamanho máximo por arquivo (ex.: 2 MB) e duração máxima (60 s); sem URL pública. Escuta só por **link assinado de curta duração (60 s)**, gerado para o **próprio usuário dono do rascunho**.
- Políticas de `storage.objects` por caminho (empresa e usuário), **no mesmo padrão do bucket de documentos de clientes** que já existe (migration 011). Nem o dono da empresa ouve o áudio de outro funcionário pelo Chat.
- **O áudio nunca é enviado ao modelo de linguagem** (só o texto). Se a transcrição usar serviço externo (D2), exigir contrato/configuração **sem retenção e sem treino** do provedor e citar na Política de Privacidade.
- Apagar é **verificado**: a rotina confere que o arquivo sumiu do storage e alerta se sobrar áudio de rascunho em estado final há mais de 15 min.
- Nenhum áudio vai para logs, e-mails, painel admin ou ferramentas de análise.
- Cópias de segurança do storage: confirmar com a plataforma que o apagamento atinge também as cópias dentro do prazo declarado (pendência P2).
- Voz pode ser considerada dado pessoal sensível dependendo do uso; aqui **não é usada para identificar ninguém**. Registrar a finalidade ("conferir e corrigir a ordem") e o prazo na Política de Privacidade e validar o texto com o jurídico (pendência P3).

## 7. Resolução de cadastros (camada compartilhada)
Ordem de busca por tipo (`cliente`, `produto`, `servico`, `profissional`, `fornecedor`, `funcionario`), sempre filtrada pela empresa e por status ativo:
1. igualdade exata de alias/nome → 2. todos os termos presentes (sem acento, sem caixa) → 3. similaridade aproximada (`pg_trgm`) acima de um limiar.
- **Escolha automática** só se houver **um** candidato com pontuação alta **e** nenhum outro próximo. Mesmo assim o cartão mostra a pessoa/produto escolhido com link.
- Mais de um → `disambiguate` (máximo 5 + "ver mais").
- Nenhum → `notice` + oferta de cadastrar.
- Campo extra para distinguir: telefone final, última visita, placa (se existir), categoria, preço.
- Inativos aparecem só se não houver ativo, marcados como "inativo" e exigem escolha explícita.
- Verificar em Production/TEST se as extensões `pg_trgm` e `unaccent` estão ativas **antes** de qualquer migration (pendência P1).

## 8. Catálogo de erros → mensagem para o usuário
Mapa único (arquivo de textos), cobrindo os erros reais já existentes nas funções do banco:
| Origem | Texto do sistema | Mensagem da Cláudia |
|--------|------------------|---------------------|
| Agenda | "Horário fora da disponibilidade do profissional." | "O {prof} não atende nesse horário. Ele atende de {ini} a {fim} nesse dia. Quer outro horário?" |
| Agenda | "O profissional possui um bloqueio neste horário." | "O {prof} está com um bloqueio nesse horário ({motivo}). Posso sugerir {3 horários livres}?" |
| Agenda | "Profissional já possui agendamento neste horário." | "Esse horário já está ocupado para o {prof}. Livres: …" |
| Agenda | "Este profissional não está habilitado para o serviço selecionado." | "O {prof} não faz {servico}. Quem faz: {lista}." |
| Agenda | "O serviço precisa ter duração válida." | "O serviço {x} está sem duração cadastrada. Informe a duração para eu calcular o término." |
| Agenda | dia sem expediente (regra do app) | "O {prof} não atende em {dia}." |
| Estoque | saldo insuficiente | "Só há {n} em estoque." |
| Caixa | "Não há caixa aberto…" | "O caixa está fechado. Quer abrir? (informe o saldo inicial)" |
| Caixa | saída acima do saldo (regra do app) | "Há só {saldo} em dinheiro no caixa." |
| Geral | permissão negada | "Essa ação é do perfil gerente/dono." |
| Geral | plano/assinatura vencida | "A assinatura precisa estar ativa para essa ação." + link |
| Geral | valor acima do teto | "Acima de {teto}: preciso de uma segunda confirmação." |
| Geral | valor acima do limite do banco (numeric 12,2) | "Esse valor é alto demais para o cadastro." |
| Qualquer | erro inesperado | "Não consegui gravar agora. Nada foi alterado. Tente de novo; se repetir, avise o suporte (código {id})." |
Lição dos testes reais: **mensagem genérica "Não foi possível salvar" não pode existir** quando a causa é conhecida.

## 9. Segurança e privacidade
| Tema | Decisão |
|------|---------|
| Autenticação | Mesma sessão Clerk do app; rota `/api/chat/*` exige usuário e empresa; **nunca** service role |
| Isolamento | `company_id` e `user_id` vêm do servidor, nunca do corpo da requisição; RLS como segunda barreira |
| Injeção de comando | O modelo não executa nada; texto do usuário nunca vira SQL nem chamada de função livre; só `slots` validados por ficha |
| Injeção via dados | Nomes de clientes/produtos (podem conter instruções) **não** são enviados ao modelo; só o texto do usuário vai |
| XSS | Todo texto exibido é escapado; sem HTML vindo de dados; links só para rotas internas montadas por nós (IDs validados) |
| Abuso e custo | Limite de mensagens por usuário/minuto e por empresa/dia; tamanho máximo da mensagem (ex.: 1.000 caracteres); timeout do provedor; teto de gasto com alerta; interruptor global |
| Rate limit | **Não existe hoje no projeto**: criar (tabela `chat_usage` + verificação atômica, ou serviço dedicado — decidir) |
| LGPD | Base: execução do contrato. Texto vai a provedor externo (D1): citar na Política de Privacidade; não enviar documentos (CPF), telefones ou e-mails ao modelo — **mascarar no pré-processamento**. **Áudio:** armazenado só até a ordem terminar, depois apagado (seção 6.1); finalidade e prazo declarados na política |
| Auditoria | Cada gravação: `audit_logs` com origem `chat`, `draft_id`, módulo, intenção, quem confirmou |
| Logs | Sem conteúdo sensível em logs; guardar ids e códigos |
| Chaves | Em variáveis de ambiente da Vercel (nunca no código); rotação documentada |
| Falha segura | Sem confirmação ou com dúvida: não grava. Provedor fora: modo regras. Módulo desligado: mensagem clara |

## 10. Observabilidade
- **Eventos por turno** (sem texto): módulo/intenção detectados, confiança, campos faltantes, nº de perguntas, tempo total, uso do modelo (sim/não), custo.
- **Eventos por rascunho:** confirmado sem correção, corrigido, descartado, expirado, falhou (com código).
- **Painel interno (admin da plataforma):** acerto por intenção, % de correção, abandono, falhas por erro, custo por empresa, tempo de resposta p95.
- **Alertas:** acerto abaixo de limiar, taxa de falha de gravação > 2%, custo diário acima do teto, qualquer gravação sem rascunho confirmado (deve ser **zero**).
- **Modo sombra** (antes de liberar gravação): registra o que *entenderia* e compara com o que o usuário fez manualmente.
