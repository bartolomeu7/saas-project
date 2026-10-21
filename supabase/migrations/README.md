# supabase/migrations

Migrations SQL versionadas do banco de dados Prime Ges — única forma permitida
de alterar o schema (nunca diretamente pelo dashboard do Supabase). Visão geral
dos módulos: `docs/architecture.md`.

> **Estado desta documentação:** reconciliação GitHub × Supabase feita em
> 2026-09-24 (PR #26) para os arquivos `001`–`040`; atualizada na **Fase 3**
> (2026-10-18, somente repositório) para os arquivos posteriores à `040` (seções 3-B,
> 3-C, 3-D e 8). O que está afirmado abaixo como "idêntico" foi comprovado comparando o
> texto de cada arquivo com `supabase_migrations.schema_migrations` (sem
> comentários/espaços, ou byte a byte onde indicado). O que não foi comprovado está
> marcado **NÃO CONFIRMADO** / **NOT VERIFIED** ou listado em "Divergências conhecidas".
>
> **Esta documentação NÃO afirma que GitHub e Supabase Production estão sincronizados.**
> A Fase 3 não acessou nenhum banco; os estados de Production citados abaixo vêm de
> auditorias anteriores (datadas) e **não foram reconsultados**. A presença de um arquivo
> neste diretório **não prova** que ele foi aplicado em Production.

## 1. Como o projeto identifica migrations

- Os **arquivos** aqui foram numerados (`001_…` a `040_…`), em ordem de aplicação
  lógica; existem 3 arquivos com prefixo de timestamp (`2026092311xxxx_…`) que
  correspondem a migrations aplicadas como hardening da Fase 2. **A partir de
  `20260925210500_041_…` todos os arquivos usam prefixo de timestamp**
  (`AAAAMMDDHHMMSS_nome.sql`; as séries `2026100…`/`2026101…` usam prefixos "lógicos"
  que **não** são o `version` registrado no banco).
- O **histórico live** (`supabase_migrations.schema_migrations`) usa **timestamps**
  como `version` (ex.: `20260922001123`) e o nome lógico como `name`. Para
  migrations 022+ o `name` repete o prefixo do arquivo
  (`024_phase2_purchase_receiving_payables`); para 001–021 o `name` não tem número.
- **Não existe `supabase/config.toml` neste repositório**: o CLI do Supabase não
  está configurado aqui. As migrations foram aplicadas via MCP/`apply_migration`,
  que gera o timestamp no momento da aplicação. **Por isso arquivo e histórico
  não têm a mesma chave** — a relação é feita pelo nome (tabelas das seções 3 e 3-B).
  **Nome lógico do arquivo ≠ `version` do histórico**: o `version` só é conhecido
  depois da aplicação e **nunca deve ser "corrigido" para coincidir com o arquivo**.

## 2. O que NÃO fazer

- **Não rodar `supabase db push`** contra o banco existente. O CLI casa migrations
  pela `version` (prefixo numérico do arquivo); aqui `022` (arquivo) ≠
  `20260921235749` (histórico), então ele trataria **todos** os arquivos como não
  aplicados e tentaria reexecutá-los (a maioria usa `create type/table` sem
  `if not exists` e falharia; algumas, como `create or replace`, sobrescreveriam
  objetos). *Análise estática; não testado.*
- **Não rodar `supabase migration repair`** só para "alinhar números". Isso
  reescreve o histórico do banco para parecer igual ao GitHub sem que nada tenha
  sido aplicado.
- **Não reaplicar nenhum arquivo já aplicado.** Todos os arquivos 001–040 (exceto
  o 004, que nunca foi aplicado e está em `supabase/superseded/`) já estão
  aplicados no banco live.
- **Não recriar as migrations `debug_*` nem "copiar" o histórico 1:1** (seção 5).
- **Não editar uma migration já aplicada** para "corrigi-la": crie uma migration
  nova (foi assim com a 040). Isso vale também para os cabeçalhos: `20261014000000` e
  `20261014000100` dizem "Aplicada SOMENTE em TEST", mas o texto desses arquivos é
  byte a byte o que consta registrado no histórico live (seção 3-B); o cabeçalho
  ficou desatualizado e **não deve ser editado** (a edição quebraria a igualdade).
- **Não aplicar `20261014000300`** (substituída/incompleta; seção 3-C). A `20261014000200` **já foi aplicada**
  em Production em 2026-10-21 (versão `20261021015349`; seção 3-C): **não reaplicar**.
- **Não "reproduzir" o histórico aplicando todos os arquivos em ordem em um banco
  que importa** (ex.: reconstrução de ambiente) sem decidir antes o destino de
  `000200`/`000300`/candidatas. Reprodutibilidade em banco novo **não foi testada**.

## 3. Mapa arquivo ↔ histórico live

Legenda: **IDÊNTICO** = texto igual ao aplicado (ignorando comentários e espaços);
**EQUIVALENTE** = mesmo resultado no schema (objetos e corpos de função conferidos),
texto não byte-idêntico; **CONSOLIDADA** = correções posteriores embutidas no arquivo.

| Arquivo | Histórico live (`name` / `version`) | Situação |
|---|---|---|
| `001_create_profiles` | `create_profiles` / 20260821000018 | IDÊNTICO |
| `002_create_companies_customers` | `create_companies_customers` / 20260821000041 | EQUIVALENTE (difere só no texto de `comment on`; verificado) |
| `003_harden_function_security` | `harden_function_security` / 20260821000144 | IDÊNTICO |
| `004_billing_foundation` | — (**nunca aplicada**) | SUBSTITUÍDA pela 009 — movida para `supabase/superseded/` |
| `005_customer_engagement` | `customer_engagement` / 20260822224923 | IDÊNTICO |
| `006_products` | `products` / 20260823001837 | IDÊNTICO |
| `007_services` | `services` / 20260823005613 | IDÊNTICO |
| `008_sales` | `sales` / 20260823020609 | EQUIVALENTE (corpo de `recompute_sale_payment_status` diferente do aplicado, mas substituído pela 018; corpo final = live) |
| `009_billing_subscriptions` | `billing_subscriptions` / 20260824220611 | EQUIVALENTE (o texto aplicado também cria a view `plans_public`, que **não existe** no banco atual; este arquivo já não a cria. NÃO CONFIRMADO qual alteração a removeu do live) |
| `010_customer_expansion` | `customer_expansion` / 20260830113814 | IDÊNTICO |
| `011_customer_documents` | `customer_documents` / 20260830164204 | IDÊNTICO |
| `012_loyalty_foundation` | `loyalty_foundation` / 20260831004833 **+** `loyalty_foundation_execute_grants_fix` / 20260831004940 **+** `…_fix_v2` / 20260831005033 | CONSOLIDADA (a função `grant_loyalty_points_for_sale` neste arquivo já é a versão pós-correções; os 2 `revoke … from public` foram acrescentados na reconciliação) |
| `013_undo_loyalty_redemption` | `undo_loyalty_redemption_for_draft_sale` / 20260901030901 **+** `undo_loyalty_redemption_revoke_public` / 20260901031023 | CONSOLIDADA (mesmo tamanho normalizado, 2733; corpo da função idêntico) |
| `014_loyalty_sales_discount_fix` | `loyalty_sales_discount_fix` / 20260901213436 | IDÊNTICO |
| `015_loyalty_redeem_cumulative_percent_cap` | `loyalty_redeem_cumulative_percent_cap` / 20260903025426 | IDÊNTICO |
| `016_prevent_duplicate_company_onboarding` | `prevent_duplicate_company_onboarding` / 20260903030705 | IDÊNTICO |
| `017_onboarding_advisory_lock` | `onboarding_advisory_lock` / 20260903154233 | IDÊNTICO |
| `018_fix_sale_payment_status_staleness` | `fix_sale_payment_status_staleness` / 20260903154236 | EQUIVALENTE (difere só no texto de `comment on`; verificado) |
| `019_atomic_payment_confirmation` | `atomic_payment_confirmation` / 20260903154305 | EQUIVALENTE (difere só no texto de `comment on`; verificado) |
| `020_loyalty_tier_min_points_unique` | `loyalty_tier_min_points_unique` / 20260903154309 | IDÊNTICO |
| `021_cash_register_foundation` | `cash_register_foundation` / 20260903215213 | EQUIVALENTE (difere só no texto de `comment on`; verificado) |
| `022_phase1_inventory_suppliers_purchase_foundation` | `022_phase1_…` / 20260921235749 | EQUIVALENTE (acrescentados os índices `stock_movements_company_source_idx` e `suppliers_name_idx`, que existem no live) |
| `023_fix_phase1_stock_movement_idempotency` | `023_fix_phase1_…` / 20260921235912 | IDÊNTICO |
| `024_phase2_purchase_receiving_payables` | `024_phase2_…` / 20260922001123 | **IDÊNTICO** (reconstruída a partir do SQL aplicado) |
| `025_harden_phase2_receipts` | `025_harden_phase2_receipts` / 20260922001144 | **IDÊNTICO** (reconstruída) |
| `026_phase2_purchase_order_hardening` | `026_phase2_…` / 20260922001218 | **IDÊNTICO** (reconstruída) |
| `027_phase3_finance_foundation` | `027_phase3_…` / 20260922003546 | EQUIVALENTE (corpos de função = live; demais diferenças textuais na seção 6) |
| `028_phase3_finance_hardening` | `028_phase3_…` / 20260922003818 | IDÊNTICO |
| `029_phase3_finance_security_hardening` | `029_phase3_…` / 20260922003838 | EQUIVALENTE (o texto aplicado tem 3–4 `revoke … from public, authenticated, anon` a mais em funções internas; a ACL final é idêntica ao live) |
| `030_phase4_agenda_team` | `030_phase4_agenda_team` / 20260922005431 | EQUIVALENTE (corpos de função = live, exceto os 2 profissionais corrigidos pela 040; diferenças na seção 6) |
| `031_phase4_security_hardening` | `031_…` / 20260922010256 | IDÊNTICO |
| `032_phase4_reschedule_hardening` | `032_…` / 20260922010502 | IDÊNTICO |
| `033_phase6_admin_governance` | `033_…` / 20260923110737 | **IDÊNTICO** (reconstruída) |
| `034`–`038` | `034_…` … `038_…` / 20260923110801 … 20260923114113 | IDÊNTICO |
| `20260923115135_phase2_rpc_rbac_governance_hardening` | `phase2_rpc_rbac_governance_hardening` | IDÊNTICO (mesma versão) |
| `20260923115406_phase2_rls_initplan_hardening` | `phase2_rls_initplan_hardening` | IDÊNTICO (mesma versão) |
| `20260923115529_phase2_loyalty_rbac_hardening` | `phase2_loyalty_rbac_hardening` | IDÊNTICO (mesma versão) |
| `039_phase_b_integrity_hardening` | `phase_b_integrity_hardening` / 20260923121542 | IDÊNTICO — **mesma alteração**; no banco rodou **depois** dos 3 hardenings acima (ver seção 7) |
| `040_fix_professional_schedule_functions` | `040_fix_professional_schedule_functions` / 20260924230224 | IDÊNTICO (aplicada nesta reconciliação) |

### Reconferência por conteúdo dos arquivos `001`–`040` (2026-10-18)

A mesma consulta somente leitura (bruto + normalizado) foi aplicada aos arquivos `001`–`040` e **não contradiz**
o mapa acima: `010`, `011`, `031` e `038` são **idênticos byte a byte**; `001`, `003`, `005`–`007`, `014`–`017`, `020`,
`023`–`026`, `028`, `032`–`037`, `039`, `040` e os 3 hardenings com timestamp são **iguais sem comentários/espaços**;
`002`, `008`, `009`, `012`, `018`, `019`, `021`, `022`, `027`, `029` e `030` têm **diferença textual real** (a equivalência de schema
documentada na seção 6 foi feita em 2026-09-24 e **não** foi refeita agora); `013` é consolidada de duas entradas e o
hash normalizado da concatenação **não** coincide com o do arquivo (**NOT VERIFIED**).
Nas linhas desta seção 3, "IDÊNTICO" significa igual **sem comentários/espaços**, salvo onde indicado "byte a byte".

## 3-B. Arquivos posteriores à `040` ↔ histórico live (Fase 3, 2026-10-18)

**Fonte da evidência:** consulta **somente leitura** ao `supabase_migrations.schema_migrations` de Production
(versão, nome, md5 bruto e md5 normalizado dos statements; sem alterar nada), feita em 2026-10-18 no
levantamento de preparação, comparada com o conteúdo dos arquivos em `origin/main` (`6639727`). Resultado
completo (70 arquivos × 78 entradas): 12 `MATCH_EXACT`, 44 `MATCH_SEMANTIC`, 11 com diferença textual
conhecida, 1 consolidada (`013`), 2 sem entrada em Production (`000200`, `000300`) e 11 entradas do histórico
sem arquivo individual (seção 5). Critérios:
- **IDÊNTICO byte a byte** (`MATCH_EXACT`): o md5 e o tamanho do arquivo no Git coincidem com os do statement registrado.
- **EQUIVALENTE no texto** (`MATCH_SEMANTIC`): idêntico **depois de remover comentários `--` e espaços**; o arquivo
  tem mais comentários/cabeçalho que o registrado. Não prova, sozinho, que os objetos atuais ainda correspondem ao
  arquivo (migrations posteriores podem tê-los alterado).

| Arquivo | Histórico live (`name` / `version`) | Situação |
|---|---|---|
| `20260925210500_041_fix_audit_findings` | `041_fix_audit_findings` / 20260925221456 | IDÊNTICO byte a byte (`MATCH_EXACT`) |
| `20261006000000_clerk_a_to_e_identity_bridge` | `clerk_a_to_e_identity_bridge` / 20261007102917 | EQUIVALENTE no texto (`MATCH_SEMANTIC`) |
| `20261006000001_clerk_f_rpc_cutover` | `clerk_f_rpc_cutover` / 20261007102932 | EQUIVALENTE no texto (`MATCH_SEMANTIC`) |
| `20261006000003_fix_create_financial_entry_cash_direction_cast` | `fix_create_financial_entry_cash_direction_cast` / 20261007102944 | EQUIVALENTE no texto (`MATCH_SEMANTIC`) |
| `20261006000002_clerk_h_drop_legacy_auth_trigger` | `clerk_h_drop_legacy_auth_trigger` / 20261007102945 | EQUIVALENTE no texto (`MATCH_SEMANTIC`) |
| `20261006000004_add_missing_fk_indexes` | `add_missing_fk_indexes` / 20261007103002 | EQUIVALENTE no texto (`MATCH_SEMANTIC`) |
| `20261007230000_platform_admin_foundation` | `platform_admin_foundation` / 20261008020113 | EQUIVALENTE no texto (`MATCH_SEMANTIC`) |
| `20261008000000_admin_rbac_hierarchy` | `admin_rbac_hierarchy` / 20261008020148 | EQUIVALENTE no texto (`MATCH_SEMANTIC`) |
| `20261008010000_profile_status_enforcement` | `profile_status_enforcement` / 20261008020211 | EQUIVALENTE no texto (`MATCH_SEMANTIC`) |
| `20261009000000_admin_platform_core` | `admin_platform_core` / 20261008185829 | EQUIVALENTE no texto (`MATCH_SEMANTIC`) |
| `20261009010000_admin_users_companies` | `admin_users_companies` / 20261008185959 | EQUIVALENTE no texto (`MATCH_SEMANTIC`) |
| `20261009020000_admin_billing_ops` | `admin_billing_ops` / 20261008190155 | EQUIVALENTE no texto (`MATCH_SEMANTIC`) |
| `20261009030000_admin_insights_tools` | `admin_insights_tools` / 20261008190322 | EQUIVALENTE no texto (`MATCH_SEMANTIC`) |
| `20261009040000_admin_webhook_retention` | `admin_webhook_retention` / 20261008200453 | EQUIVALENTE no texto (`MATCH_SEMANTIC`) |
| `20261009050000_admin_hardening` | `admin_hardening` / 20261008201908 | EQUIVALENTE no texto (`MATCH_SEMANTIC`) |
| `20261009060000_admin_lists_dynamic_filters` | `admin_lists_dynamic_filters` / 20261008202053 | EQUIVALENTE no texto (`MATCH_SEMANTIC`) |
| `20261009070000_admin_presence_min_online` | `admin_presence_min_online` / 20261008202236 | EQUIVALENTE no texto (`MATCH_SEMANTIC`) |
| `20261010000000_legal_consent` | `legal_consent` / 20261008202323 | EQUIVALENTE no texto (`MATCH_SEMANTIC`) |
| `20261010000100_legal_rc2` | `legal_rc2` / 20261008202401 | EQUIVALENTE no texto (`MATCH_SEMANTIC`) |
| `20261011000000_billing_hardening` | `billing_hardening` / 20261015233626 | IDÊNTICO byte a byte (`MATCH_EXACT`) |
| `20261011000100_privilege_minimization` | `privilege_minimization` / 20261015233718 | IDÊNTICO byte a byte (`MATCH_EXACT`) |
| `20261012000000_lifetime_access_and_license_ops` | `lifetime_access_and_license_ops` / 20261015234035 | IDÊNTICO byte a byte (`MATCH_EXACT`) |
| `20261012000100_plans_lifetime_awareness` | `plans_lifetime_awareness` / 20261015234134 | IDÊNTICO byte a byte (`MATCH_EXACT`) |
| `20261012000200_admin_company_members_and_reconciliation` | `admin_company_members_and_reconciliation` / 20261015234234 | IDÊNTICO byte a byte (`MATCH_EXACT`) |
| `20261014000000_plans_management_and_usage_limits` | `plans_management_and_usage_limits` / **20261016213958** | IDÊNTICO byte a byte (mapeamento exato confirmado nas Fases 1–2 e conferido por md5/tamanho: 60071) |
| `20261014000100_session_gate_and_trial_hardening` | `session_gate_and_trial_hardening` / **20261016214156** | IDÊNTICO byte a byte (mapeamento exato confirmado nas Fases 1–2 e conferido por md5/tamanho: 15801) |
| `20261014000200_trial_requires_authorization` | `trial_requires_authorization` / **20261021015349** | IDÊNTICO byte a byte (`MATCH_EXACT`; md5 `5d9e0897…`, 2481 caracteres) — **aplicada em Production em 2026-10-21**, ver 3-C |
| `20261014000300_data_layer_access_gate` | — (**não consta** no histórico analisado) | **SUBSTITUÍDA / INCOMPLETA, não recomendada** — ver 3-C |

Observações:
- As 11 entradas do histórico sem arquivo individual são as da seção 5 (consolidadas ou temporárias);
  nada nesta tabela autoriza "recriar" ou renomear entradas do histórico.
- `version` ≠ prefixo do arquivo em todas as linhas acima (a diferença é esperada; seção 1).
- Esta tabela é um mapa de **evidências datadas**, não um atestado de estado atual do banco.

## 3-C. Arquivos presentes no GitHub sem aplicação confirmada em Production

> A presença de um arquivo neste diretório **não prova** que ele foi aplicado em Production. Estado em
> 2026-10-21: `20261014000200` **aplicada** (versão `20261021015349`); `20261014000300` **não** aplicada e
> **não deve ser**.

### `20261014000200_trial_requires_authorization.sql` — **APLICADA em Production (2026-10-21)**

Faz `create or replace` de `create_company_with_owner()` para que o teste grátis só seja concedido via
`grant_free_trial_internal()` (que exige autorização válida do servidor). Aplicada em Production, com autorização
explícita do dono, via `apply_migration` com o texto exato do arquivo em `main` (`8906656`), depois de cumpridos os
pré-requisitos que a mantinham bloqueada:
- **Código implantado:** o deployment ativo de Production (`8906656`, 2026-10-18 21:30Z, registrado na API de
  deployments do GitHub) contém `authorizeTrialSignup(user.id)` em `createCompanyAction` antes de
  `create_company_with_owner` (`src/lib/companies/actions.ts`).
- **Segredo antifraude:** em 2026-10-21 `/admin/settings` de Production mostrou "Segredo dedicado configurado."
  (o valor nunca foi lido). O segredo ficou válido depois de ser recriado e de um novo deploy; antes disso a página
  mostrava "curto ou fraco".
- **Pré-voo (somente leitura):** histórico com 78 entradas; corpo de `create_company_with_owner` igual ao do
  `.down.sql` da `000200`; as 5 dependências (`grant_free_trial_internal`, `authorize_trial_signup`,
  `has_trial_authorization`, `claim_free_trial`, `current_profile_user_id`) presentes; nenhum objeto do gate.

**Pós-checagem (somente leitura, VERIFIED):** histórico com 79 entradas, a nova é
`20261021015349 / trial_requires_authorization`, com md5 e tamanho **iguais** aos do arquivo; corpo normalizado da
função igual ao esperado da `000200`; dono (`SECURITY DEFINER`), `search_path` e permissões de `EXECUTE` de
`create_company_with_owner` inalterados; a impressão digital oficial do catálogo (`tests/sql/catalog-fingerprint.sql`)
mudou **somente** em `fn_body` (acl, column, constraint, fn_cfg, index, policy, rel e trigger idênticos); dados
intactos (1 empresa, 1 assinatura).

**Ainda NOT VERIFIED:** o fluxo real de cadastro em Production (conta nova → empresa criada → teste concedido). O
esperado é: uma linha em `trial_signup_events` (hash de 64 hex ou `ip_unknown`), a empresa nasce `trialing` e uma
chamada direta a `rpc/create_company_with_owner` (sem autorização do servidor) cria a empresa **sem** teste. Esse
teste exige criar uma conta e deve ser feito pelo dono.

**Efeito:** o teste grátis passa a exigir a autorização do servidor; se o segredo ficar ausente/fraco, o cadastro
continua funcionando mas **sem** teste (falha segura).
**Rollback:** `supabase/rollback/20261014000200_trial_requires_authorization.down.sql` (devolve o corpo anterior,
em que todo cadastro novo recebe o teste, sem antifraude). O cabeçalho do arquivo diz "Aplicada SOMENTE em TEST";
está desatualizado e **não deve ser editado** (a edição quebraria a igualdade com o histórico).

### `20261014000300_data_layer_access_gate.sql` — **SUBSTITUÍDA / INCOMPLETA, NÃO RECOMENDADA**

Análise estática (nada executado; arquivo **mantido sem alteração** como registro histórico):
- **Mecanismo:** função `company_has_active_access(uuid)` + **40 políticas RLS `RESTRICTIVE`**
  (`*_require_access_ins|upd|del`) em **18 tabelas**, apenas nos comandos que já tinham política de escrita
  permissiva. `SELECT` não é alterado.
- **Não cobertas:** 23 das 41 tabelas com `company_id` (varredura estática do repositório) mais as 2 filhas de
  profissional — `accounts_payable`, `appointments`, `cash_movements`, `cash_registers`, `financial_entries`,
  `loyalty_accounts`, `loyalty_transactions`, `professional_blocks`, `professional_profiles`, `purchase_*` (4),
  `sale_payments`, `stock_movements`, `supplier_products`, `professional_availability`, `professional_services`
  e as tabelas comerciais/administrativas. Em várias delas a escrita ocorre só por RPC.
- **Caminhos por RPC:** políticas RLS **não** se aplicam a funções `SECURITY DEFINER` executadas pelo dono
  (o repositório não usa `FORCE ROW LEVEL SECURITY` — `git grep` sem ocorrências; **INFERRED** pela semântica
  do PostgreSQL), então vendas, estoque, caixa, agenda, financeiro etc. por RPC **não** passam pelo bloqueio.
  Só a escrita **direta** pela API nas 18 tabelas é barrada.
- **Privilégios/ACL:** não altera ACL de tabelas; `company_has_active_access` fica com `EXECUTE` para
  `authenticated` e `service_role`, o que permite a qualquer usuário autenticado consultar, por UUID, se
  **outra** empresa tem acesso ativo (vazamento de 1 bit).
- **Compatibilidade com o código:** nenhuma referência em `src/`; a suíte `tests/sql/mission09.sql` foi escrita
  para ela (valida "18 tabelas / 40 políticas" e usa `company_has_active_access`), logo **depende** desta
  migration e ficaria inconsistente se ela não for aplicada (a revisão dessa suíte é parte da candidata do Gate Integral, ainda não versionada).
- **Rollback (`supabase/rollback/20261014000300_data_layer_access_gate.down.sql`):** remove **toda** política
  cujo nome contenha `_require_access_` (padrão `LIKE`, mais amplo que as 40 criadas) e a função; coerente com o
  que a migration cria, mas sem conferência de que só as 40 foram removidas.
- **Desempenho:** a função é avaliada por linha dentro das políticas, sem o padrão `(select …)`.
- **Mensagem ao usuário:** o erro seria "violação de política de segurança em nível de linha" — não há
  tratamento de erro comercial claro no aplicativo.

Conclusão: não é suficiente para o "Gate Integral". Substituída, como desenho, pela candidata do Gate Integral
(seção 3-D), ainda não versionada neste repositório. **Não aplicar. Não remover.**

## 3-D. Gate Integral — candidata pendente (NÃO APLICADA, NÃO VERSIONADA)

Existe uma **candidata** de migration (`20261014000400_commercial_write_gate`, com rollback e bateria de testes),
preparada na Fase 3 e **ainda não incluída neste repositório** (será proposta em PR próprio, para revisão). Ela
**não** está em `supabase/migrations/` e **não** tem registro no histórico live (verificado em 2026-10-18: nenhuma
função/gatilho do gate em Production). O identificador `20261014000400` está **reservado** para ela (não existe em
nenhuma ref do repositório em 2026-10-18). Pendências antes de qualquer aplicação: revisão humana do SQL; tratamento
de `COMMERCIAL_ACCESS_REQUIRED` e fluxo de regularização no aplicativo (hoje inexistente — **BLOCKED**, PR separado;
o middleware também bloqueia leitura/exportação de empresas sem acesso); decisão sobre as empresas que ficariam
sem gravação (em 2026-10-18 a única empresa de Production estava com a assinatura de teste vencida); validação de
compatibilidade com Production por execução (**NOT VERIFIED**); procedimento de aplicação aprovado.

## 4. Migration 004 — substituída pela 009 / nunca aplicada

`004_billing_foundation.sql` foi um rascunho local do billing que **nunca foi
aplicado**. A `009_billing_subscriptions.sql` a substitui (o cabeçalho da 009 diz
isso) com outro desenho: sem `billing_customers`, `subscription_status` com 5
valores (a 004 tinha 8), `subscription_payments` refeita para a EvoPay, etc.
Executar a 004 antes da 009 em um banco novo criaria enums e tabelas com o
desenho errado, e a 009 (`create … if not exists`) não os corrigiria.

Tratamento: o arquivo foi **movido sem alteração** (`git mv`) para
`supabase/superseded/004_billing_foundation.sql`, fora desta pasta, mantendo o
histórico Git. O histórico do banco **não** foi alterado e **nenhuma migration
falsa** foi criada para ocupar o número 004.

## 5. Migrations temporárias/debug e correções de fidelidade sem arquivo próprio

O histórico live contém migrations que **não têm arquivo próprio de propósito**:

| `name` live | O que fez | Tratamento |
|---|---|---|
| `loyalty_foundation_execute_grants_fix`, `…_v2` | Revogaram `EXECUTE` de PUBLIC e de `anon` em `redeem_loyalty_points` / `adjust_loyalty_points` | Efeito de ACL **incorporado** ao `012` |
| `loyalty_fix_birthday_bonus_dedup`, `loyalty_fix_redeem_subtotal_recalc`, `loyalty_fix_reverse_composite_null_check` | Correções de corpo de função (bônus de aniversário, subtotal no resgate, reversão) | Corpo final já está nos arquivos `012`/`014`/`015`; corpos das funções conferidos com o live |
| `undo_loyalty_redemption_for_draft_sale`, `undo_loyalty_redemption_revoke_public` | Criação da função e ACL | Consolidadas no `013` |
| `debug_reverse_loyalty_temp`, `…temp2`, `…temp3`, `…temp4` | **Temporárias.** Cada uma substituiu `reverse_loyalty_points_for_sale` por uma versão de depuração que sempre executa `RAISE EXCEPTION 'DEBUG…'`. Foram aplicadas no live (2026-08-31) e **sobrescritas** pela `loyalty_fix_reverse_composite_null_check` (20260831011047) | **Não recriar.** O corpo ativo no banco é o final correto. Registradas aqui só como histórico |

Não há objeto de depuração remanescente no banco (nenhuma função com corpo
`DEBUG`; conferido por leitura do catálogo).

## 6. Divergências conhecidas

- **`027` e `030` — funções sincronizadas com o live:** os corpos de
  `create_cost_center` e `create_financial_category` (`027`) e de
  `create_appointment`, `list_company_team`, `seed_professional_profile_from_member`
  e `set_appointment_status` (`030`) foram alinhados ao `prosrc` do banco (o banco
  não foi alterado). Corpos idênticos ao live (comparação normalizada sem
  comentários/espaços).
- **Diferenças remanescentes em `027`/`030` (conhecidas e explicadas):**
  - `027`: o texto aplicado envolve `alter type accounts_payable_status add value
    if not exists 'partial'` num bloco `DO … exception when duplicate_object`;
    o arquivo usa o `alter type … if not exists` direto (mesmo efeito). Há
    também outras diferenças de texto não localizadas em detalhe (o arquivo é
    maior que o aplicado); o estado final de objetos, funções e ACLs confere.
  - `030`: (a) `set_professional_availability` no arquivo usa o nome correto
    `p_professional_id`, enquanto o SQL aplicado tinha o defeito abaixo;
    (b) um `revoke` de `list_company_team` no arquivo é `from public, anon` e no
    aplicado é `from public` (a ACL final é a mesma).
- **Bug corrigido pela 040:** `set_professional_availability` (só no banco) e
  `set_professional_services` (no banco **e** no arquivo `030`) usavam a variável
  não declarada `v_professional_id`. A 040 os corrige no banco. O arquivo `030`
  **continua** com `v_professional_id` em `set_professional_services`, porque
  registra o que foi aplicado; a 040, posterior, prevalece. A 040 foi validada
  por execução com dados sintéticos revertidos (rollback) em 2026-09-25.
- Textos de `comment on` em `002`, `018`, `019`, `021` divergem do aplicado
  (verificado: a primeira diferença de cada arquivo está dentro da prosa de um
  `comment on`); nenhuma diferença de schema foi encontrada nesses arquivos.
- `008`, `009`, `012` e `029` diferem do texto aplicado em trechos já
  substituídos por migrations posteriores (corpo de função) ou ausentes do live
  (view `plans_public`); o estado final de funções, objetos e ACLs foi conferido
  com o banco na reconciliação de 2026-09-24, mas o texto histórico
  exato desses 4 arquivos **não** é o aplicado.

## 7. Ordem e reprodutibilidade

- Ordem lógica: `001 … 040`. No banco live, os 3 hardenings com timestamp
  (`…115135`, `…115406`, `…115529`) foram aplicados **antes** do
  `phase_b_integrity_hardening` (arquivo `039`). Por ordenação numérica, o `039`
  vem antes dos 3 arquivos com timestamp; isso **não altera o resultado** (o 039
  só redefine `adjust_product_stock`, `cancel_purchase_receipt`, `cancel_sale` e
  `complete_sale`, que os hardenings não tocam), mas é uma diferença de ordem.
- O primeiro hardening executa `alter extension postgres_fdw set schema
  extensions`. Em um projeto Supabase **novo** essa extensão pode não existir e
  a migration falharia. **NÃO CONFIRMADO** (nenhum banco novo foi criado).
- O `initplan` é um bloco `DO` dinâmico que reescreve as policies existentes no
  momento em que roda; o resultado depende do estado anterior.
- **Reprodutibilidade em banco novo NÃO foi testada** (nenhuma migration foi
  executada num banco novo). O que foi comprovado é a equivalência estática
  descrita na seção 3 e nas verificações da reconciliação.

## 8. Procedimento para alterações futuras

1. Escreva a migration como **arquivo novo** com prefixo de timestamp
   (`AAAAMMDDHHMMSS_descricao.sql`) **ainda não usado em nenhum arquivo de nenhuma ref**
   (confira com `git ls-tree` em todas as refs; este README **não** declara qual é o "próximo
   número livre" — o único identificador reservado é `20261014000400`, da candidata do Gate Integral, ainda
   não versionada), idempotente quando possível, com cabeçalho explicando o porquê e
   o `.down.sql` correspondente em `supabase/rollback/`.
2. **Somente com autorização explícita e revisão do diff**, aplique no Supabase **uma única vez**
   (MCP `apply_migration` com o mesmo texto do arquivo, ou SQL Editor) e anote a `version` gerada.
   Nunca use `supabase db push`/`migration repair` (seção 2). Qualquer aplicação deve ser um procedimento
   controlado e versionado: backup/ponto de restauração, comparação de catálogo antes e depois,
   rollback preparado e relato do resultado — sem afirmar sincronização sem evidência.
3. Confira o texto aplicado: compare `supabase_migrations.schema_migrations.statements`
   com o arquivo (ignorando comentários/espaços) e regenere `src/types/supabase.ts`.
4. Registre a nova linha na tabela da seção 3 ou 3-B (arquivo ↔ `name`/`version`) **no
   mesmo PR**; se o mapeamento não puder ser comprovado, marque **NOT VERIFIED** em vez de inventar.
5. Nunca reescreva um arquivo já aplicado; correções são migrations novas.
6. Se algo for aplicado direto no banco (hotfix), versione o SQL **no mesmo dia**
   com a `version` real e marque a origem no cabeçalho.
