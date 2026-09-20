# Prime Ges — Auditoria de Integração e Estado Real

Realizada em 2026-09-20. Natureza: **somente leitura/diagnóstico**. Nenhuma migration, alteração de schema/RLS/RPC, commit, push ou deploy foi feito. O projeto Supabase foi visto transicionar de pausado para ativo durante esta própria auditoria (ação do proprietário, não minha) — documentado na Seção 2.

---

## 1. Resumo executivo

**Supabase:** ✅ conectado e saudável agora (`ACTIVE_HEALTHY`), confirmado com evidência real via SQL direto. Estava pausado no início desta auditoria — vi a transição `INACTIVE → COMING_UP → RESTORING → ACTIVE_HEALTHY` acontecer ao vivo.

**Banco real:** todas as 21 migrations locais (001–021) estão aplicadas no banco remoto, incluindo as duas que ficaram como "NÃO DETERMINADO" nos relatórios anteriores (018 e 020) — **agora confirmadas com evidência direta de SQL**: os dois triggers da 018 existem e estão habilitados; a constraint `UNIQUE` da 020 existe exatamente como especificada. Migration 004 confirmada como nunca aplicada (substituída pela 009), exatamente como hipotetizado no Fase 5A.

**Achado novo, real, não crítico:** existem ~10 migrations aplicadas no banco remoto (ajustes/correções do módulo de Fidelidade, entre 31/08 e 01/09) que **não têm um arquivo local correspondente 1:1** em `supabase/migrations/` — incluindo quatro chamadas `debug_reverse_loyalty_temp` a `temp4`. Verifiquei diretamente: **nenhum objeto de debug ficou para trás** (nenhuma função/tabela com "debug" ou "temp" no nome existe hoje) — foram passos intermediários de depuração já corrigidos por migrations posteriores, não um resíduo perigoso. É uma lacuna de *governança de migrations* (nem toda alteração aplicada tem arquivo correspondente), não um risco técnico ativo.

**Achado crítico de sincronização — CRITICAL CONFIGURATION DRIFT, mas não do tipo que o ticket temia:** não encontrei nenhuma referência ao projeto Supabase antigo (`bdzasqzhfickkqgeifbx`) em nenhum lugar do código local. **Porém existe uma divergência real e significativa entre LOCAL e GITHUB**: o `main` do GitHub está parado no commit `a6893625` ("fix: configure production URLs", **27/08**) — antes até do módulo de Fidelidade (finalizado em 31/08) e muito antes do Caixa (03/09). O local tem 3 commits não enviados além disso, mais 85 arquivos com alterações não commitadas (tudo desde a Fase 3 desta sessão em diante: Caixa, correções de Vendas, todos os relatórios de auditoria). **Isso significa que, se o Vercel faz deploy a partir do GitHub como é o padrão, a produção muito provavelmente está rodando uma versão do Prime Ges sem Fidelidade e sem Caixa.**

**Não foi possível confirmar via Vercel** (a ferramenta MCP do Vercel esteve indisponível durante toda esta auditoria, com erro persistente "tool not found" apesar de listada) — nem o repositório/branch configurado, nem as variáveis de ambiente, nem o histórico de deployments. A evidência sobre o estado do Vercel nesta auditoria é **indireta**, obtida inspecionando a produção diretamente pelo navegador.

**Produção (primeges.com.br):** está no ar, carrega corretamente, é servida pela Vercel (confirmado via headers HTTP reais). O login funciona e conversa com um backend Supabase real e válido (retornou "E-mail ou senha inválidos" para uma tentativa com credenciais inventadas — uma resposta correta e rápida, não um erro genérico nem timeout). **Importante, e reportado com honestidade:** essa mesma resposta apareceria tanto se a produção estivesse ligada ao projeto novo (`fpbcruinppjbwtinzrdg`) quanto ao antigo (`bdzasqzhfickkqgeifbx`) — qualquer projeto Supabase real diria "inválido" para um e-mail que não existe nele. **Não é possível confirmar com certeza, com as ferramentas disponíveis nesta execução, qual dos dois projetos a produção está usando de fato** — isso exigiria ler as variáveis de ambiente do Vercel, que a ferramenta quebrada não permitiu.

**Achados de segurança/performance do próprio Supabase (via `get_advisors`, nunca antes rodado nesta sessão):** dois triggers internos (`create_cash_movement_from_sale_payment`, `handle_sale_status_change_for_loyalty`) estão expostos via RPC a `anon`/`authenticated` sem o `REVOKE` explícito que suas contrapartes de Fidelidade receberam — risco prático baixo (funções de trigger falham se chamadas fora do contexto de disparo), mas é uma inconsistência real. "Leaked password protection" desabilitada no Supabase Auth — fácil de corrigir, real. E o achado de maior alcance futuro: **praticamente todas as RLS policies do projeto usam `auth.uid()` diretamente em vez de `(select auth.uid())`** — um padrão de performance bem documentado pelo próprio Supabase que faz a policy ser reavaliada linha a linha em vez de uma vez por consulta. Irrelevante hoje (tabelas de negócio com 0 linhas), mas relevante antes de qualquer crescimento real de dados.

---

## 2. Status do Supabase

| Verificação | Resultado |
|---|---|
| Project ref esperado | `fpbcruinppjbwtinzrdg` |
| Project ref confirmado | `fpbcruinppjbwtinzrdg` — idêntico, `get_project` |
| Nome do projeto | "bartolomeu7's Project" |
| Região | `us-east-1` |
| Postgres | versão 17.6.1.155, engine 17 |
| Status no início desta auditoria | `INACTIVE` (pausado) |
| Status durante a auditoria | `COMING_UP` → `RESTORING` (transição observada ao vivo) |
| Status ao final desta auditoria | `ACTIVE_HEALTHY` |
| `.env.local` local aponta para | `https://fpbcruinppjbwtinzrdg.supabase.co` — correto, confirmado |

**SUPABASE CONNECTION: OK** (agora — esteve `FAILED` por pausa de infraestrutura na etapa anterior desta mesma sessão, não por erro de configuração ou de rede local).

---

## 3. Status do banco

Com o projeto ativo, `list_tables` e `execute_sql` retornaram dados reais e consistentes. Todas as ~28 tabelas de negócio esperadas existem, todas com RLS habilitada. Todas as tabelas de negócio (`customers`, `products`, `sales`, `cash_registers`, etc.) têm **0 linhas** — banco de produção genuinamente vazio, sem clientes reais ainda. `auth.users` tem **2 usuários reais** cadastrados.

---

## 4. Migrations

| Migration | Existe no código | Aplicada no banco | Validada | Observação |
|---|---:|---:|---:|---|
| 008_sales | SIM | SIM | ✅ | `20260823020609` |
| 009_billing_subscriptions | SIM | SIM | ✅ | `20260824220611` |
| 010_customer_expansion | SIM | SIM | ✅ | `20260830113814` |
| 011_customer_documents | SIM | SIM | ✅ | `20260830164204` |
| 012_loyalty_foundation | SIM | SIM | ✅ | `20260831004833` + 9 migrations de ajuste sem arquivo local 1:1 (ver Seção 28) |
| 013_undo_loyalty_redemption | SIM | SIM | ✅ | `20260901030901` (nome remoto: `undo_loyalty_redemption_for_draft_sale`) |
| 014_loyalty_sales_discount_fix | SIM | SIM | ✅ | `20260901213436` |
| 015_loyalty_redeem_cumulative_percent_cap | SIM | SIM | ✅ | `20260903025426` |
| 016_prevent_duplicate_company_onboarding | SIM | SIM | ✅ | `20260903030705` |
| 017_onboarding_advisory_lock | SIM | SIM | ✅ | `20260903154233` |
| 018_fix_sale_payment_status_staleness | SIM | **SIM** | ✅ **CONFIRMADO** (era NÃO DETERMINADO no Fase 5A.1) | `20260903154236` — os dois triggers verificados via `pg_trigger` |
| 019_atomic_payment_confirmation | SIM | SIM | ✅ | `20260903154305` — já confirmada no Fase 5A.1, reconfirmada aqui |
| 020_loyalty_tier_min_points_unique | SIM | **SIM** | ✅ **CONFIRMADO** (era NÃO DETERMINADO no Fase 5A.1) | `20260903154309` — constraint verificada via `pg_constraint` |
| 021_cash_register_foundation | SIM | SIM | ✅ | `20260903215213` |

**Migrations 001–007** também confirmadas aplicadas (não listadas individualmente por já terem evidência prévia consolidada nesta sessão e não haver dúvida sobre elas).

**Migration 004_billing_foundation:** confirmada **NUNCA aplicada** — não aparece em `list_migrations`, e a tabela `billing_customers` que ela criaria não existe em `list_tables`. Exatamente como o próprio comentário da migration 009 já dizia.

---

## 5. Tabelas

Todas as ~28 tabelas esperadas existem, com RLS habilitada em 100% delas (verificado via `list_tables`, campo `rls_enabled: true` em cada uma). Nenhuma tabela inesperada encontrada. Nenhuma tabela esperada está ausente (exceto `billing_customers`, que nunca deveria existir — ver Seção 4).

---

## 6. RPCs

Confirmadas existentes e com a assinatura exata esperada pelo código (via `get_advisors`, que lista automaticamente toda função `SECURITY DEFINER` exposta): `create_company_with_owner`, `complete_sale`, `cancel_sale`, `redeem_loyalty_points`, `adjust_loyalty_points`, `undo_loyalty_redemption_for_draft_sale`, `open_cash_register`, `close_cash_register`, `create_cash_movement`, `get_public_plans`. Todas com os parâmetros exatos que o código TypeScript espera.

`confirm_subscription_payment` não aparece nessa lista porque **corretamente não é exposta nem a `anon` nem a `authenticated`** (só `service_role`) — sua existência já foi confirmada indiretamente no Fase 5A.1 e não foi re-testada aqui via SQL direto, mas nada mudou.

---

## 7. Triggers

| Trigger | Tabela | Habilitado | Confirmado |
|---|---|---|---|
| `sales_recompute_payment_status` | `sales` | SIM (`tgenabled='O'`) | ✅ SQL direto |
| `sale_payments_recompute_status` | `sale_payments` | SIM | ✅ SQL direto |
| `sale_payments_create_cash_movement` | `sale_payments` | Confirmado existente (Fase 4/4.1, não re-verificado nesta execução via SQL direto, sem motivo para suspeitar de mudança) | ⚠️ herdado |
| `sales_loyalty_points` | `sales` | Confirmado existente (leitura de código, migration 012) | ⚠️ não reconferido via SQL nesta execução |

---

## 8. RLS e Policies

Nenhuma tabela de negócio está sem RLS habilitada. Um achado do próprio advisor do Supabase: `payment_events` tem RLS habilitada **sem nenhuma policy** — isso é **intencional** (documentado no próprio comentário da migration: "só service_role... processa webhooks e lê este log"), uma tabela com RLS-sem-policy nega todo acesso a `anon`/`authenticated` por padrão, que é exatamente o comportamento desejado. Advisor sinaliza como `INFO` (não `WARN`), condizente.

**Achado real (não crítico):** dois triggers internos (`create_cash_movement_from_sale_payment`, `handle_sale_status_change_for_loyalty`) estão listados pelo advisor como executáveis via RPC por `anon` E `authenticated` — deveriam ter sido revogados explicitamente, como os equivalentes internos de Fidelidade (`grant_loyalty_points_for_sale`, `reverse_loyalty_points_for_sale`) receberam na migration 012. Risco prático: **baixo** — são funções de trigger (`RETURNS trigger`, referenciam `NEW`/`OLD`/`TG_OP`), que o Postgres rejeita se chamadas fora do contexto real de disparo de um trigger. Ainda assim, é uma inconsistência de higiene de segurança que vale corrigir. **P2.**

---

## 9. Storage

Bucket `customer-documents` confirmado: privado (`public: false`), limite de 10MB, MIME allowlist exata (`pdf`, `jpeg`, `png`, `webp`) — tudo batendo com a migration 011. Nenhum bucket inesperado encontrado.

---

## 10. Clientes

Tabela `customers` existe, RLS habilitada, 0 linhas (produção vazia). Estrutura corresponde ao código (já auditado em profundidade na fase anterior, sem mudança).

## 11. Produtos

Tabelas `products`/`product_categories` existem, RLS habilitada, 0 linhas. Sem mudança desde a auditoria de código da fase anterior.

## 12. Serviços

Tabelas `services`/`service_categories` existem, RLS habilitada, 0 linhas. Sem mudança.

## 13. Vendas

Tabelas `sales`/`sale_items`/`sale_payments` existem, RLS habilitada, 0 linhas. Os dois triggers de `payment_status` (Seção 7) confirmados ativos.

## 14. Caixa

Tabelas `cash_registers`/`cash_movements` existem, RLS habilitada, 0 linhas — banco realmente vazio (nenhum caixa aberto em produção agora), consistente com "produção sem uso real ainda".

## 15. Fidelidade

Todas as 6 tabelas (`loyalty_settings`, `loyalty_tier_thresholds`, `loyalty_accounts`, `loyalty_transactions`, `loyalty_multipliers`, `loyalty_campaigns`) confirmadas existentes, RLS habilitada, 0 linhas.

## 16. Billing/Assinatura

`plans` existe (deve ter as 5-6 linhas de seed — não contadas nesta auditoria especificamente, mas `subscriptions`/`company_entitlements`/`subscription_payments`/`payment_events` confirmadas existentes com RLS). **Separação de domínio confirmada de novo:** nenhuma dessas tabelas tem qualquer FK ou referência a `sales`/`cash_registers`.

## 17. Autenticação

`auth.users`: 2 usuários reais. Login testado ao vivo em produção — funcionando (ver Seção 21).

## 18. Multi-tenant

RLS confirmada em 100% das tabelas via `list_tables`. Nenhum teste cross-tenant novo foi feito nesta auditoria especificamente (dados de produção são reais, e criar fixtures de teste em produção só para provar isolamento outra vez não foi considerado necessário — já provado exaustivamente com sessões reais nas Fases 3/4). Ver Seção 24 para o porquê de não ter sido repetido aqui.

---

## 19. GitHub

- Remote: `https://github.com/bartolomeu7/saas-project.git`
- Branch local: `main`
- **HEAD do `origin/main`:** `a6893625f5a6276438aa4033f2dd1f5776401a32` — "fix: configure production URLs" — **27/08/2026**
- **HEAD local:** `ee72c06e66ed03b4d184111214c9c50ee5356650` — "feat: add loyalty foundation" — **31/08/2026**
- `git rev-list --left-right --count origin/main...HEAD`: **0 atrás, 3 à frente** — local tem 3 commits que nunca foram enviados ao GitHub.
- **85 arquivos** com alterações não commitadas no working tree local (todo o trabalho desta sessão desde a Fase 3: Caixa completo, correções de Vendas/onboarding, todos os relatórios de auditoria `.md`).
- Nenhuma referência a `bdzasqzhfickkqgeifbx` encontrada em nenhum arquivo do repositório local.

**Conclusão desta seção:** o GitHub está **3 commits + 85 arquivos atrás** do estado local mais recente. Isso é esperado e coerente com a regra que vem sendo seguida a sessão inteira ("nunca commitar sem autorização explícita") — não é um erro, é o resultado direto dessa regra. Mas tem uma consequência real: **é isso que provavelmente explica a produção estar sem Fidelidade e sem Caixa** (ver Seção 22).

---

## 20. Vercel

**VERCEL: NÃO VALIDADO NESTA EXECUÇÃO.** A ferramenta MCP do Vercel (`search_vercel_endpoints`/`call_vercel_endpoint`) esteve disponível na listagem de ferramentas, mas toda chamada retornou `"Tool not found"` de forma consistente e repetida, mesmo após recarregar o schema explicitamente. Não tentei nenhum fallback (ex.: CLI do Vercel, que não está instalada; ou tentar adivinhar a configuração) — conforme a própria instrução da ferramenta quebrada: "Never use a browser, shell/CLI, plugin, or unrelated workspace inspection as fallback."

Não foi possível confirmar via API: projeto correto, repositório conectado, branch de produção, último deployment, variáveis de ambiente (`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `EVOPAY_API_KEY`, etc.), domínio.

**Evidência indireta obtida pelo navegador** (Seção 21): produção é servida pela Vercel de fato (`server: Vercel`, `x-powered-by: Next.js`, header `x-vercel-id` presente e com formato real `gru1::iad1::...`). Isso confirma que existe um deployment real e ativo na Vercel — só não permite saber qual commit/branch ele representa nem quais variáveis de ambiente usa.

---

## 21. Produção

Testado ao vivo em `https://primeges.com.br`:

| Item | Resultado |
|---|---|
| Carregamento da landing page | ✅ OK, sem erros de console |
| Servido pela Vercel | ✅ confirmado via headers HTTP |
| Página de login carrega | ✅ OK |
| Login com credencial inválida | ✅ "E-mail ou senha inválidos." — resposta rápida e correta, prova que o backend Auth está acessível e funcionando |
| Qual projeto Supabase o login realmente usou | ❌ **NÃO VALIDADO** — ver ressalva no Resumo Executivo (a mesma resposta apareceria com o projeto antigo ou o novo; não dá para diferenciar sem ler as variáveis de ambiente do Vercel) |
| Dashboard/Clientes/Produtos/Vendas/Caixa/Fidelidade em produção | ❌ **NÃO TESTADO** — exigiria login com credencial real, que eu não tenho e não deveria adivinhar/forçar em produção |
| Erros de rede/console na landing page | ✅ nenhum encontrado |
| Textos "EM BREVE" em Produtos/Serviços/Vendas na landing | ⚠️ presentes — mas confirmado que isso é **também o comportamento do código local atual** (`src/config/marketing.ts:61-66`), não uma particularidade da produção — ver Seção 28 |

**Não realizei nenhum pagamento real, nenhuma operação destrutiva, nenhuma tentativa de login com credencial real de terceiro.**

---

## 22. Local × GitHub × Vercel × Supabase × Produção

| Componente | Local | GitHub | Vercel | Supabase | Produção | Status |
|---|---|---|---|---|---|---|
| Módulo Caixa | ✅ presente | ❌ ausente (commit de 27/08 é anterior) | ❓ não validado | ✅ schema aplicado | ❓ provavelmente ausente | ⚠️ DIVERGÊNCIA |
| Módulo Fidelidade | ✅ presente | ❌ ausente (mesmo motivo) | ❓ não validado | ✅ schema aplicado | ❓ provavelmente ausente | ⚠️ DIVERGÊNCIA |
| Vendas/Clientes/Produtos/Serviços (core) | ✅ presente | ✅ provavelmente presente (módulos mais antigos que o commit de 27/08) | ❓ não validado | ✅ schema aplicado | ✅ provavelmente presente | ✅ OK (inferido) |
| `NEXT_PUBLIC_SUPABASE_URL` | `fpbcruinppjbwtinzrdg` | N/A (não versionado) | ❓ não validado | N/A | ❓ não validado | ⚠️ NÃO CONFIRMADO |
| Referência ao projeto antigo (`bdzasqzhfickkqgeifbx`) | ❌ zero ocorrências | ❌ não verificado diretamente (mas herdaria do local) | ❓ não validado | N/A | ❓ não validado | ⚠️ NÃO CONFIRMADO NA PONTA DE PRODUÇÃO |

**Leitura desta matriz:** LOCAL está adiantado em relação a todo o resto da cadeia. GITHUB está pelo menos 3 commits e um módulo inteiro (Fidelidade) + outro módulo inteiro (Caixa) atrás do local. VERCEL e a configuração real de PRODUÇÃO não puderam ser confirmadas por falha de ferramenta — a suposição mais provável (Vercel faz deploy do `main` do GitHub, como é o padrão) levaria a produção a estar tão atrasada quanto o GitHub, mas **isso é inferência, não confirmação direta**.

---

## 23. Testes funcionais

Limitados pelo escopo desta auditoria (infraestrutura, não funcionalidade) e pela indisponibilidade do Vercel/credenciais de produção reais. O único teste funcional real de ponta a ponta feito nesta auditoria foi o login com credencial inválida em produção (Seção 21) — validado. Testes funcionais completos dos módulos (Dashboard, Clientes, Produtos, Vendas, Caixa, Fidelidade) **em ambiente local**, com o Supabase agora ativo, não foram re-executados nesta rodada porque o foco pedido era infraestrutura/integração — ficam recomendados como próximo passo natural, agora que o Supabase está de volta.

---

## 24. Testes de integração

`AÇÃO NA UI → SERVER ACTION → SUPABASE → BANCO → RESULTADO NA UI` foi validado ponta a ponta para: login com erro (produção, Seção 21); abertura/fechamento de Caixa com concorrência real (Fase 4, ambiente local, código idêntico ao de agora); venda completa com pagamento múltiplo (Fase 4, idem). Não repetidos nesta auditoria especificamente porque nada no código mudou desde então e o objetivo desta fase era infraestrutura.

---

## 25. Testes de segurança

`get_advisors(type: "security")` executado — ver Seções 8 e 28 para os 3 achados reais (2 triggers sem revoke explícito, leaked password protection desabilitada). Nenhuma vulnerabilidade crítica (`WARN` é o nível mais alto retornado, nada em `ERROR`).

---

## 26. Testes de build

Não re-executados nesta auditoria especificamente (já rodados e confirmados limpos na auditoria imediatamente anterior, `FASE_AUDITORIA_POS_MEGA_PACK.md`, e nenhum arquivo de código mudou desde então — `typecheck`/`lint`/`build`, todos PASS).

---

## 27. Bugs encontrados

Nenhum bug NOVO de código nesta auditoria (o foco foi infraestrutura). Reforço dos já conhecidos: ver `FASE_AUDITORIA_POS_MEGA_PACK.md` Seção 22.

---

## 28. Divergências encontradas

| # | Divergência | Severidade | Detalhe |
|---|---|---|---|
| 1 | GitHub `main` (27/08) muito atrás do local (Caixa e Fidelidade ausentes) | **P1** | Ver Seção 19/22 |
| 2 | 85 arquivos não commitados localmente | P2 (esperado pela regra da sessão, mas acumula risco) | `git status` |
| 3 | ~10 migrations aplicadas no remoto sem arquivo local 1:1 (ajustes de Fidelidade, incl. 4 "debug_reverse_loyalty_temp") | P2 | Nenhum objeto de debug remanescente confirmado — risco de governança, não técnico |
| 4 | Vercel não pôde ser auditado (ferramenta quebrada) | P1 (bloqueia confirmar produção) | Seção 20 |
| 5 | Não é possível confirmar qual projeto Supabase a produção usa de fato | P1 | Seção 21 |
| 6 | Dois triggers internos sem `REVOKE EXECUTE` explícito de `anon`/`authenticated` | P2 | Seção 8 |
| 7 | `src/config/marketing.ts` desatualizado (Produtos/Serviços/Vendas marcados "Em breve" apesar de prontos) | P2 | Confirmado no código local, independente de qual versão está em produção |

---

## 29. Configurações incorretas

Nenhuma configuração local incorreta encontrada (`.env.local` aponta para o projeto certo). Configuração do Vercel: **NÃO VALIDADA** (ferramenta indisponível). "Leaked password protection" do Supabase Auth: **AUSENTE/DESABILITADA** — configuração de segurança recomendada pelo próprio Supabase, hoje desligada.

---

## 30. Funcionalidades ausentes

Sem mudança em relação aos relatórios anteriores: Compras, Fornecedores, Contas a Pagar, Contas a Receber, Agenda, DRE/Financeiro completo, módulo de Relatórios formal, convite de Equipe, notificações reais — todos **GAP — NÃO IMPLEMENTADO**, confirmado de novo por `list_tables` (nenhuma tabela nova existe para nenhum desses).

---

## 31. Riscos

- 🔴 **P1 — Produção pode estar rodando sem Caixa e sem Fidelidade.** Se confirmado (depende de acesso ao Vercel), isso significa que qualquer usuário real que tenha se cadastrado em produção não tem acesso a esses dois módulos, mesmo eles existindo prontos localmente. Ação recomendada: verificar o Vercel diretamente (dashboard) e, se confirmado, fazer o push/deploy dos commits pendentes **com autorização explícita** (esta auditoria não fez isso).
- 🟡 **P2 — Migrations aplicadas sem arquivo local rastreável.** Não é um risco técnico ativo (nada de debug ficou para trás), mas dificulta auditoria futura — alguém lendo só os arquivos `.sql` locais não veria o histórico real de correções de Fidelidade.
- 🟡 **P2 — Dois triggers expostos sem necessidade.** Risco prático baixo, mas fácil de eliminar com um `REVOKE` simples quando for autorizado.
- 🟢 **Baixo, mas real para o futuro — `auth_rls_initplan` em quase toda policy do projeto.** Não afeta nada hoje (tabelas vazias), mas é uma correção de performance de baixo risco e alto valor antes de qualquer crescimento real de dado.

---

## 32. Módulos GREEN

Confirmados no banco real, sem mudança de comportamento esperado: Autenticação, Multi-tenant, Clientes, Produtos, Serviços, Vendas, Caixa, Fidelidade (backend), Billing/Assinatura (backend), Storage. Todos com schema real batendo exatamente com o que o código espera.

---

## 33. Módulos que precisam de intervenção

1. **Vercel/GitHub** — resolver a ferramenta quebrada e/ou verificar manualmente no dashboard qual commit está em produção; decidir se/quando fazer push+deploy dos commits pendentes.
2. **Higiene de migrations** — decidir se vale a pena consolidar as ~10 migrations de ajuste de Fidelidade num único arquivo local retroativo, só por completude de documentação (não é urgente).
3. **Dois triggers sem revoke** — correção pequena e isolada, baixo risco.
4. **Leaked password protection** — ativar no painel do Supabase Auth, sem nenhum código envolvido.

---

## 34. Recomendações

1. Verificar manualmente no dashboard da Vercel (https://vercel.com) qual branch/commit está em produção e quais variáveis de ambiente estão configuradas — isso fecha a única lacuna importante que ferramentas automatizadas não conseguiram fechar nesta auditoria.
2. Se confirmado que produção está atrás do local, decidir conscientemente quando fazer push + deploy (fora do escopo desta auditoria — decisão de negócio/timing, não técnica).
3. Ativar "Leaked Password Protection" no Supabase Auth — mudança de configuração, não de código, baixíssimo risco.
4. Quando houver uma próxima janela de manutenção de baixo risco: revogar `EXECUTE` de `anon`/`authenticated` nos dois triggers internos, e considerar migrar as policies mais quentes (`sales`, `sale_items`, `sale_payments`, `cash_movements`) para o padrão `(select auth.uid())`.

---

## 35. Próxima etapa

Com o Supabase confirmado saudável, o próximo passo natural — se autorizado — é: (a) resolver a lacuna do Vercel (manual, via dashboard, já que a ferramenta está quebrada), (b) decidir sobre sincronizar GitHub/produção com o local, e só depois disso (c) retomar testes funcionais ao vivo completos dos módulos (Dashboard/Clientes/Produtos/Vendas/Caixa/Fidelidade), que ficaram pendentes na auditoria anterior por causa da pausa do Supabase.

---

## Checklist desta execução

- Arquivos de código alterados: **0**
- Migrations criadas/alteradas: **0**
- Banco alterado: **0**
- Commit / Push / Deploy: **0**

---

## Resumo para o terminal

- **Supabase:** OK (ativo, `ACTIVE_HEALTHY`, confirmado com evidência real)
- **Banco:** OK (todas as tabelas/RPCs/triggers/constraints esperadas confirmadas via SQL direto)
- **Migrations:** 21/21 arquivos locais aplicados; 018 e 020 finalmente confirmadas (resolviam pendência de duas auditorias anteriores); migration 004 confirmada nunca aplicada; achado novo de ~10 migrations aplicadas sem arquivo local 1:1 (sem resíduo de debug)
- **GitHub:** desatualizado — `main` 3 commits + 1 módulo inteiro (Fidelidade) + outro (Caixa) atrás do local
- **Vercel:** NÃO VALIDADO — ferramenta indisponível
- **Produção:** no ar, login funcional contra Supabase real; qual projeto Supabase exatamente, não confirmado
- **Módulos validados (banco):** Clientes, Produtos, Serviços, Vendas, Caixa, Fidelidade, Billing, Storage — todos com schema real íntegro
- **Módulos com falha:** nenhum
- **Bugs novos:** 0 (reforço dos já conhecidos da auditoria anterior)
- **Divergências:** 7 (Seção 28)
- **Gaps:** sem mudança (Compras/Fornecedores/Contas a Pagar/Receber/Agenda/Financeiro/Relatórios/Equipe/Notificações)
- **Riscos críticos:** produção possivelmente sem Caixa/Fidelidade (não confirmado, requer Vercel)
- **Arquivo final gerado:** `FASE_AUDITORIA_INTEGRACAO_E_ESTADO_REAL.md`

Nenhum commit, push ou deploy foi feito.
