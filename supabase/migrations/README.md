# supabase/migrations

Migrations SQL versionadas do banco de dados Prime Ges — única forma permitida
de alterar o schema (nunca diretamente pelo dashboard do Supabase). Visão geral
dos módulos: `docs/architecture.md`.

> **Estado desta documentação:** reconciliação GitHub × Supabase feita em
> 2026-09-24 (PR #26). O que está afirmado abaixo como "idêntico" foi comprovado
> comparando o texto de cada arquivo com `supabase_migrations.schema_migrations`
> (sem comentários/espaços). O que não foi comprovado está marcado
> **NÃO CONFIRMADO** ou listado em "Divergências conhecidas".

## 1. Como o projeto identifica migrations

- Os **arquivos** aqui são numerados (`001_…` a `040_…`), em ordem de aplicação
  lógica. Existem 3 arquivos com prefixo de timestamp (`2026092311xxxx_…`) que
  correspondem a migrations aplicadas como hardening da Fase 2.
- O **histórico live** (`supabase_migrations.schema_migrations`) usa **timestamps**
  como `version` (ex.: `20260922001123`) e o nome lógico como `name`. Para
  migrations 022+ o `name` repete o prefixo do arquivo
  (`024_phase2_purchase_receiving_payables`); para 001–021 o `name` não tem número.
- **Não existe `supabase/config.toml` neste repositório**: o CLI do Supabase não
  está configurado aqui. As migrations foram aplicadas via MCP/`apply_migration`,
  que gera o timestamp no momento da aplicação. **Por isso arquivo e histórico
  não têm a mesma chave** — a relação é feita pelo nome (tabela da seção 3).

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
  nova (foi assim com a 040).

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

1. Escreva a migration como **arquivo novo** `NNN_descricao.sql` (próximo número
   livre; hoje `041`), idempotente quando possível, com cabeçalho explicando o
   porquê.
2. Aplique no Supabase **uma única vez** (MCP `apply_migration` com o mesmo texto do
   arquivo, ou SQL Editor) e anote a `version` gerada.
3. Confira o texto aplicado: compare `supabase_migrations.schema_migrations.statements`
   com o arquivo (ignorando comentários/espaços) e regenere `src/types/supabase.ts`.
4. Registre a nova linha na tabela da seção 3 (arquivo ↔ `name`/`version`) **no
   mesmo PR**.
5. Nunca reescreva um arquivo já aplicado; correções são migrations novas.
6. Se algo for aplicado direto no banco (hotfix), versione o SQL **no mesmo dia**
   com a `version` real e marque a origem no cabeçalho.
