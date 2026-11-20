# Levantamento — manutenção programada, tela de manutenção e travas de proteção (20/11/2026)

Pedido: aviso de manutenção programada no Dashboard, função no painel admin para agendar e ativar a manutenção (com tela que bloqueia o ambiente do
cliente e mostra quanto tempo vai durar) e travas preventivas para que nenhuma atualização comprometa o site, o banco e os dados dos clientes.
Este documento é só **levantamento e proposta**: nada foi alterado no site nem no banco.

## 1. Resumo

| Tema | Hoje | Falta |
|---|---|---|
| Tela de manutenção | existe, mas é um **interruptor de ambiente** (`MAINTENANCE_MODE=1`): derruba o site inteiro com uma página fixa, sem horário de volta | controle pelo painel admin, mensagem editável, previsão de término, contagem regressiva, entrada do admin |
| Aviso programado | não existe | aviso no Dashboard (e topo do app) com contagem regressiva, agendado pelo admin |
| Painel admin | Configurações só guarda números inteiros (`platform_settings`) | tela **Manutenção** com agendar, editar, iniciar agora, estender, encerrar e histórico |
| Publicar atualização | manual (construir imagem, trocar, conferir) e sem trava automática | roteiro único de publicação com backup antes, ensaio da migration, teste de fumaça e volta automática |
| Banco e dados | boa base (RLS em 75/75 tabelas, backup diário com teste de restauração, cópia criptografada) | backup antes de cada publicação, recuperação a qualquer minuto (hoje até 24 h de perda), cópia fora do PC |

## 2. O que existe hoje (verificado no código e no servidor)

**Modo manutenção atual** (`src/lib/maintenance.ts`, `src/middleware.ts`):
- Liga com a variável `MAINTENANCE_MODE` no container do site: para ligar ou desligar é preciso **mudar a variável e refazer o container**. Não dá para fazer pelo painel.
- Responde `503` com texto fixo ("Estamos em manutenção… volte em alguns minutos"). Sem horário previsto, sem contagem, sem botão de atualizar.
- Bloqueia **tudo**, inclusive `/admin` e o login: nem o administrador entra para conferir o que está fazendo. Só `/api/health` passa.
- Bloqueia também o webhook do EvoPay (`/api/webhooks/evopay`): um pagamento confirmado durante a manutenção só é percebido depois.
- Quem está com o sistema aberto não vê aviso: a próxima ação dá erro de rede/503 sem explicação.

**Painel admin** (`/admin`): usuários, empresas, assinaturas, pagamentos, planos, auditoria, ferramentas, configurações. Acesso por `profiles.role` (`admin`/`super_admin`),
com tudo auditado e as ações sensíveis só para super admin. `platform_settings` aceita apenas **números inteiros** com faixa validada — não serve para texto, datas e estados.

**Dashboard**: não há faixa de avisos; o layout autenticado (`src/app/(app)/layout.tsx`) lê tudo no servidor a cada página e é o lugar natural do aviso.

**Publicação hoje**: GitHub com CI (lint, tipos, testes, build) em pull request; depois, manualmente: backup, migrations por `psql`, `docker build`, trocar a imagem, reiniciar o site, conferir `/api/health`.
- A `main` **não tem proteção de branch** (qualquer push entra, mesmo sem CI verde).
- O banco local **não registra quais migrations foram aplicadas** (não há `schema_migrations`); a lista só existe na pasta do repositório e na memória de quem aplicou.
- O vigia de saúde (`health.ps1`, a cada 5 minutos) **religa sozinho** containers parados: numa manutenção em que se para o banco de propósito, ele o ligaria de volta.
- Não há ensaio de migration em cópia do banco real nem teste automático depois da troca.

**Banco e dados**: RLS ligada nas 75 tabelas; backup diário às 03:00 com restauração de teste, cópia criptografada em `D:\PRIME GES BKP`; containers com `restart: unless-stopped`; auditoria de ações; migrations com script de volta em `supabase/rollback/`.
- `archive_mode = off`: **não há recuperação para um minuto específico**. Se o banco estragar às 17:00, o ponto de volta é o backup das 03:00 (perde-se um dia de vendas).
- A chave privada do backup e uma cópia **fora do PC** continuam pendentes (já registrado no LEIA-ME).

## 3. Proposta — manutenção programada

### 3.1 Três níveis (o admin escolhe por manutenção)
1. **Só aviso**: o cliente vê a faixa no Dashboard e continua trabalhando (ex.: atualização leve, "às 22h pode haver lentidão").
2. **Somente leitura**: o cliente consulta tudo, mas as gravações (vendas, cadastros, pagamentos) ficam bloqueadas com mensagem clara. Serve para migrations rápidas e protege os dados no meio da troca.
3. **Bloqueio total**: tela cheia de manutenção com previsão de volta; é o que o pedido descreve.

### 3.2 Modelo de dados (migration nova, com script de volta)
Tabela `maintenance_windows`: `id`, `title`, `message` (texto para o cliente), `level` (`notice` | `read_only` | `blocked`), `starts_at`, `expected_end_at`,
`announce_hours_before` (padrão 48), `status` (`scheduled` | `active` | `completed` | `cancelled`), `started_at`, `ended_at`, `created_by`, `updated_by`, `reason_internal` (nota interna), `cancel_reason`.
Regras no banco: só uma janela `active` por vez; `expected_end_at` > `starts_at`; duração máxima configurável (ex.: 8 h) para evitar esquecimento; todas as mudanças gravadas em `audit_logs`.
RPCs `SECURITY DEFINER` (padrão do projeto): agendar, editar, iniciar agora, estender, encerrar, cancelar; leitura pública mínima (`get_maintenance_public()`) devolve só título, mensagem, nível e horários — nada interno.

### 3.3 Painel admin — nova tela **Manutenção** (`/admin/maintenance`)
- **Agendar**: título, mensagem, nível, início, previsão de término, quanto tempo antes avisar. Pré-visualização do aviso e da tela de manutenção.
- **Em andamento**: contagem regressiva, botões **Estender (+15/30/60 min)**, **Encerrar agora**, **Cancelar**.
- **Histórico**: janelas passadas com quem agendou, duração real × prevista (ajuda a prometer prazos melhores).
- **Permissões**: agendar/cancelar e ligar o bloqueio só **super admin**; admin comum vê o painel. Confirmação em duas etapas para bloqueio total ("digite MANUTENÇÃO").
- Um botão de **emergência** "Ativar bloqueio agora" (mensagem padrão, sem horário) para incidentes.

### 3.4 Aviso no Dashboard e no app
- Faixa no topo do app (acima do conteúdo, em todas as telas, com destaque no Dashboard) aparece quando faltar `announce_hours_before` para a janela: "Manutenção programada em 22/11 às 22:00, duração prevista de 40 min. Salve o que estiver fazendo antes".
- Contagem regressiva nas últimas 2 horas; botão "Entendi" que esconde por 4 h (reaparece nos últimos 15 min); nunca some sozinha enquanto a janela está ativa.
- Dentro de 10 minutos do início, aviso mais forte e, em telas de formulário, alerta ao tentar salvar perto do horário.
- Opcional: e-mail aos donos de empresa no momento do agendamento (depende de resolver o envio de e-mail, hoje não testado).

### 3.5 Tela de manutenção (bloqueio do ambiente do cliente)
- Página própria (não um erro): logo, "Estamos em manutenção", **mensagem escrita pelo admin**, **horário previsto de volta** e contagem regressiva, "seus dados estão seguros", contato/suporte.
- Atualiza sozinha: consulta o estado a cada 30 s e volta ao sistema quando a janela termina; se passar do previsto, mostra "estamos terminando, obrigado pela paciência".
- Quem está com o app aberto: a primeira resposta bloqueada abre um aviso dentro do app ("o sistema entrou em manutenção") em vez de erro técnico; nada digitado se perde silenciosamente (o texto continua na tela até a pessoa voltar).
- **Entrada do administrador**: super admin autenticado continua acessando `/admin` (e o app, se desejar) durante o bloqueio para acompanhar e encerrar — hoje isso é impossível.
- **Exceções necessárias**: `/api/health` (monitoramento) e o **webhook do EvoPay** (aceitar e guardar o evento para processar depois, em vez de recusar). Páginas públicas (home, termos) podem continuar.
- Resposta `503` com `Retry-After` calculado a partir do horário previsto, e `noindex`.

### 3.6 Como o site sabe que está em manutenção (decisão técnica)
- O middleware consulta o estado da janela por um endpoint leve com **cache de 15–30 s** (o banco não é consultado a cada clique) e **falha aberta**: se a consulta falhar, o site não cai por causa do recurso de manutenção.
- Mantém-se o interruptor atual (variável/arquivo) como **chave de emergência independente do banco**, para os casos em que o próprio banco está sendo restaurado ou movido.
- Para a automação: um script `scripts\manutencao.ps1 iniciar|terminar` liga/desliga a janela, **pausa o vigia de saúde** (para ele não religar o que foi parado de propósito), faz o backup e registra tudo.
- Entrada no horário marcado automática; **saída manual ou automática (escolha do dono)** — recomendo manual com sugestão de encerrar quando o teste de fumaça passar.

## 4. Proposta — travas preventivas de publicação

Objetivo: nenhuma atualização chega ao cliente sem passar por portões que protegem o site, o banco e os dados.

| # | Trava | O que faz | Situação |
|---|---|---|---|
| T1 | Proteção da `main` | exige pull request + CI verde; proíbe push direto e `force push` | falta (a `main` está sem proteção) |
| T2 | CI ampliado | além de lint/tipos/testes/build: toda migration nova precisa de script de volta, sem `DROP`/`TRUNCATE`/renomear destrutivo na mesma versão, e passa pela suíte de testes SQL | parcial |
| T3 | **Backup antes de publicar** | o script de publicação faz backup + restauração de teste (o banco tem 19 MB: leva segundos) e **recusa continuar** se falhar | falta (backup só às 03:00) |
| T4 | **Ensaio da migration em cópia real** | restaura o último backup num banco temporário, aplica as migrations novas, roda testes e confere contagens; só então aplica no banco real | falta |
| T5 | Registro de migrations (`schema_migrations`) | cada migration aplicada fica gravada com data, quem e checksum; o script não reaplica nem pula ordem | falta (hoje não há registro) |
| T6 | Migrations compatíveis com a versão anterior | regra "expandir, trocar, só depois remover": a imagem anterior continua funcionando com o banco novo, o que permite voltar o site sem voltar o banco | prática, sem trava |
| T7 | Limites de tempo nas migrations | `lock_timeout` e `statement_timeout` para uma migration nunca travar o site esperando lock | falta |
| T8 | **Publicação sem queda** | sobe a versão nova ao lado, roda o teste de fumaça (health, login, uma leitura, uma escrita de teste), só então troca o tráfego; volta em um comando | falta (hoje troca no lugar, ~10 s fora do ar, teste manual) |
| T9 | **Teste de fumaça + volta automática** | depois da troca, repete os testes; se falhar, volta sozinho para a imagem anterior e avisa | falta |
| T10 | Janela segura | migrations "pesadas" (que travam tabelas ou mexem em dados) só com manutenção agendada nível 2 ou 3; o script consulta a presença de usuários e avisa se há muita gente online | falta |
| T11 | Interruptores de funcionalidade | funcionalidade nova entra desligada e é ligada pelo painel, sem nova publicação; desliga em um clique se der problema | falta |
| T12 | Aviso de nova versão | abas abertas antes da publicação podem dar erro em ações (versão antiga × nova); o app detecta a versão nova e pede para recarregar | falta |

Fluxo resultante (um comando, `scripts\publicar.ps1`): CI verde → aviso/manutenção (se a migration exigir) → backup verificado → ensaio da migration → aplicar migrations com registro → subir versão nova ao lado → teste de fumaça → trocar tráfego → teste de fumaça de novo → manter a anterior por 24 h para volta rápida → relatório.

## 5. Proteção do banco e das informações dos clientes

**Já protegido**: RLS nas 75 tabelas; regras de acesso por papel dentro do banco (funções com checagem de dono/admin); auditoria; backup diário com restauração testada; cópia criptografada com chave privada fora do PC (a chave pública fica no PC); containers que reiniciam sozinhos; vigia a cada 5 minutos.

**Lacunas, por prioridade**

*Alta (evitam perda de dados):*
1. **Cópia fora do PC** (nuvem criptografada ou HD externo) e **guardar a chave privada do backup fora do PC** (sem ela a cópia criptografada não abre). Se o PC queimar, hoje tudo some junto.
2. **Recuperação até um minuto específico** (arquivamento de log do banco): hoje perde-se até 24 h. Alternativa mais simples: backup a cada 4–6 h + o backup antes de cada publicação (T3).
3. **Backup antes de cada publicação** (T3) e **proteção da `main`** (T1).
4. **Vigia de saúde** respeitar o modo manutenção (para não religar o que foi parado de propósito).
5. **Aviso externo**: se o PC ou a internet cair, ninguém avisa. Monitor externo (ex.: UptimeRobot, gratuito) com alerta no celular e uma **página amigável na Cloudflare** ("em manutenção, voltamos já") para quando o servidor estiver fora.

*Média:*
6. Criptografia dos discos (BitLocker) onde ficam banco e backups; segredos (`.env`, `site.env`) com permissão restrita e rotina de troca.
7. Teste de restauração **completo** mensal (não só contagem de tabelas): subir a cópia, abrir o sistema contra ela e conferir uma venda real.
8. Usuário de banco separado para migrations (o site e a API usam papéis de menor privilégio; migrations rodam com outro, com senha só do operador).
9. Registro de migrations (T5) e teste SQL obrigatório no CI (T2).

*Baixa / evolução:*
10. Auditoria de acesso do administrador mais detalhada e alerta de ação sensível; retenção e descarte de dados (LGPD); roteiro de incidente de dados (quem avisar e em quanto tempo).

## 6. Plano de execução sugerido

| Fase | Entrega | Tamanho | Mexe no banco? |
|---|---|---|---|
| 1 | Manutenção programada: tabela, RPCs, tela `/admin/maintenance`, faixa de aviso no app, tela de manutenção com previsão e contagem, entrada do super admin, exceção do webhook | 1 PR médio (cerca de um dia de trabalho) | sim (1 migration + volta) |
| 2 | Travas de publicação básicas: proteção da `main`, `scripts\publicar.ps1` com backup verificado, `scripts\manutencao.ps1`, vigia que respeita manutenção, registro de migrations | 1 PR + configuração no GitHub e no PC | sim (tabela de registro) |
| 3 | Publicação sem queda + teste de fumaça + volta automática; ensaio de migration em cópia; limites de tempo nas migrations | 1 PR de infraestrutura | não |
| 4 | Proteção de dados: cópia fora do PC, recuperação por minuto, monitor externo e página da Cloudflare, BitLocker, teste de restauração mensal | decisões suas + configuração | não |
| 5 | Interruptores de funcionalidade e aviso de nova versão | 1 PR | sim (pequena) |

Recomendação: começar pela **Fase 1 e pela Fase 2 juntas** (o aviso/tela resolvem o pedido visível, e T1/T3 já reduzem o maior risco), e tratar a Fase 4 em paralelo porque depende de decisões suas (cópia fora do PC, monitor externo).

## 7. Decisões que preciso de você

1. Quer o nível intermediário **somente leitura** além de "só aviso" e "bloqueio total"?
2. Quem pode agendar e ligar o bloqueio: só **super admin** (recomendado) ou também admin?
3. Com quanta antecedência o aviso aparece por padrão (48 h?) e o cliente pode dispensar a faixa?
4. A manutenção **começa sozinha** no horário? E **termina sozinha** ou só quando você encerra (recomendado)?
5. Durante o bloqueio, o administrador deve conseguir entrar no app (além do `/admin`)?
6. Enviar também **e-mail** aos clientes quando agendar? (depende de configurarmos o envio de e-mail)
7. Quer o contato de suporte (WhatsApp/e-mail) na tela de manutenção? Qual?
8. Cópia fora do PC: nuvem criptografada ou HD externo? E onde guardar a chave privada do backup?
