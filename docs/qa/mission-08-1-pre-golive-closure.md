# Missão 08.1 — Fechamento das pendências pré-Go-Live

**Veredito: YELLOW.** Nada crítico novo foi encontrado em segurança ou em banco, e a prova de rollback/replay é forte. Mas **três provas exigidas para GREEN não puderam ser produzidas** (concorrência real, isolamento do Preview, testes autenticados com sessão Clerk real) e **uma delas revelou um risco de configuração** (seção 5). Não houve merge, migration, deploy nem SQL de escrita em Production.

Legenda: `VERIFIED` (executado e observado nesta missão) · `NOT VERIFIED` · `BLOCKED` (impedimento registrado, nada contornado) · `INFERRED` (deduzido, sem execução direta).

## 1. Identificação

| Item | Valor |
|---|---|
| Data/hora | 2026-10-13, 20:35–21:15 (America/Sao_Paulo, UTC−03:00) |
| Branch | `feat/mission-08-admin-control-center` |
| HEAD no início (= remoto) | `fb6a0f071c6c73acd054484efb06503ad17f8406` — o relatório anterior **continuava correspondendo ao estado real** (commit de código `546b2e6…` e de relatório `fb6a0f0…` confirmados; CI `38482199078` e `38482563697` ambos `success`) |
| Alterações desta missão | somente ferramentas de teste e documentação (seção 14); **nenhuma alteração de código de produto ou de migration** |
| PR | [#33](https://github.com/bartolomeu7/saas-project/pull/33) — `OPEN`, `MERGEABLE`, `CLEAN`, base `main` (`3931854`), 19 commits à frente / 0 atrás; carrega as Missões 07, 07.1 e 08 |
| `b.txt` | preservado (não rastreado) |
| Ambientes | **TEST** Supabase `zlmxbqlpjstmllrvafmy` (escrita, sempre em transação revertida ou em fixtures descartáveis); **Production** `fpbcruinppjbwtinzrdg` (**somente SELECT**); Clerk Development (chaves `pk_test`/`sk_test` do `.env.local`, não usadas para criar contas nem sessões); Vercel (metadados) |
| Ferramentas | Supabase MCP (`execute_sql`), `gh`, Node v24.19.0 local, `curl` (GET anônimo), navegador embutido |

## 2. Concorrência financeira real (Etapa B) — `BLOCKED`

**O que o teste existente cobre** (`tests/integration/billing-concurrency.mjs`, lido por inteiro): S1–S10 contra o PostgREST do TEST com **service-role**, transações realmente separadas e `Promise.all`: S1 12 reservas simultâneas da mesma intenção · S2 12 confirmações do mesmo evento · S3 12 reentregas com `event_id` distinto · S4 dois pagamentos distintos simultâneos numa empresa nova · S5 valor divergente/ausente concorrente · S6 intenções distintas simultâneas · S7 reserva abandonada + 10 tentativas · S8 cobrança já criada reaproveitada · S9 `claim` × `confirm` na mesma empresa · S10 estorno × reentregas de `paid`. Ele aborta se o projeto não for o TEST, nunca imprime chaves e limpa o que cria (filtra por ids).

**Pré-requisitos e por que não rodou:**

| Pré-requisito | Estado | Evidência |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` aponta ao TEST | ✔ (`zlmxbqlpjstmllrvafmy`, conferido pelo *ref*, sem imprimir segredos) | `.env.local` |
| `SUPABASE_SERVICE_ROLE_KEY` do TEST | ✘ **variável existe e está vazia** | `.env.local` (comprimento 0) |
| Obter a chave pelo painel do TEST | ✘ sem sessão do Supabase no navegador embutido (tela de login); digitar credenciais é proibido | navegador embutido |
| Rodar em paralelo pelo MCP do Supabase | ✘ **o executor serializa**: duas chamadas simultâneas de `pg_sleep(4)` rodaram em 23:38:05→09 e 23:38:12→16 (sem sobreposição) | `execute_sql` ×2 |
| Caminhos alternativos (dblink, função de borda com URL do banco, token Clerk de sessão/ticket) | **não usados**: contornariam a ausência de credencial (dblink já fora negado pelo classificador na missão anterior; criar usuário/sessão no Clerk é vedado) | — |

**Resultado:** nenhum cenário S1–S10 foi executado. Não houve simulação nem inferência apresentada como prova.

**Lacuna adicional descoberta:** o script cobre só `claim_subscription_payment` / `confirm_subscription_payment`. As operações **administrativas** novas da Missão 08 (concessão de licença, pagamento manual, adicionar membro, transferir propriedade) exigem um JWT de `authenticated` (admin) e **não têm teste de concorrência real** nem poderiam ter com a service-role. Para provar duas chamadas simultâneas com a **mesma** `request_key`, é preciso uma conexão Postgres direta ao TEST (sessões paralelas com `request.jwt.claims`) ou sessões Clerk Development reais. Até lá: `NOT VERIFIED` (a idempotência e a serialização por lock/PK foram provadas **sequencialmente** — 96+50 checks — e por leitura do desenho, `INFERRED`).

**Para fechar** (decisão do dono): pôr a service-role **do TEST** em `.env.local` (git-ignorado) e rodar `npm run test:integration:billing`; e fornecer, para as RPCs admin, uma string de conexão do TEST ou duas sessões Clerk Development.

## 3. Preview — isolamento e testes autenticados (Etapa C) — `BLOCKED`, com achado de configuração

### 3.1 Metadados verificados (`VERIFIED`)
- Deployment GitHub `7052305897` (Preview, commit `546b2e6…`) `success`, e o check Vercel do commit `fb6a0f0…` também `Deployment has completed`; o Preview do primeiro foi sondado e está protegido pelo **SSO da Vercel** (GET anônimo → 302 para `vercel.com/sso-api`). Proteção **não** alterada nem contornada.
- Variáveis do projeto Vercel (`prj_5WpaIqlbBk5dohpT2DW1J1ufaZ1O`), lidas **somente como metadados** (a leitura decriptada de uma variável foi negada pelo classificador — `Credential Materialization` — e respeitada):

| Variável | Alvo | Observação |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` (id `wZHaDc617BGYFQO1`) | **`preview` + `production`, sem branch** | única `NEXT_PUBLIC_SUPABASE_URL` genérica; valor criptografado (não lido). **Por construção ela é a URL que Production usa.** |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | só `production`; override de Preview só para `feat/clerk-auth-prep` (TEST) e `feat/ui-revamp-shadcn` (TEST) | **não existe** anon key de Preview genérica |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` / `CLERK_SECRET_KEY` | `production` = `pk_live`/`sk_live`; Preview = `pk_test`/`sk_test` **só** para `feat/clerk-auth-prep` | **não existe** chave Clerk de Preview para esta branch |
| `SUPABASE_SERVICE_ROLE_KEY`, `EVOPAY_*`, `POSTGRES_*`, `SUPABASE_JWT_SECRET` | só `production` (sensíveis) | corretamente não presentes em Preview |

### 3.2 Conclusão sobre isolamento
Para `feat/mission-08-admin-control-center` **não há override de Preview**. Logo:
1. a URL do Supabase herdada pelo Preview é a **variável compartilhada com Production** (`INFERRED` pela regra de escopo; valor não lido);
2. sem anon key nem Clerk de Preview para esta branch, o runtime autenticado **não funciona hoje** (falha-se fechado, por ausência de chaves — não por desenho de isolamento);
3. se alguém "consertar" adicionando só a anon key/chaves Clerk ao escopo Preview genérico, o Preview passaria a falar com **o Supabase de Production** (ou quebraria por par URL/chave incompatível).

**Isolamento do Preview: NÃO comprovado — e, pela configuração, NÃO existe para esta branch.** Por isso nenhum teste de escrita ou autenticado foi feito no Preview.

### 3.3 Testes autenticados — `BLOCKED`
Requisitos ausentes: (a) SSO da Vercel, (b) variáveis TEST/Clerk Development para a branch, (c) sessão Clerk Development real (criar conta/senha no Clerk é vedado ao agente). Os 13 itens do plano C3 (login, `/admin`, listagens, papéis, recusas de `super_admin`, usuários comuns/suspensos, autoprivilégio, acesso cruzado, licença/pagamento/membros/propriedade, mensagens de erro, console) ficam **`NOT VERIFIED` em navegador**. O que existe é a prova **na camada de banco** (RPC com `request.jwt.claims` simulado), que cobre os itens 4–11 do lado servidor, mas **não** middleware, UI, Clerk nem console.

### 3.4 Correção recomendada (ação do dono, não feita por mim — alterar/gravar variáveis do projeto exige credenciais)
Criar, para `feat/mission-08-admin-control-center` (ou para o padrão `feat/**` que o dono preferir), **overrides de Preview por branch** no mesmo molde de `feat/clerk-auth-prep`: `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` do **TEST**, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` + `CLERK_SECRET_KEY` do **Clerk Development**, e `SUPABASE_SERVICE_ROLE_KEY` do TEST se quiser rodar o webhook/Pix no Preview. **Remover `preview` do alvo de `wZHaDc617BGYFQO1`** (deixá-la só em Production) elimina o vazamento estrutural. Em seguida, conferir por GET que o bundle/servidor do Preview aponta ao TEST antes de qualquer escrita.

## 4. Migrations e correção de segurança em membros (Etapa D1/D2)

### 4.1 Inventário (`VERIFIED`)
Ordem e dependências (todas só no TEST; **0 em Production**, que está em 71 migrations, última `20261008202401`):

| # | Arquivo | Depende de | Down |
|---|---|---|---|
| 1 | `20261011000000_billing_hardening` | `platform_apply_access` (6 args, existente) | `…000000_billing_hardening.down.sql` |
| 2 | `20261011000100_privilege_minimization` | — (independente) | `…000100_privilege_minimization.down.sql` |
| 3 | `20261012000000_lifetime_access_and_license_ops` | 1 (confirm/claim/diagnostics) | `…20261012000000_….down.sql` (recusa se existir vitalício) |
| 4 | `20261012000100_plans_lifetime_awareness` | 3 | `…000100_plans_lifetime_awareness.down.sql` |
| 5 | `20261012000200_admin_company_members_and_reconciliation` | 3 (`platform_begin_operation`) | `…000200_….down.sql` |

Missão 07.1: os commits (`42188f9`, `6472a3b`, `6fff524`, `c71ad02`) **já estão em HEAD**; a única migration 07.1 (compat do `amount` no payload) foi **incorporada ao arquivo** `20261011000000` (TEST a recebeu separadamente como `billing_hardening_compat_payload_amount`). Nenhuma migration 07.1 independente fora do PR.

### 4.2 `admin_add_company_member` e autoprivilégio (`VERIFIED`)
Reexecutado hoje no TEST (`company_members_reconcile.sql`, 50/50): usuário não se adiciona (nem `super_admin`); admin comum **não** adiciona outro administrador da plataforma; `super_admin` pode (decisão deliberada, auditada); ninguém muda o próprio papel; membro de outra empresa não é alcançado (IDOR); limite do plano; um único *owner*. Os testes negativos estão versionados (`tests/sql/company_members_reconcile.sql`) e são reproduzíveis. Isolamento (`tenant_isolation.sql`) reexecutado: **39 tabelas, 0 vazamentos**, incluindo as sondas de `admin_add_company_member`, `admin_grant_license` e `platform_operation_keys`.

## 5. Comparação TEST × repositório × Production (Etapa D3)

Método: impressões digitais calculadas **do catálogo** (não por contagem), nos dois bancos, `SELECT` puro em Production.

1. **Funções (120 em Production × 131 no TEST).** Por assinatura exata, corpo normalizado, ACL, `SECURITY DEFINER` e `search_path`:
   - **14 só no TEST** (novas, da entrega) e **3 só em Production** (assinaturas antigas que as migrations removem: `admin_record_manual_payment` 8 args, `confirm_subscription_payment` 6 args, `platform_apply_access` 6 args). ✔ explicado.
   - **19 com corpo diferente por efeito direto das migrations** (10 reescritas guiadas + 9 recriações completas). ✔ explicado e **provado** na seção 6.
   - **8 funções de negócio legadas** (`complete_sale`, `create_financial_entry`, `create_financial_entry_from_sale_payment`, `create_professional_block`, `pay_accounts_payable`, `receive_sale_payment`, `upsert_professional_profile`, `undo_loyalty_redemption_for_draft_sale`): o primeiro teste apontou diferença — **uma era erro meu de transcrição** (`undo_loyalty…`, hash idêntico ao reconsultar) e as **7 restantes são idênticas quando se removem todos os espaços** (mesmos tokens; `4b4fc863a2…`, `14cc0e5124…` etc. iguais nos dois bancos). Diferença **apenas de formatação**, **anterior às Missões 07/07.1/08** (vem do script de cutover do Clerk). Nenhuma foi tocada nem deve ser "corrigida".
   - **5 funções de gatilho com ACL diferente** (`protect_*`, `set_updated_at`, `validate_purchase_company_links`): efeito pretendido da migration de privilégios.
2. **Políticas RLS: 88 = 88, 0 diferenças. Triggers: 70 = 70, 0 diferenças.**
3. **Constraints/índices/colunas/relações:** só as adições da entrega — `lifetime` em 3 tabelas, `subscriptions.expires_at` passa a aceitar NULL, `plans_access_duration_required_unless_custom` redefinida, 3 CHECKs de coerência, tabela `platform_operation_keys` (RLS ligada, sem grants a `anon`/`authenticated`), índice único parcial de cobrança aberta.
4. **Grants de tabela:** Production hoje dá **todos** os privilégios a `anon` (45 tabelas) e `TRUNCATE/REFERENCES/TRIGGER` a `authenticated`; o TEST tem só `SELECT/INSERT/UPDATE/DELETE` para `authenticated` e nada para `anon`. Efeito pretendido de `20261011000100`.
5. **Histórico de migrations:** o TEST registra 34 entradas com nomes/timestamps próprios (33 até a Missão 08, com o billing em 3 partes + 1 de compat, mais `admin_members_no_self_privilege`, criada na revisão final); o repositório tem 5 arquivos consolidados. Não são comparáveis 1:1 — por isso a comparação é feita pelo **catálogo**.
6. **Nada ficou sem explicação.** (O "≈15 funções legadas" do relatório anterior era uma contagem sem separar formatação; o número real de divergências semânticas legadas é **0**.)

## 6. Prova de rollback e replay (Etapa D4) — `VERIFIED`

Referência de Production (SELECT, 2026-10-13): `acl 877 c2c9718c…` · `column 568 3aa8b7a1…` · `constraint 312 e731c1bb…` · `fn_body 120 c05339e5…` · `fn_cfg 120 7ac20789…` · `index 234 e35319de…` · `policy 88 a646566a…` · `rel 52 d4b3eb6b…` · `trigger 70 8d925b6c…`. (O digest de ACL é o mesmo registrado em 07.1: Production não mudou.)

| Prova | Como | Resultado |
|---|---|---|
| **Rollback exato** | TEST, uma transação: fingerprint S0 → os **5 `down` reais** em ordem inversa → S1 | **S1 == Production nos 9 digests** (n e md5) |
| **Replay das migrations reais** | a partir de S1, as **5 migrations reais** em ordem → S2 | **S2 == S0 nos 9 digests** |
| Fidelidade dos scripts | MD5 de cada `down`/`up` guardado no banco × arquivo do repositório | **10/10 idênticos** (tamanhos 544, 1807, 48022, 11958, 10229, 14419, 955, 51227, 2109, 12377) |
| Reescritas guiadas aplicadas sobre o **texto real de Production** (simulação por `SELECT`, sem escrita) | contagem exata dos 28 padrões + hash do resultado | **10/10 funções: contagens ok e hash == TEST** |
| Reversibilidade total | tudo em transação com erro proposital final | TEST sem resíduo (tabela de rascunho usada no replay foi **removida**; digest final do TEST == S0) |

Observações honestas:
- O rollback foi executado numa transação única; o replay, por exceder o limite de tamanho de uma chamada, rodou a partir de uma **tabela de rascunho** (scripts idênticos por MD5) na mesma lógica transacional. O gerador versionado `tests/sql/build-full-rollback-proof.mjs` produz a prova completa em **um** arquivo (165 KB), e sua saída é idêntica à executada.
- O guarda do `down` de `000000` recusa rodar se houver assinatura vitalícia; o TEST não tinha nenhuma, então o guarda passou. **Em Production, após conceder um Lifetime real, o rollback do banco exigiria converter o vitalício antes.**
- Os `down` **não** restauram dados (ex.: linhas de `platform_operation_keys`, plano `LIFETIME` e concessões); são reversão de esquema.
- Digests intermediários (checkpoints para o Go-Live, ACL/funções/políticas/triggers, que não sofrem efeito da tabela de rascunho): após `20261011000000` `acl 877 c2c9718c`; após `20261011000100` `acl 309 278adadf`; após `20261012000000` `acl 311 31bcb98a`; final (TEST) `acl 317 86bdbab0…`, `fn_body 131 051c9762…`, `policy 88 a646566a…`, `trigger 70 8d925b6c…`.
- **Alvo esperado em Production após as 5 migrations** (`catalog-fingerprint.sql`): `acl 317 86bdbab03b28f97ffd85a5e939b9582f` · `column 577 a8d8b0e0…` · `constraint 317 b6dd9bbd…` · `fn_body 131 051c9762…` · `fn_cfg 131 b329f0b6…` · `index 237 f6146d2e…` · `policy 88 a646566a…` · `rel 53 a3463f50…` · `trigger 70 8d925b6c…`.

## 7. Regressão (Etapa E)

Reexecutadas **nesta missão**, no TEST, transação revertida:

| Bateria | Resultado |
|---|---|
| Licenças / Lifetime / idempotência (`license_ops.sql`) | **96/96** |
| Membros, propriedade, reconciliação, autoprivilégio (`company_members_reconcile.sql`) | **50/50** |
| Isolamento entre empresas (`tenant_isolation.sql`) | **39 tabelas, 0 vazamentos**; 21 sondas negadas/0 linhas |

Executadas **na sessão anterior (mesmo dia, 20:05–20:30, código e catálogo idênticos — o digest do TEST é o mesmo)** e **não repetidas** aqui: Admin/RBAC **299/299**, billing **69/69**, consentimento legal **73/73**, identidade **21** sondas, compatibilidade código antigo × banco novo (C1–C8). Lint (0 erros, 10 avisos preexistentes), typecheck, 80/81 unitários (1 *skip* intencional) e build: **CI exato** `fb6a0f0` — run [38482563697](https://github.com/bartolomeu7/saas-project/actions/runs/38482563697), `success`, Node 22.23.3; nenhuma alteração de código nesta missão, então não foram reexecutados localmente.

Invariantes: **Lifetime** só interno (fora de `get_public_plans`, de `getPlans` do cliente e do `claim`; `price/duration` nulos por CHECK; MRR exclui `lifetime`; as migrations só **inserem** o plano `LIFETIME`, não alteram os de 31/93/365 dias) ✔ · **Billing** (valor ausente/divergente/texto não concede; idempotência por `event_id`; estorno terminal) ✔ · **RBAC** (user/admin/super; último super_admin protegido; autoprivilégio fechado) ✔ · **Multiempresa** ✔ · **Legal**: marcadores `[BLOCKED…]`/`[VALIDAÇÃO JURÍDICA…]` **mantidos**; nada declarado definitivo.

## 8. EvoPay (Etapa F)

| Pergunta | Resposta |
|---|---|
| Sandbox oficial? | **Não.** Documentação lida hoje (`docs.evopay.cash`: introdução, referência, autenticação, schemas, webhook, *for-ais*): nenhuma menção a sandbox, homologação ou modo de teste (`VERIFIED`) |
| Webhook assinado? | **Não** (só `Content-Type`; sem HMAC/segredo) · **uma única tentativa**, sem reenvio (texto da política de entrega) |
| Contratos comprovados | só **por documentação** (valores em reais decimais, status, payloads); `tests/unit/evopay-contract.test.mjs` usa **exemplos da documentação**, não respostas reais (mocks) |
| Comprovado em transação real? | **Nunca** — `NOT VERIFIED`; nenhuma cobrança real foi feita |
| Recusado com segurança | valor ausente/divergente/texto/centavos; pagamento sem cobrança no provedor; evento reutilizado por outro pagamento; `pending`/`expired` tardio após `paid`; `paid` após estorno; plano sem duração; Pix sobre empresa vitalícia (registra, não altera o acesso) |
| Webhook público | só localiza por `id` e **reconsulta `GET /pix?id=`** antes de gravar status (`VERIFIED` por leitura). Observação **baixa** (preexistente): um `id` qualquer cria linha `payment_not_found` em `webhook_deliveries` (há `webhook_deliveries_prune`); sem *rate limit* |
| Risco restante | semântica real do campo `amount`/webhook só se prova com a primeira cobrança de valor mínimo autorizada pelo dono; o sistema **falha fechado** até lá |

## 9. Defeitos
- **Corrigidos nesta missão:** nenhum (não houve defeito de código reproduzido). O defeito de autoprivilégio da revisão anterior continua corrigido e testado.
- **Achados novos (não corrigidos, fora do meu alcance ou de escopo):** (1) configuração de Preview compartilhando a URL do Supabase com Production (seção 3.2) — correção é do dono; (2) lacuna de teste de concorrência para as RPCs admin (seção 2); (3) *log spam* baixo no webhook (seção 8); (4) o relatório anterior dizia "≈15 funções legadas divergentes" — o correto é **0 semânticas** (seção 5).

## 10. Pendências por severidade
**Alta (impede GREEN):**
1. Concorrência financeira real não provada (`BLOCKED`: service-role do TEST ausente) + sem teste concorrente das RPCs admin.
2. Isolamento do Preview inexistente para esta branch; testes autenticados `BLOCKED` (SSO, variáveis, sessão Clerk Development).
3. Admin em navegador com sessão real, T10 e login: `NOT VERIFIED`.

**Média:** EvoPay real `NOT VERIFIED` (falha fechado); Termos/Política em `1.0.0-rc.2` com dados da empresa e revisão jurídica pendentes (**não comercializar**); convite de usuário pela API do Clerk não implementado; o PR #33 agrega 07+07.1+08.

**Baixa:** *log spam* do webhook; `platform_operation_keys` sem retenção; reconciliação manual (sem job); 7 funções legadas com formatação diferente (cosmético).

## 11. Riscos residuais
- Race condition financeira **improvável pelo desenho** (locks por empresa/intenção, PK da chave, índice único parcial) mas **sem prova concorrente**.
- Go-Live sem validação em navegador: uma regressão de UI/middleware só apareceria em Production.
- Se o Preview for "consertado" sem remover o escopo `preview` da URL compartilhada, ele passa a escrever em Production.
- Rollback de banco não restaura dados e exige converter vitalícios antes.

## 12. Recomendação objetiva
**Não há bloqueio técnico de banco nem de segurança conhecido para uma revisão de Go-Live**, e o procedimento de publicação está **ensaiado e verificável** (seção 6). Mas, para sair de YELLOW para GREEN, o dono precisa fornecer: (a) service-role **do TEST** em `.env.local` para S1–S10 e, idealmente, uma conexão ao TEST para provar a concorrência das RPCs admin; (b) overrides de Preview por branch (TEST + Clerk Development) e remoção do escopo `preview` da variável compartilhada; (c) uma sessão Clerk Development para o teste autenticado do `/admin`. **Sugestão de ordem para o Go-Live (quando liberado):** repetir o `catalog-fingerprint.sql` em Production e conferir que continua o digest de referência → aplicar as 5 migrations **uma por vez**, conferindo os checkpoints → merge commit do #33 → esperar READY → smoke somente-leitura → conferir que pagamentos/assinaturas/entitlements permaneceram.

## 13. Confirmação de limites
**Nenhum merge, migration, deploy ou SQL de escrita em Production.** Em Production foram executados apenas `SELECT` (versões de migrations, contagens, hashes de assinaturas/entitlements, fingerprints de catálogo, grants). No TEST: transações revertidas e uma tabela de rascunho temporária, **removida**. Nenhuma variável, segredo, DNS, proteção da Vercel ou configuração do Clerk foi alterada; nenhum segredo foi impresso neste relatório (valores de variáveis `plain` públicas que apareceram na leitura de metadados **não** foram reproduzidos).

## 14. Arquivos desta missão
- `tests/sql/catalog-fingerprint.sql` — consulta de impressão digital do catálogo (somente leitura).
- `tests/sql/build-full-rollback-proof.mjs` — gerador da prova completa de rollback + replay a partir dos arquivos reais.
- `docs/qa/mission-08-1-pre-golive-closure.md` — este relatório (os relatórios anteriores em `docs/qa/` foram preservados).

---

## 15. Continuação (2026-10-13, ~21:30 −03:00): reexecução da prova S0/S1/S2 em uma única transação — `VERIFIED`

- **Estado confirmado antes de executar:** HEAD `ed077c5f1925a6db11abaa0297b5f54fcea97e71` = remoto; árvore limpa (só `b.txt`); PR #33 `OPEN`/`MERGEABLE`; destino **TEST** `zlmxbqlpjstmllrvafmy`; baseline S0 igual ao do relatório (9 digests); 34 migrations no TEST.
- **Script:** `tests/sql/build-full-rollback-proof.mjs` → 165.313 bytes, 3.086 linhas, `sha256 1fcaa393c848a3babe851775bff4bc506437262cfeca3164609016a79166268a`. Inspeção: único controle de transação é `begin;`; nenhum `commit`/`rollback`/`savepoint`/extensão/`dblink`/`notify`/`copy`/`pg_sleep`; termina em `RAISE EXCEPTION`. Fora de funções, só 3 instruções tocam dados (`delete` do plano LIFETIME no `down`, `update` de duplicatas no `up`, `insert` do plano LIFETIME no `up`).
- **Semântica do executor (provada):** cada chamada é um backend distinto (pid 727835 → 727836); um `begin;` sem fim não persiste nem continua na chamada seguinte; DDL, `ALTER DEFAULT PRIVILEGES`, criação de função e `DELETE` são revertidos pelo erro final da mesma chamada. Logo a transação **não** atravessa chamadas: os 10 scripts foram gravados (chamadas separadas, já confirmadas) numa tabela de rascunho e a prova rodou **inteira numa única chamada**, com guarda que abortaria se qualquer MD5 divergisse dos arquivos (10/10 iguais).
- **Resultado (catálogo):** **S1 == Production** e **S2 == S0** nos 9 digests (acl 877/317, column 568/577, constraint 312/317, fn_body 120/131, fn_cfg 120/131, index 234/237, policy 88, rel 52/53, trigger 70).
- **Dados e histórico:** D2 == D0 em subscriptions (6), company_entitlements (6), subscription_payments (3), payment_events (0), companies (6), company_members (9), profiles (14), audit_logs (307), user_consents (2), webhook_deliveries (0), plans (9, colunas estáveis) e histórico de migrations (34).
- **Estado final do TEST:** rascunho removido; 5 migrations aplicadas; `admin_add_company_member` (5 args, com a correção de autoprivilégio) presente; plano LIFETIME presente; `platform_operation_keys` vazia.
- **Concorrência real:** `BLOCKED` (service-role do TEST segue ausente). **Preview autenticado:** `BLOCKED` (SSO; variável de URL compartilhada Preview+Production; sem overrides para a branch). Nenhuma regressão adicional repetida (nenhuma alteração de banco persistiu; última regressão: licenças 96/96, membros 50/50, isolamento 0 vazamentos).
- **Recomendação:** inalterada — YELLOW; Go-Live depende do dono (service-role do TEST, overrides de Preview, sessão Clerk Development).

---

## 16. Missão 08.1.1 — fechamento final das pendências (2026-10-14)

**Veredito: YELLOW (inalterado).** Nenhuma regressão e nenhum defeito novo; as duas provas que faltam para GREEN (concorrência real e Preview autenticado) continuam `BLOCKED` por dependência do dono. Nada foi mergeado, migrado, implantado ou escrito em Production.

### 16.1 Git, PR e CI — `VERIFIED`
| Item | Estado |
|---|---|
| Branch / HEAD | `feat/mission-08-admin-control-center` @ `a631e66d9e2aa1c67a91c4afe8846fa70abf909f` (= remoto) |
| Árvore de trabalho | limpa; apenas `b.txt` não rastreado (preservado) |
| PR #33 | `OPEN`, `MERGEABLE`, `CLEAN`, `headRefOid` = `a631e66…` |
| CI por SHA | `a631e66…`: run `38488592238` `success`. SHAs anteriores (`546b2e6…`, `fb6a0f0…`, `ed077c5…`) também `success` |
| Observação | CI verde **não** é a prova que falta para GREEN; ele não exercita concorrência nem Preview autenticado |

### 16.2 Estado do TEST — `VERIFIED`
Projeto `zlmxbqlpjstmllrvafmy`. 34 migrations no histórico, incluindo as cinco da missão (`billing_hardening` em 3 partes + compat, `privilege_minimization`, `lifetime_access_and_license_ops`, `plans_lifetime_awareness`, `admin_company_members_and_reconciliation`) e `admin_members_no_self_privilege`. As três guardas de autoprivilégio estão presentes em `admin_add_company_member` (autoadição; admin→admin) e `admin_set_company_member_role` (papel próprio). Sem tabelas de rascunho. Depois das baterias: 0 empresas `[*TEST]`, 0 perfis fictícios, 0 `clerk_user_id` de teste, `platform_operation_keys` vazia, 34 migrations (tudo revertido).

### 16.3 Regressão reexecutada no TEST (14/10) — `VERIFIED`
Cada bateria rodou o conteúdo do arquivo do repositório numa única chamada atômica, terminando em `RAISE EXCEPTION 'RESULT: …'` (nada persiste).

| Bateria | Arquivo | Referência | Resultado real |
|---|---|---|---|
| Billing | `tests/sql/billing_confirm.sql` | 69/69 | **69/69**, 0 falhas |
| Admin/RBAC | `tests/sql/admin_platform.sql` | 299/299 | **299/299**, 0 falhas |
| Licenças/Lifetime | `tests/sql/license_ops.sql` | 96/96 | **96/96**, 0 falhas |
| Membros/propriedade/reconciliação | `tests/sql/company_members_reconcile.sql` | 50/50 | **50/50**, 0 falhas |
| Isolamento entre empresas | `tests/sql/tenant_isolation.sql` | 39 tabelas, 0 vazamentos | **39 tabelas, `VAZAMENTOS => nenhum`**; todas as RPCs/DML alheios negados |

Total reexecutado: 514 verificações + isolamento, sem falha. Não reexecutadas nesta missão (sem mudança relevante): `legal_consent` (73), `auth_identity` (21), `billing_compat_old_code`, testes unitários/lint/tsc/build (cobertos pelo CI do `a631e66`). A única diferença entre os arquivos do repositório e o que foi enviado ao banco é a troca do `select … ; rollback;` final da bateria Admin por um `RAISE EXCEPTION` (só para o executor devolver o resultado); os asserts são idênticos.

### 16.4 Prova de rollback — `VERIFIED` (não repetida)
Já concluída na seção 15 (S1 == Production e S2 == S0 nos 9 digests; dados e histórico inalterados; script sha256 `1fcaa393c848a3babe851775bff4bc506437262cfeca3164609016a79166268a`). Não houve mudança de migration ou de rollback desde então (`git diff` de `supabase/` entre `ed077c5` e `a631e66` é vazio), portanto não foi repetida.

### 16.5 Concorrência real — `BLOCKED`
- `.env.local`: `SUPABASE_SERVICE_ROLE_KEY` continua vazia. `.env.prod-backup.local` é de **Production** e **não** foi usado.
- Não foi pedido ao dono que cole a chave no chat. Nenhuma credencial de Production usada.
- O MCP serializa as chamadas (provado por timestamps), portanto **não** é prova de concorrência; testes sequenciais também não foram apresentados como tal.
- **Configuração segura (ação do dono):** (1) no painel do projeto **TEST** (`zlmxbqlpjstmllrvafmy`), copiar a chave `service_role`; (2) colá-la **você mesmo** em `.env.local` (arquivo ignorado pelo git), linha `SUPABASE_SERVICE_ROLE_KEY=…`, junto de `NEXT_PUBLIC_SUPABASE_URL` apontando para o TEST; (3) confirmar que a URL contém `zlmxbqlpjstmllrvafmy`; (4) avisar aqui — então rodo `npm run test:integration:billing` (S1–S10: idempotência do claim, estado final, sem duplicidade). Para concorrência das RPCs admin (licença/membros), é preciso uma conexão direta ao TEST (string de conexão do pooler) ou duas sessões Clerk Development.
- Risco residual (`INFERRED`): locks por empresa/intenção, PK da chave de operação e índice único parcial tornam a corrida improvável, mas sem prova concorrente.

### 16.6 Preview — `BLOCKED`
- Deployment Vercel `7053248074` do `a631e66`: sucesso; `GET /` → `302` e `GET /admin` → `302` para `vercel.com/sso-api` (proteção SSO ativa — **não** contornada).
- Variáveis (somente metadados, nada decriptado): `NEXT_PUBLIC_SUPABASE_URL` (id `wZHaDc617BGYFQO1`) segue com alvos **preview + production** e sem override para esta branch; não há anon key / chaves Clerk de Development específicas para o Preview desta branch. **Portanto não está provado (nem presumido) que o Preview escreveria no TEST** — por isso nenhum teste de escrita foi feito.
- Pré-requisitos exatos que faltam (ação do dono): (1) criar overrides **por branch** (`feat/mission-08-admin-control-center`) para `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` do **TEST**; (2) `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` e `CLERK_SECRET_KEY` de **Clerk Development**; (3) remover `preview` do alvo de `wZHaDc617BGYFQO1` (hoje compartilhada com Production); (4) disponibilizar um acesso autenticado oficial (acesso Vercel/bypass de proteção emitido pelo dono, e uma sessão Clerk Development criada por ele). Depois disso: provar TEST + Clerk Development + nenhuma variável compartilhada apontando para Production, e só então testar `/admin` com escrita.
- Não foram criadas contas Clerk, sessões, senhas nem bypass.

### 16.7 Classificação final
| Item | Classe |
|---|---|
| Git/PR/CI do `a631e66` | `VERIFIED` |
| 5 migrations + guardas presentes no TEST | `VERIFIED` |
| Billing 69, Admin 299, Licenças 96, Membros 50, Isolamento 39/0 | `VERIFIED` |
| Rollback/replay (S1==Production, S2==S0) | `VERIFIED` (seção 15) |
| Production inalterada (71 migrations, sem escrita) | `VERIFIED` na seção 13; sem nova consulta nesta missão |
| Concorrência financeira real | `BLOCKED` |
| Concorrência das RPCs admin | `NOT VERIFIED` |
| Preview autenticado / `/admin` em navegador / T10 / login | `BLOCKED` / `NOT VERIFIED` |
| Isolamento de variáveis do Preview | `INFERRED` (não isolado) |
| EvoPay real (sem sandbox) | `NOT VERIFIED` (falha fechado) |
| Convite via Clerk | não implementado |
| Documentos legais `1.0.0-rc.2` (dados da empresa, revisão jurídica) | pendente; não comercializar |

### 16.8 Pendências que dependem do dono
1. Service-role do **TEST** em `.env.local` (e, se possível, string de conexão do TEST) → concorrência real.
2. Overrides de Preview por branch (TEST + Clerk Development) e remoção de `preview` da URL compartilhada → Preview autenticado.
3. Sessão Clerk Development / acesso Vercel autorizado → teste de `/admin`, login e T10.
4. Dados empresariais e revisão jurídica dos documentos.
5. Primeira cobrança Pix de valor mínimo autorizada (EvoPay).

### 16.9 Recomendação final
**YELLOW.** Não há bloqueio técnico conhecido de banco/segurança, a regressão está íntegra e o procedimento de publicação está ensaiado. Para GREEN faltam apenas as provas dos itens 1–3. Um Go-Live sem elas é decisão de risco do dono (uma regressão de UI/middleware ou de concorrência só apareceria em Production). **Nenhuma ação em Production foi tomada; aguardando a decisão do dono.**
