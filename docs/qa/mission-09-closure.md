# Missão 09 — Fechamento dos riscos de Planos e Limites de Uso

Data: 2026-10-14 · Base: commit `d217ed8` (PR #34, draft) · Escopo: **somente TEST** (`zlmxbqlpjstmllrvafmy`). Relatório anterior: `docs/qa/mission-plans-management-and-usage-limits.md` (os itens abaixo o complementam/corrigem). Documentação técnica: `docs/plans-and-usage-limits.md`.

Legenda: **VERIFIED** (executado e observado) · **NOT VERIFIED** (não executado) · **BLOCKED** (impedido por restrição/limite do ambiente) · **INFERRED** (deduzido de código/documentação, sem execução).

## 1. Resumo

| Requisito | Status |
|---|---|
| Etapa 1 — estado real (Git, PR, CI, migrations, relatório) | **VERIFIED** (§2) |
| Etapa 2 — gate de sessões confiável | **VERIFIED** no banco/concorrência/unidade; API real do Clerk **NOT VERIFIED** (§3) |
| Etapa 3 — proteção do teste grátis (4 níveis distintos) | **VERIFIED** no banco/concorrência; cadastro real **BLOCKED** (§4) |
| Etapa 4 — segredo antifraude | **VERIFIED** (código/unidade/inventário de variáveis); configuração em Production **pendente do dono** (§5) |
| Etapa 5 — compatibilidade de implantação (expansão → código → contração) | **VERIFIED** em TEST (17 cenários + rollback/replay) (§6) |
| Etapa 6 — validação autenticada (Preview) | **BLOCKED** (§7) |
| Etapa 7 — regressão final | **VERIFIED** (§8); CI: ver §12 |
| Production alterada | **Não** (§11) |

**Achado principal desta missão (não previsto no pedido):** quem tinha empresa mas nenhuma assinatura (teste negado, assinatura vencida) **conseguia gravar dados de negócio chamando a API do Supabase diretamente** — a recusa do teste só existia na camada HTTP. Provado em TEST antes do conserto e fechado na migration `…000300` (§4.3).

## 2. Etapa 1 — estado real

* Git: branch `feat/plans-management-usage-limits`, `HEAD == origin == d217ed8` no início; nenhum commit posterior; árvore limpa exceto `b.txt` (preservado). Commit contém 43 arquivos (lista em `git show --stat d217ed8`).
* PR [#34](https://github.com/bartolomeu7/saas-project/pull/34): aberta, **draft**, mergeável, não mergeada. CI *Phase 3 CI* (`verify`) **SUCCESS** em `d217ed8` (run 38569454230: `npm ci`, lint, typecheck, test:unit, build — todos *success*); Vercel Preview `success` para o mesmo SHA.
* TEST no início: migration `20261014122223` (a da missão anterior). Relatório de `d217ed8` coerente com o estado.

## 3. Etapa 2 — gate de sessões

**Auditoria (o que estava errado ou fraco):**
| # | Achado | Correção |
|---|---|---|
| S1 | Só os layouts aplicavam o limite: Server Action/API de sessão recusada passava | O **middleware** lê o estado da vaga e nega páginas (redirect), Server Actions e APIs (403 `SESSION_LIMIT_REACHED` / `SESSION_UNVERIFIED`) em `/app`, `/admin`, `/onboarding`, `/api/billing` |
| S2 | Falha do Clerk/banco **liberava em silêncio** | Política explícita: sessão já validada segue; **nunca validada ⇒ `unverified`** (negada só a ela, temporária, com tela de nova tentativa); gate ausente no banco ⇒ libera com log (expansão do deploy) |
| S3 | Corrida: a lista do Clerk é lida antes do registro; uma sessão aceita há instantes podia ser **podada** por outra requisição com lista "velha" (vaga derrubada → contagem errada) | `register_session_slot` não poda vagas com < 60 s e **nunca poda com lista incompleta** (`p_list_complete`, > 100 sessões) |
| S4 | Sessão que o Clerk não lista era tratada como "aceita" | Passa a `unverified` (não ocupa vaga; não é "limite") |
| S5 | Sem teto de tempo nas chamadas externas | 4 s + 1 repetição (Clerk) e 4 s (banco) |
| S6 | `/onboarding` (criação da empresa e do teste) sem o gate | Gate adicionado |

**Fontes de verdade:** `sid` (claim padrão do Clerk, assinado) diz *qual* sessão é — **nunca quantas**; contagem = API do Clerk no servidor + registro atômico no banco. Docs do Clerk consultadas: `sid` é claim padrão do token de sessão; token vive 60 s (revogação efetiva em até ~60 s); `getSessionList({ status })` existe; o Clerk **não** oferece "N sessões por usuário" (só sessão única) — por isso o limite é de aplicação.

**Testes (resultados reais):** `tests/unit/session-gate.test.mjs` **23/23** (Clerk falha, timeout, repetição, sessão inválida, limite atingido, banco falha, gate ausente, lista incompleta, concorrência modelada, middleware por estado, parsing não confiável); `tests/sql/mission09.sql` grupo `session_race` (7) e `usage_limits.sql` grupo `sessions` (≈30) todos verdes; concorrência real **U5/U5b/U5c/U6** (18/18 ×2) e **M5** (listas divergentes simultâneas: as 3 aceitas permanecem, as 6 novas recusadas, nenhuma falha).

**Limitações que permanecem (documentadas):** token da sessão revogada vale ~60 s; a recusa vale para a aplicação (quem chama o PostgREST direto continua limitado só pela RLS — ver §4.3); `sid` no JWT do **Supabase** é **INFERRED** (o app passa o `sid` do servidor como parâmetro) e a **API real do Clerk não foi exercitada** (**NOT VERIFIED**, depende de sessão Clerk real).

## 4. Etapa 3 — teste grátis

### 4.1 Os quatro níveis (sem confundir)
| Nível | Bloqueado? | Como |
|---|---|---|
| 1. Criação da **conta** no Clerk | **Não** pelo app | Controles nativos do Clerk (Dashboard, ação do dono): *Challenge suspicious sign-ups*, bloqueio de e-mails descartáveis, blocklist/allowlist, modo de acesso restrito (`sign_up_mode_restricted`) |
| 2. Criação da **empresa** | **Não** | quem é negado cria a empresa **sem** teste |
| 3. **Concessão do teste** | **Sim** | autorização do servidor (IP→HMAC, janela, limite, TTL 1 h) + concessão única |
| 4. **Acesso aos recursos** | **Sim** | middleware (`/app/assinatura`) **e** RLS restritiva de escrita (M4) |

### 4.2 Webhooks / pré-validação (pesquisa em documentação oficial)
Existem webhooks (`user.created`, `session.created/ended/revoked/removed`; `verifyWebhook` com `CLERK_WEBHOOK_SIGNING_SECRET`), mas são **pós-fato**; não encontrei hook síncrono que bloqueie a conclusão do cadastro (**INFERRED**: ausência na documentação consultada) e o payload não traz o IP (**INFERRED**). **Decisão: não implementar** endpoint de webhook agora — não bloquearia o cadastro, não daria o IP, e o ponto server-side do onboarding já é idempotente. Fica como endurecimento opcional (tabela de idempotência por `svix-id`).

### 4.3 Auditoria do fluxo e achados
| Pergunta | Resultado |
|---|---|
| Criar várias contas? | Sim (inerente). Limitado por conexão (3 / 24 h, configurável); IPs diferentes/VPN **não** são limitados (limitação inerente) |
| Repetir eventos de cadastro? | Idempotente: `authorize` repete a mesma decisão por 1 h (testes `ttl`, U8) |
| Concessão duplicada? | Impossível: índice único **já existente** `subscriptions_one_trial_per_user_idx` + locks; **M1** (8 pedidos simultâneos de teste ⇒ exatamente 1), **M2** (6 criações simultâneas ⇒ 1 empresa, 1 teste), **M4** (12 donos, mesma conexão ⇒ exatamente 3) |
| Contornar o limite por IP? | Cabeçalho forjado ignorado (unit); IPv6 /64; **IP desconhecido tinha escape ilimitado ⇒ agora teto 10× o limite** (teste `unknown_ip`) |
| Autorização "acumulada" para usar depois? | **Achado**: não expirava ⇒ agora vale 1 h (testes `ttl`) |
| Negado nunca mais podia receber o teste (a mensagem prometia "aguarde")? | **Achado** ⇒ `claim_free_trial` + botão "Solicitar teste grátis" (mesma regra; testes `claim`, M1/M4) |
| Acessar recursos gratuitos antes da validação / sem receber o teste? | **Achado (VERIFIED em TEST antes do conserto):** dono de empresa sem assinatura **inseriu** em `customers` e `product_categories` direto pela API. **Corrigido (M4)**: políticas RESTRICTIVE de INSERT/UPDATE/DELETE em 18 tabelas (40 políticas) via `company_has_active_access()` (mesma regra do middleware); SELECT **não** foi restringido (vencidos leem/exportam). Testes: sonda em todas as 18 tabelas (A/C/E: 18/18 recusadas, 0 gravadas; B/D e funcionário de B: 0 recusas), sale_items/sales/customer_raffles com linha válida |

## 5. Etapa 4 — segredo antifraude

* Uso: `hashClientIp(ip, segredo)` = HMAC-SHA256 `v1`. Resolução em `resolveAntifraudSecret`: dedicado válido (≥ 32 caracteres variados) ⇒ usa; **fraco/curto ⇒ inválido em qualquer ambiente** (não é substituído em silêncio); **Production sem dedicado ⇒ `required_in_production`, teste suspenso** (falha segura; conta e empresa seguem); fora de Production ⇒ derivado do `CLERK_SECRET_KEY` do ambiente (**antes**, o fallback valia também em Production e, sem nenhum segredo, concedia o teste como `ip_unknown`).
* Logs: apenas mensagens estáticas, uma vez por processo; teste unitário garante que o resumo (`describeAntifraudConfig`, exibido em `/admin/settings`) não contém o segredo nem prefixo dele.
* Rotação: os identificadores antigos deixam de coincidir (contadores recomeçam; retenção 30 dias); nada é corrompido (testado).
* **Independência TEST × Production:** chaves do Clerk diferentes por ambiente (inventário de variáveis da Vercel — nomes/alvos apenas, valores **não lidos**: `CLERK_SECRET_KEY` de Production é uma, a de Preview/TEST outra) e, em Production, só o segredo dedicado vale. **`ANTIFRAUD_HASH_SECRET` não existe em nenhum ambiente da Vercel hoje** (**VERIFIED** pelo inventário). **Ação do dono antes da contração em Production:** criar `ANTIFRAUD_HASH_SECRET` (≥ 32 caracteres aleatórios, diferente por ambiente) no painel da Vercel, escopo do ambiente; **não enviar pelo chat**; nenhuma variável de Production foi alterada.

## 6. Etapa 5 — compatibilidade de implantação

O deploy não é atômico. Estratégia **expansão → código → contração** (migrations separadas):
* `…000000` (expansão 1) — compatível com o código antigo;
* `…000100` (expansão 2) — gate/antifraude/`claim_free_trial` (só código novo usa);
* `…000200` (contração) — `create_company_with_owner` passa a exigir autorização (só depois do deploy);
* `…000300` — RLS de acesso aos dados (opcional/independente).

**Provas (transação revertida, `tests/sql/build-mission09-proof.mjs`; executada com os mesmos arquivos carregados numa tabela de rascunho e conferidos por MD5):**
* `down` na ordem inversa a partir do estado final ⇒ **S1 idêntico ao catálogo de antes da missão nos 9 tipos** (acl 317 `86bdbab0…`, column 577 `a8d8b0e0…`, constraint 317 `b6dd9bbd…`, fn_body 131 `051c9762…`, fn_cfg 131 `b329f0b6…`, index 237 `f6146d2e…`, policy 88 `a646566a…`, rel 53 `a3463f50…`, trigger 70 `8d925b6c…`).
* replay das 4 migrations ⇒ **S2 == S0** nos 9 tipos (acl 327, column 611, constraint 338, fn_body 148, fn_cfg 148, index 245, policy 128, rel 56, trigger 72).
* **17 verificações de compatibilidade**, todas OK, em cada estado: *antigo* (cadastro recebe teste; vitrine 14 colunas) · *expansão 1* (código **antigo** continua recebendo o teste; código **novo** autoriza e recebe; vitrine 26 colunas ⊇ as 14 antigas; checkout recusa plano de teste/preço 0) · *expansão 2* (3 e 4 argumentos coexistem; claim posterior concede uma vez) · *contração* (sem autorização ⇒ sem teste; com ⇒ teste e autorização consumida; negado pode pedir depois) · *acesso* (escrita liberada com teste ativo).
* Código novo × banco antigo: gate "não instalado" ⇒ libera com log (teste unitário, e o erro real de função ausente — `PGRST202`, HTTP 404 — foi **observado** no PostgREST do TEST); `normalizePublicPlan` tolera o formato antigo (teste); `authorizeTrialSignup` com função ausente ⇒ `unavailable` (e o banco antigo concede o teste por conta própria).
* Mudanças desta missão na M1 (já só no TEST): `create_company_with_owner` estrita saiu da M1 para a contração; o índice único novo que eu havia criado foi **removido** (já existia um equivalente); migrations M2–M4 aplicadas em TEST com `apply_migration` (versões `20261014133156`, `…133204`, `…133214`).
* **Dependência:** esta cadeia precisa que as 5 migrations da Missão 08 (PR #33) estejam aplicadas antes (usa `subscriptions.lifetime`, `platform_*`).

## 7. Etapa 6 — validação autenticada

**BLOCKED.** Motivos, todos verificados: (a) Preview do SHA exato (`d217ed8`, deployment `7066255737`) existe e responde **302 → login SSO da Vercel** sem credenciais; (b) a Vercel **não tem overrides de Preview para esta branch** (só para `feat/mission-08…`, `feat/clerk-auth-prep`, `feat/ui-revamp-shadcn`), logo o Preview desta branch usa as variáveis genéricas `NEXT_PUBLIC_SUPABASE_URL`/`ANON_KEY` com alvo *preview+production* — **Preview NÃO isolado** (não escrevi nada nele nem criei variáveis); (c) não há `CLERK_SECRET_KEY`/service-role de TEST no Preview; (d) criar conta/digitar senha no Clerk é vedado ao agente.

**O que foi verificado sem login (local, `next dev` contra TEST):** home lê o catálogo único de TEST (planos E2E, Teste, Mensal 89,00, Trimestral 240,00, Anual 899,00, QA 06.1, Personalizado "Solicite um orçamento" sem canal configurado), sem erros de console; `/app`, `/admin/plans`, `/acesso-sessoes`, `/onboarding` redirecionam ao login; `POST /api/billing/create-payment` sem sessão ⇒ 401.

**Para destravar (ações do dono):** no painel da Vercel criar, **só para a branch `feat/plans-management-usage-limits` em Preview**: `NEXT_PUBLIC_SUPABASE_URL`/`ANON_KEY` do TEST, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` (pk_test), `CLERK_SECRET_KEY` (sk_test), `SUPABASE_SERVICE_ROLE_KEY` do TEST, `ANTIFRAUD_HASH_SECRET` próprio; remover `preview` do alvo das variáveis genéricas; fornecer acesso SSO e uma conta **Clerk Development descartável criada pelo dono**. Então executar o roteiro: login → `/admin/plans` (criar/editar plano de teste, preços/desconto/benefícios) → home → limite de usuários → 4ª sessão → teste grátis → limpeza.

## 8. Etapa 7 — regressão (todas no estado final do TEST)

| Bateria | Resultado |
|---|---|
| `tests/sql/mission09.sql` (nova: acesso aos dados, corrida de sessão, TTL, IP desconhecido, claim, concessão) | **63/63** |
| `usage_limits.sql` (2 expectativas ajustadas por semântica nova: poda protegida < 60 s; TTL da autorização) | **101/101** |
| `plans_management.sql` | **140/141** na execução completa; o 141º (`nenhum plano é excluível`) depende do **papel**: como `postgres` (BYPASSRLS) o DELETE é barrado pela FK, não pela ausência de política. Tornei o papel explícito no arquivo e **reverifiquei isoladamente** (como super_admin autenticado ⇒ 0 linhas) — **VERIFIED**, mas a versão final do arquivo não foi reexecutada inteira |
| `tenant_isolation.sql` | 39 tabelas, **0 vazamentos**; todas as 23 tentativas recusadas |
| `auth_identity.sql` | 21/21 expectativas |
| `billing_confirm.sql` / `billing_compat_old_code.sql` | **69/69** / C1–C8 como esperado |
| `license_ops.sql` / `company_members_reconcile.sql` | **96/96** / **50/50** |
| `legal_consent.sql` | **73/73** |
| `admin_platform.sql` | **299/299** |
| Prova de rollback/replay + compat (§6) | S2==S0, S1==pré-missão, 17/17 |
| Concorrência real `ul-conc-runner` (U1–U9) | **18/18 ×2**, 0 respostas 5xx, `max_in_flight` = chamadas paralelas, resíduos 0 |
| Concorrência real `m9-conc-runner` (conexões Postgres paralelas como `authenticated`) | **13/13** (M1 8 pedidos, M2 6 criações, M3 6 sem autorização, M4 12 fluxos, M5 9 registros), resíduos 0 |
| `npm run lint` / `typecheck` / `build` | 0 erros (10 avisos pré-existentes em arquivos não tocados) / limpo / sucesso |
| `npm run test:unit` | 166 testes: **165 passam**, 0 falham, 1 skipped |

Runners: Edge Functions temporárias do TEST **substituídas por stub 410**; tabela de rascunho removida; resíduos `[…TEST]` = 0; slots/eventos vazios. (A cópia implantada dos runners usa um token descartável e, no `m9`, textos sem acento: o repositório guarda a versão com placeholder.)

## 9. Etapa 8 — encerramento

Cada requisito está classificado nas tabelas acima. **Nenhuma declaração de prontidão para produção** é feita: os fluxos críticos autenticados (login real, painel, cadastro real, API real de sessões do Clerk) **não têm evidência** (BLOCKED/NOT VERIFIED). O que tem evidência é o comportamento no banco (RPC/RLS/triggers), sob concorrência real, e a lógica de decisão em unidade.

## 10. Riscos residuais

1. **Cadastro real e API real do Clerk não exercitados** (BLOCKED/NOT VERIFIED): `sid` no JWT, `getSessionList` e `revokeSession` reais, extração de IP com cabeçalhos reais da Vercel (**INFERRED** pela documentação da Vercel/comentário do código; unit com entradas sintéticas).
2. **Preview não isolado** para esta branch (§7); enquanto isso, qualquer teste autenticado em Preview exigiria as ações do dono.
3. **Production sem `ANTIFRAUD_HASH_SECRET`**: se a contração for aplicada antes de configurá-lo, o teste grátis fica **suspenso** (seguro, mas o produto perde conversões).
4. **IP atrás de NAT/CGNAT** compartilha o limite; VPN/IPs rotativos escapam do limite por conexão (inerente); o pedido posterior (`claim_free_trial`) recupera quem foi negado por engano.
5. **A M4 muda comportamento em Production** para empresas sem acesso ativo (escrita direta deixa de funcionar — o app já as redirecionava): requer decisão de produto; é independente e reversível.
6. O gate de sessão faz uma leitura barata (`session_slot_status`) no middleware **e** outra no layout (a do layout só vira verificação completa quando a sessão ainda não foi validada); é a mesma ordem de custo do guard de consentimento. Otimização possível: o middleware repassar o estado ao layout por cabeçalho interno. `/api/presence` não é gateado de propósito.
7. O token Clerk de sessão revogada vale ~60 s; a recusa é da aplicação (§3).
8. Tipos TypeScript do Supabase **não foram regenerados** para as RPCs novas (chamadas feitas com *cast* tipado localmente).
9. O Clerk-level (bot protection, e-mails descartáveis) é configuração do dono — não verificada.

## 11. Production

**Inalterada.** Nenhuma migration, SQL de escrita, variável, configuração, deploy ou merge em Production; PR #33 não mergeada; nenhuma cobrança real. Evidência por construção (todas as chamadas SQL/Edge apontam para o projeto TEST; o inventário de variáveis da Vercel foi só **leitura de metadados**, sem valores). Não houve leitura direta de Production.

## 12. Git / CI

* Commit de trabalho: `6e9ef7f` (`fix(plans): fechamento Missão 09 …`, 31 arquivos), sobre `d217ed8`, publicado em `origin/feat/plans-management-usage-limits` (sem force-push).
* CI *Phase 3 CI* (`verify`) em `6e9ef7f`: **SUCCESS** (run 38601112819, 1 m 45 s: `npm ci`, lint, typecheck, test:unit, build — todos *success*). Vercel Preview do mesmo SHA: build `success` (acesso protegido por SSO; não validado autenticado — §7).
* PR #34: draft, **não mergeada** (empilhada sobre a #33, também não mergeada). Este arquivo foi atualizado em um commit só de documentação posterior a `6e9ef7f`.
* Preservados: `b.txt` (não rastreado) e todos os commits/branches anteriores.

## 13. Arquivos

**Novos:** `supabase/migrations/20261014000{100,200,300}_*.sql`, `supabase/rollback/20261014000{100,200,300}_*.down.sql`, `src/lib/auth/session-gate-core.ts`, `src/components/app/request-trial-button.tsx`, `tests/sql/{mission09.sql,build-mission09-proof.mjs}`, `tests/unit/session-gate.test.mjs`, `tests/integration/edge/mission09-concurrency-runner.ts`, este relatório.
**Alterados:** `supabase/migrations/20261014000000_*.sql` (a parte estrita de `create_company_with_owner` foi para a contração; só comentários e remoção desse bloco), `src/middleware.ts`, `src/lib/auth/session-gate.ts`, `src/lib/security/{client-ip,trial-signup}.ts`, `src/lib/companies/actions.ts` (+`requestFreeTrialAction`), layouts `(app)`/`admin`, páginas `/onboarding`, `/acesso-sessoes`, `/app/assinatura`, `/admin/settings`, `.env.example`, `docs/plans-and-usage-limits.md`, testes `usage_limits.sql`, `plans_management.sql`, `client-ip.test.mjs`.

## 14. Próximos passos (dependem de autorização)

1. Revisão desta cadeia de migrations + PR #33; decisão sobre a M4 (RLS de acesso aos dados).
2. Dono: `ANTIFRAUD_HASH_SECRET` por ambiente; overrides de Preview por branch (§7); configurar proteções nativas do Clerk; criar conta Clerk Dev descartável.
3. Validação autenticada manual/E2E (§7) e, só então, avaliar Go-Live (ordem: Missão 08 → expansão → deploy → contração → opcional M4).

**Parada obrigatória:** nada além do escopo foi feito; aguardando autorização explícita.
