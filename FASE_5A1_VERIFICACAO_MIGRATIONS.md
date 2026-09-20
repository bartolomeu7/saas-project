# FASE 5A.1 — Verificação do estado real das migrations 017–021

Prime Ges · projeto Supabase `fpbcruinppjbwtinzrdg` · verificação realizada em 2026-09-04
Natureza: **somente leitura**. Nenhum código, migration, RPC, trigger, RLS ou dado foi alterado.

---

## 1. Objetivo

Determinar, com evidência objetiva, se as migrations 017, 018, 019, 020 e 021 estão aplicadas no banco Supabase remoto real do Prime Ges — sem assumir pelo nome dos arquivos, pelo código, ou pelo relatório anterior (`FASE_5A_AUDITORIA_FINANCEIRO.md`).

---

## 2. Projeto remoto verificado

- **Project ref:** `fpbcruinppjbwtinzrdg`
- **URL:** `https://fpbcruinppjbwtinzrdg.supabase.co`
- **Confirmação de que é o projeto correto:** é a mesma URL configurada em `NEXT_PUBLIC_SUPABASE_URL` no `.env.local` do próprio repositório do Prime Ges — o mesmo projeto usado pela aplicação em produção, e o mesmo projeto contra o qual toda a sessão anterior (Fases 1 a 4) trabalhou.
- Nenhuma senha, service role key, anon key completa, ou token foi exibido nesta verificação ou neste relatório.

---

## 3. ⚠️ Limitação de ferramentas encontrada — leia antes das seções seguintes

Antes de qualquer coisa, é necessário registrar com transparência total um problema real que mudou o método de verificação possível nesta execução:

- **A conexão MCP do Supabase que esteve disponível nas fases anteriores desta sessão está desconectada** — não há mais acesso a `execute_sql`, `list_migrations`, `list_tables` ou qualquer ferramenta equivalente.
- **Não há Supabase CLI instalado nem projeto vinculado** (`supabase/config.toml` não existe no repositório; não há histórico de link local).
- **Não há token de acesso do Supabase** (`SUPABASE_ACCESS_TOKEN`) disponível no ambiente para autenticar o CLI contra a API de gerenciamento.
- **Não há string de conexão direta ao Postgres** (nenhum `DATABASE_URL`/senha de banco) no `.env.local` — só `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` (esta última **vazia** localmente, confirmado repetidas vezes ao longo da sessão).

**Consequência direta:** o comando `supabase migration list` (ou `--linked`), pedido explicitamente na Seção 2 deste ticket, **não pôde ser executado nesta sessão** — ele exige ou um projeto vinculado com token de acesso válido, ou uma conexão direta ao banco, nenhum dos quais está disponível aqui. Da mesma forma, não foi possível consultar diretamente a tabela de controle de migrations do próprio Supabase (`supabase_migrations.schema_migrations`), que não é exposta pela API REST pública (`PostgREST`) em nenhuma hipótese — ela vive fora do schema `public` e fora do alcance da chave anônima.

**O que foi possível fazer, e como:** usando somente a chave `anon` pública (a mesma que já é embutida no bundle do frontend em produção — não é segredo) e chamadas HTTP `GET`/`POST` comuns contra a API REST do próprio Supabase (`PostgREST`), é possível **provar a existência ou ausência de uma tabela ou função no schema `public`**, sem executar nenhuma escrita, através do formato do erro retornado:

| Situação | Código HTTP | Corpo da resposta |
|---|---|---|
| Tabela/função **não existe** | `404` | `PGRST205` (tabela) ou `PGRST202` (função) — "Could not find ... in the schema cache" |
| Função **existe**, mas o papel usado (`anon`) não tem permissão de execução | `401` | `42501` — "permission denied for function \<nome\>" |
| Tabela **existe**, RLS filtra a leitura (nenhuma sessão autenticada) | `200` | `[]` (lista vazia, não erro) |
| Função **existe** e é chamável por `anon` | `200` | resultado real da função |

Esse método foi **calibrado antes de usar** contra dois controles conhecidos: `get_public_plans()` (função real, liberada para `anon` — retornou `200` com dados reais) e um nome de função inventado (`this_rpc_does_not_exist_xyz` — retornou `404`/`PGRST202`). Com os dois extremos calibrados, o terceiro caso (`401`/`42501`) fica inequivocamente identificado como "existe, mas sem permissão" — que é exatamente o padrão esperado para toda RPC financeira do projeto (todas são `SECURITY DEFINER`, restritas a `authenticated` ou `service_role`, nunca a `anon`).

**Importante — o que este método NÃO prova:** para uma função que já existia antes e foi *modificada* por uma migration mais recente (`CREATE OR REPLACE FUNCTION` no mesmo nome), confirmar que a função "existe" **não prova qual versão do corpo está ativa agora** — só prova que uma função com aquele nome existe. Isso afeta diretamente a migration **017** (que só modifica o corpo de `create_company_with_owner`, já existente desde a migration 002, alterado também em 009 e 016). Não afeta a migration **019**, porque `confirm_subscription_payment` é um nome de função inteiramente novo, criado pela primeira e única vez nessa migration — "existe" ali equivale a "a 019 (ou algo idêntico a ela) foi aplicada". Também não afeta a **021**, cujos objetos (`cash_registers`, `cash_movements`, `open_cash_register`, `close_cash_register`, `create_cash_movement`) são todos novos, sem versão anterior.

Este método **não tem nenhuma forma de detectar** a existência de um *trigger* (migration 018 modifica `recompute_sale_payment_status`, uma função de trigger — não invocável via RPC, PostgREST recusa expor funções que retornam `trigger`) nem de uma *constraint* isolada (migration 020 adiciona só um `UNIQUE` em `loyalty_tier_thresholds`, sem nenhum objeto novo exposto pela API). Confirmar essas duas exigiria SQL direto (`pg_trigger`/`pg_constraint`) ou um teste comportamental que envolvesse escrever um dado real — **ambos fora do alcance desta verificação**, seja por falta de ferramenta, seja porque o próprio ticket proíbe qualquer escrita.

---

## 4. Tabela 017–021 — Local × Remoto

| Migration | Local (arquivo) | Remoto — o que foi possível confirmar | Coincide? | Situação |
|---|---|---|---|---|
| 017 | `017_onboarding_advisory_lock.sql` — existe, modifica `create_company_with_owner` (advisory lock) | Função `create_company_with_owner` **existe e está protegida** (`401`/`42501`, mesma assinatura de erro do controle positivo) — mas **não é possível confirmar qual das 4 versões** (002/009/016/017) está ativa sem SQL direto | ⚠️ PARCIAL | Objeto existe; versão específica **NÃO DETERMINADA** |
| 018 | `018_fix_sale_payment_status_staleness.sql` — modifica trigger `recompute_sale_payment_status` + adiciona trigger `sales_recompute_payment_status` | Nenhum objeto exposto via API para testar (função de trigger, não invocável via RPC) | — | **NÃO DETERMINADO** — exige SQL direto ou teste comportamental com escrita real (fora do escopo permitido) |
| 019 | `019_atomic_payment_confirmation.sql` — cria `confirm_subscription_payment` (nome inteiramente novo) | Função **existe** — `401`/`42501 "permission denied for function confirm_subscription_payment"`, idêntico ao padrão calibrado de "existe, sem permissão para anon" | ✅ SIM | **CONFIRMADO: o objeto da migration 019 existe no banco remoto** |
| 020 | `020_loyalty_tier_thresholds_min_points_unique.sql` — adiciona `UNIQUE(company_id, min_lifetime_points)` | Nenhum objeto exposto via API para testar (é só uma constraint) | — | **NÃO DETERMINADO** — exige SQL direto ou um teste com escrita real (fora do escopo permitido) |
| 021 | `021_cash_register_foundation.sql` — cria `cash_registers`, `cash_movements`, 3 RPCs, trigger | **Confirmado**: `cash_registers` e `cash_movements` existem (`200`, `[]`); `open_cash_register`, `close_cash_register`, `create_cash_movement` existem (`401`/`42501` cada, mesmo padrão calibrado) | ✅ SIM | **CONFIRMADO integralmente** |

---

## 5. Verificação dos objetos críticos — chamadas realizadas

Todas as chamadas abaixo usaram exclusivamente a chave `anon` pública, via `curl`, sem nenhuma sessão autenticada e sem nenhum parâmetro real/válido — cada uma foi rejeitada antes de qualquer execução real da função (ver explicação de segurança na Seção 6).

| Objeto | Método | Resultado | Código |
|---|---|---|---|
| `get_public_plans()` — controle positivo | `POST /rest/v1/rpc/get_public_plans` | `200`, retornou 6 planos reais (incl. um plano `TEST_R1` — ver nota fora de escopo ao final) | positivo calibrado |
| `this_rpc_does_not_exist_xyz` — controle negativo | `POST /rest/v1/rpc/...` | `404 PGRST202` | negativo calibrado |
| `cash_registers` | `GET /rest/v1/cash_registers?select=id&limit=1` | `200`, `[]` | existe |
| `cash_movements` | `GET /rest/v1/cash_movements?select=id&limit=1` | `200`, `[]` | existe |
| `loyalty_tier_thresholds` (controle — tabela de 012, não afetada pela 020) | `GET /rest/v1/loyalty_tier_thresholds?select=id&limit=1` | `200`, `[]` | existe (esperado) |
| `open_cash_register` | `POST /rest/v1/rpc/open_cash_register` | `401 42501` | existe |
| `close_cash_register` | `POST /rest/v1/rpc/close_cash_register` | `401 42501` | existe |
| `create_cash_movement` | `POST /rest/v1/rpc/create_cash_movement` | `401 42501` | existe |
| `redeem_loyalty_points` (controle — RPC de 012, já validada em fases anteriores) | `POST /rest/v1/rpc/redeem_loyalty_points` | `401 42501` | existe (esperado) |
| `confirm_subscription_payment` | `POST /rest/v1/rpc/confirm_subscription_payment` | `401 42501` | **existe** |
| `create_company_with_owner` | `POST /rest/v1/rpc/create_company_with_owner` | `401 42501` | existe (versão não determinada) |

---

## 6. Verificação específica da migration 019

- **Objeto identificado no arquivo local:** função `public.confirm_subscription_payment(p_payment_id uuid, p_provider_status subscription_payment_status, p_end_to_end_id text, p_event_id text, p_event_type text, p_event_payload jsonb) RETURNS TABLE(ok boolean, new_status subscription_payment_status, already_processed boolean, not_found boolean)`, `SECURITY DEFINER`, com `FOR UPDATE` na linha do pagamento logo no início.
- **Permissões esperadas pelo arquivo local:** `REVOKE ALL ... FROM public, anon, authenticated; GRANT EXECUTE ... TO service_role` — ou seja, o próprio arquivo já prevê que uma chamada com a chave `anon` deve ser rejeitada por permissão, nunca por "função não encontrada".
- **Resultado da chamada real:** `HTTP 401`, `{"code":"42501","message":"permission denied for function confirm_subscription_payment"}` — **exatamente o padrão esperado se, e somente se, a função existir com essas permissões**.
- **Por que essa chamada é segura e não escreveu nada:** o Postgres verifica o privilégio `EXECUTE` no nível da ACL da função **antes** de o corpo da função começar a rodar — é uma garantia do próprio mecanismo de permissões do banco, não uma checagem escrita dentro da função. Como a resposta foi "permissão negada", a função nunca chegou a ser executada; mesmo o UUID de pagamento enviado (`00000000-0000-0000-0000-000000000000`, inexistente de propósito) nunca foi de fato consultado.
- **Conclusão:** o objeto introduzido pela migration 019 **existe no banco remoto**. Como esse é o único ponto do projeto inteiro que corrige a corrida mais grave já documentada (dobra do período de assinatura em confirmações concorrentes), esta é a confirmação mais importante desta verificação.
- **O que ainda não foi confirmado:** que o *webhook* (`src/app/api/webhooks/evopay/route.ts`) e a Server Action `confirmPaymentFromProvider` realmente chamam esta função em produção neste exato momento — isso já foi verificado por leitura de código na Fase 5A (o código atual do repositório chama `confirm_subscription_payment` diretamente, sem fallback para uma lógica antiga) e não foi re-verificado aqui.

---

## 7. Verificação da migration 021 (Caixa)

Conforme pedido, limitada a confirmar:

- ✅ `cash_registers` existe (tabela real, RLS ativa — retornou lista vazia, não erro).
- ✅ `cash_movements` existe (idem).
- ✅ RPCs principais existem: `open_cash_register`, `close_cash_register`, `create_cash_movement` — todas as três retornaram `401 42501` (existe, sem permissão para `anon`), exatamente como o próprio arquivo da migration 021 especifica (`GRANT EXECUTE ... TO authenticated`, nunca a `anon`).
- Não foi verificado neste bloco (fora do pedido da Seção 7, e já coberto exaustivamente nas Fases 4/4.1 com sessões autenticadas reais): o trigger `sale_payments_create_cash_movement`, os dois índices únicos parciais, e o comportamento de concorrência — tudo isso já tinha sido validado empiricamente com usuários reais nas fases anteriores desta sessão.

---

## 8. Divergências encontradas

**Nenhuma divergência foi encontrada entre o que foi possível testar e o que se esperava** — todos os objetos testáveis (021 completa, 019, e a existência de 017/create_company_with_owner) retornaram exatamente o padrão previsto pelo próprio código-fonte das migrations.

A divergência real encontrada nesta execução é de **método, não de dado**: o ticket pedia uma comparação direta LOCAL × REMOTO via `supabase migration list` contra a tabela de controle `supabase_migrations.schema_migrations` — isso **não pôde ser produzido**, porque:
1. não há Supabase CLI vinculado a um projeto nesta máquina/sessão;
2. não há token de acesso do Supabase disponível;
3. não há conexão direta ao Postgres disponível;
4. a conexão MCP do Supabase, disponível em fases anteriores desta mesma sessão, está desconectada agora.

Isso não significa que as migrations estejam desincronizadas — significa que a comparação formal "linha por linha do histórico de migrations" não pôde ser feita com o ferramental disponível agora. A evidência indireta obtida (Seções 4 a 7) é forte para 019 e 021, mas **não substitui** a comparação formal para 017 (versão específica), 018 e 020.

---

## 9. Impacto

- **019 (mais crítica):** risco antes classificado como 🔴 ALTO no relatório da Fase 5A foi **reduzido** — há evidência direta de que o objeto existe no banco remoto, hoje. O risco residual que permanece é apenas teórico (não foi re-testada a integração completa webhook→função neste bloco, só a existência do objeto).
- **021:** nenhum novo risco — Caixa já estava aprovado e agora tem confirmação adicional independente da camada de código.
- **018 e 020:** o risco permanece **exatamente como estava** no relatório da Fase 5A — nem confirmado, nem refutado. Não há piora nem melhora de confiança para essas duas.
- **017:** confirmação parcial — o ponto de entrada (`create_company_with_owner`) existe e está protegido, mas não há evidência de qual das 4 revisões está ativa. O risco da migration 017 especificamente (corrida de "duas empresas para o mesmo usuário" sem advisory lock) **permanece não determinado**.

---

## 10. Recomendação

Para fechar definitivamente as três lacunas (017 — versão específica, 018, 020), qualquer uma destas opções resolve, em ordem de preferência:

1. **Reconectar a ferramenta MCP do Supabase** desta sessão (a mesma usada nas Fases 1–4) — permite `execute_sql` direto contra `pg_proc`/`pg_trigger`/`pg_constraint`, resolvendo tudo em poucos minutos, sem nenhum risco.
2. **Fornecer um `SUPABASE_ACCESS_TOKEN`** (token pessoal de acesso, gerado em https://supabase.com/dashboard/account/tokens) — permitiria `npx supabase link --project-ref fpbcruinppjbwtinzrdg` seguido de `supabase migration list --linked`, exatamente como o ticket original pedia.
3. **Fornecer a connection string direta do Postgres** (com senha) do projeto — permitiria consultar `supabase_migrations.schema_migrations` e `pg_proc`/`pg_trigger`/`pg_constraint` diretamente.
4. **O usuário rodar `supabase migration list --linked` em uma máquina/sessão onde o CLI já esteja logado e vinculado** ao projeto `fpbcruinppjbwtinzrdg`, e colar a saída de volta — não exige nenhuma credencial nova ser compartilhada com esta sessão.

Até uma dessas opções ser viabilizada, o estado de 018 e 020 permanece **NÃO DETERMINADO**, e o de 017 permanece **PARCIALMENTE DETERMINADO** (objeto existe, versão específica desconhecida).

---

## Nota fora de escopo (não investigada, não alterada)

Durante a chamada de controle positivo (`get_public_plans`), a resposta real do banco incluiu um plano chamado `TEST_R1` ("Teste financeiro (R$1)"), com a própria descrição dizendo "Plano temporário só para validar o fluxo real de pagamento Pix — não é um plano comercial. Remover após o teste." Este plano está **hoje publicamente visível** para qualquer visitante da página de preços (a função é exposta a `anon`). Isso é apenas um registro de observação incidental desta verificação — **nada foi alterado**; fica para avaliação e decisão do usuário se e quando remover essa linha de teste de `public.plans`, fora do escopo desta Fase 5A.1.

---

## Checklist final

- Arquivos de código alterados: **0**
- Migrations criadas: **0**
- Migrations modificadas: **0**
- Migrations aplicadas: **0**
- Migration repair: **0**
- `db push`: **0**
- `db pull`: **0**
- Banco alterado: **0**
- Commit: **0**
- Push: **0**
- Deploy: **0**

---

**FASE 5A.1 CONCLUÍDA — VERIFICAÇÃO SOMENTE LEITURA. NENHUMA ALTERAÇÃO REALIZADA.**
