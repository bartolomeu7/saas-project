# Mapa completo do Supabase no Prime Ges (para a migração ao servidor local)

> Levantamento de **11/11/2026**, só leitura: código da branch `main`, banco de **Produção** (`fpbcruinppjbwtinzrdg`) consultado sem alterar nada, variáveis da Vercel (só os nomes) e configuração do Clerk. **Nenhum arquivo do site foi mudado.**

## 0. Resumo em 12 linhas

1. O site **não usa o login do Supabase**. O login é do **Clerk**; o Supabase é só **banco + regras de segurança por linha (RLS) + funções (RPC) + armazenamento de arquivos**.
2. O banco é **minúsculo**: **22 MB**, menos de mil linhas no total, PostgreSQL **17.6**. Memória **não é** o limite hoje.
3. O site conversa com o banco **só por HTTP** (biblioteca `@supabase/supabase-js` → caminhos `/rest/v1/...`, `/rest/v1/rpc/...`, `/storage/v1/...`). **Nada se conecta direto ao Postgres** (sem `pg`, Prisma, Drizzle).
4. São **274 consultas** (`.from("tabela")`) e **130 chamadas de função** (`.rpc("nome")`) em **66 arquivos**, mais o `middleware` (que consulta o banco **a cada navegação**).
5. A segurança depende de **106 políticas RLS** (89 usam `current_profile_user_id()`, que lê `auth.jwt()->>'sub'`, o ID do Clerk) e **158 funções com permissão elevada** (`SECURITY DEFINER`).
6. O Supabase confia no token do **Clerk** pela integração "Third-Party Auth" (valida via JWKS do Clerk; o token precisa ter `role: authenticated`).
7. Só **1 bucket** de arquivos (`customer-documents`, privado, hoje **0 arquivos**), com 3 políticas em `storage.objects`.
8. **Não usamos:** Realtime (publicação vazia), Edge Functions, Vault (0 segredos), Supabase Auth (2 usuários sobrando em `auth.users`, sem vínculo com as tabelas do app), pg_cron.
9. **Atenção:** o repositório tem **87** migrations e a Produção aplicou **95**. A fonte de verdade para o banco novo é um **dump da Produção**, não reexecutar as migrations.
10. O caminho mais barato e seguro: **rodar o Supabase (software livre) no seu servidor**. O código quase não muda (só 3 variáveis de ambiente).
11. Trocar para um Postgres "puro" exige reescrever **~400 pontos do código** e recriar a segurança. Não recomendo.
12. Variáveis no código: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (as demais `SUPABASE_*`/`POSTGRES_*` da Vercel vêm da integração Vercel↔Supabase e **não são usadas pelo código**).

---

## 1. Como o site fala com o banco (hoje)

```
Navegador
   │  (nunca fala com o Supabase direto: não há cliente Supabase no navegador)
   ▼
Next.js na Vercel ──► Clerk (login, tokens)
   │
   ├─ middleware.ts ────────────┐   consulta profiles + RPCs a CADA navegação protegida
   ├─ Server Components / Actions│   (módulos de dados: createSessionClient)
   ├─ Route Handlers (7)         │
   ▼                             ▼
Supabase (https://<projeto>.supabase.co)
   ├─ /rest/v1/<tabela>          (PostgREST: .from())
   ├─ /rest/v1/rpc/<funcao>      (PostgREST: .rpc())
   ├─ /storage/v1/...            (arquivos: customer-documents)
   └─ Postgres 17.6 (RLS + funções)
```

### Os 4 pontos de entrada no código (`src/lib/supabase/`)

| Arquivo | Chave usada | Para quê | Quem importa |
|---|---|---|---|
| `server.ts` → `createSessionClient()` | `anon` + **token do Clerk** | Quase tudo: lê/escreve como o usuário logado (RLS vale) | 54 arquivos |
| `clerk-client.ts` → `createClerkSupabaseClient()` | `anon` + token do Clerk | Base do anterior | 3 arquivos |
| `admin.ts` → `createAdminClient()` | **`service_role`** (ignora RLS) | Webhook de pagamento, cobrança, conta/exclusão, 2FA, sessão, chat (tabelas `chat_*`), documentos | 11 arquivos |
| `public.ts` → `createPublicClient()` | `anon` sem login | Planos públicos da home (`get_public_plans`) | 2 arquivos |
| `middleware.ts` | `anon` + token do Clerk (cliente próprio) | Guarda de conta ativa, consentimento, 2FA, vaga de sessão | 1 arquivo |

Também existe `src/types/supabase.ts` (5.295 linhas), gerado a partir do banco, só para tipos do TypeScript.

---

## 2. O que o Supabase entrega hoje e se o site precisa disso

| Recurso do Supabase | Usado? | Detalhe |
|---|---|---|
| Postgres | **Sim** | 74 tabelas, 180 funções, 83 triggers, 40 enums, 294 índices, 106 políticas |
| Data API (PostgREST) | **Sim, é o coração** | 274 `.from()` + 130 `.rpc()` |
| RLS + papéis `anon`/`authenticated`/`service_role` | **Sim** | Todas as 74 tabelas têm RLS; `authenticated` executa 123 funções, `anon` só 2 |
| Third-Party Auth (Clerk via JWKS) | **Sim** | Token do Clerk vira papel `authenticated`; precisa do claim `role` |
| Storage | **Sim, pouco** | Bucket `customer-documents` (privado, 10 MB, PDF/JPEG/PNG/WEBP), upload + URL assinada de 60 s + remoção; **0 arquivos hoje** |
| Supabase Auth (GoTrue) | **Não** | O app não faz login/cadastro por ele. Só existe a função `auth.jwt()` que as políticas chamam |
| Realtime | **Não** | `supabase_realtime` sem tabelas |
| Edge Functions | **Não** | Nenhuma |
| Vault | **Não** | 0 segredos |
| pg_cron | **Não instalado** | Funções de limpeza existem (`chat_expire_due_drafts`, `chat_purge_old_messages`, `webhook_deliveries_prune`) mas **nada as agenda** — ver §8 |
| Painel Studio / conector MCP | Uso humano e de desenvolvimento | Hoje é por onde eu consulto e aplico migrations |

---

## 3. Mapa por módulo do código

Gerado a partir do código (`.from()`, `.rpc()`, storage, service role). "Arquivos" = quantos arquivos do módulo falam com o Supabase.

| Módulo | Arquivos | Tabelas | Funções (RPC) | Observação |
|---|---|---|---|---|
| `app (páginas e ações)` | 7 | customers, products, profiles, sales, services | account_deletion_preview | service role |
| `app/api/billing` | 1 | plans, subscription_payments | claim_subscription_payment | service role |
| `app/api/health` | 1 | — | get_public_plans |  |
| `app/api/presence` | 1 | — | touch_presence |  |
| `app/api/webhooks` | 1 | subscription_payments, webhook_deliveries | — | service role |
| `lib/account` | 1 | customer_documents | account_deletion_preview, delete_account_data | service role, storage |
| `lib/admin` | 3 | profiles | admin_add_company_member, admin_adjust_access_expiry, admin_assign_plan, admin_audit_payment_reverify, admin_audit_reconciliation, admin_cancel_subscription, admin_find_user_by_email, admin_grant_access_days, admin_grant_license, admin_mark_expired_subscriptions, admin_reactivate_subscription, admin_record_manual_payment, admin_release_30_days, admin_remove_company_member, admin_reset_two_factor, admin_save_plan, admin_set_company_member_role, admin_sync_company_entitlements, admin_transfer_company_ownership, admin_update_company, admin_update_user_profile, admin_void_manual_payment, get_platform_admin_overview, get_platform_company_detail, get_platform_dashboard, get_platform_payment_detail, get_platform_settings, get_platform_user_detail, is_platform_admin, is_super_admin, list_platform_admin_companies, list_platform_admin_users, list_platform_administrators, list_platform_audit, list_platform_payment_events, list_platform_payments, list_platform_plan_history, list_platform_plans, list_platform_subscriptions, list_platform_webhook_deliveries, platform_diagnostics, platform_global_search, platform_integrations_status, platform_payments_summary, platform_reconcile_candidates, set_platform_company_status, set_platform_plan_status, set_platform_setting, set_platform_user_role, set_platform_user_status |  |
| `lib/agenda` | 3 | appointments, customers, professional_availability, professional_profiles, services | complete_appointment, create_appointment, reschedule_appointment, set_appointment_status |  |
| `lib/audit` | 2 | audit_logs | write_audit_log |  |
| `lib/auth` | 4 | profiles | current_profile_user_id, ensure_profile, register_session_slot, release_session_slot, session_slot_status | service role |
| `lib/billing` | 4 | audit_logs, company_entitlements, company_members, plans, subscription_payments, subscriptions | confirm_subscription_payment, get_my_trial_status, get_public_plans | service role |
| `lib/cash-register` | 2 | cash_movements, cash_registers, profiles | close_cash_register, create_cash_movement, open_cash_register | service role |
| `lib/chat` | 2 | appointments, chat_drafts, chat_feedback, chat_messages, chat_sessions, chat_settings, customers, professional_availability, professional_blocks, professional_profiles, professional_services, services | chat_bump_usage | service role |
| `lib/companies` | 2 | companies, company_members | claim_free_trial, create_company_with_owner, update_own_company |  |
| `lib/customer-documents` | 2 | customer_documents, customers, profiles | — | storage |
| `lib/customers` | 3 | customers, sales | — |  |
| `lib/finance` | 2 | accounts_payable, cost_centers, financial_categories, financial_entries, sale_payments, sales | create_cost_center, create_financial_category, create_financial_entry, pay_accounts_payable, receive_sale_payment |  |
| `lib/hr` | 2 | hr_adjustments, hr_employee_clt, hr_employees, hr_payments, hr_settings, hr_tax_tables, hr_time_entries, hr_vacations | hr_add_adjustment, hr_cancel_payment, hr_cancel_vacation, hr_close_payroll, hr_close_period, hr_close_thirteenth, hr_close_vacation_pay, hr_delete_adjustment, hr_pay_payment, hr_period_preview, hr_save_clt_employee, hr_save_settings, hr_schedule_vacation, hr_set_attendance |  |
| `lib/legal` | 1 | — | get_current_legal_documents, get_my_legal_consent_history, get_my_legal_consent_status, record_legal_consent |  |
| `lib/loyalty` | 2 | loyalty_accounts, loyalty_campaigns, loyalty_multipliers, loyalty_settings, loyalty_tier_thresholds, loyalty_transactions, products, services | adjust_loyalty_points, redeem_loyalty_points, undo_loyalty_redemption_for_draft_sale |  |
| `lib/product-categories` | 2 | product_categories, products | — |  |
| `lib/products` | 3 | product_categories, products | adjust_product_stock |  |
| `lib/purchases` | 2 | accounts_payable, purchase_orders, purchase_receipts | cancel_purchase_order, cancel_purchase_receipt, create_purchase_order, receive_purchase_order |  |
| `lib/raffles` | 2 | customer_raffle_entries, customer_raffles, customers, sales | — |  |
| `lib/reports` | 1 | accounts_payable, appointments, financial_entries, products, sale_items, sale_payments, sales | — |  |
| `lib/sales` | 3 | customers, products, profiles, sale_items, sale_payments, sales, services | add_sale_payment, cancel_sale, complete_sale, recalculate_sale_totals |  |
| `lib/security` | 2 | two_factor_session_verifications, user_two_factor, user_two_factor_backup_codes | authorize_trial_signup, two_factor_reserve_attempt | service role |
| `lib/service-categories` | 2 | service_categories, services | — |  |
| `lib/services` | 2 | service_categories, services | — |  |
| `lib/settings` | 1 | profiles | — |  |
| `lib/supabase` | 3 | — | — | service role |
| `lib/suppliers` | 2 | suppliers | — |  |
| `lib/team` | 2 | professional_availability, professional_blocks, professional_profiles, professional_services, services | add_existing_company_member, create_professional_block, delete_professional_block, get_company_seat_usage, list_company_team, remove_company_member, set_professional_availability, set_professional_services, update_company_member_role, upsert_professional_profile |  |
| `middleware` | 1 | profiles | get_my_legal_consent_status, session_slot_status, two_factor_gate_status |  |

### Rotas e pontos de entrada que tocam o banco

| Rota / arquivo | O que faz com o Supabase |
|---|---|
| `src/middleware.ts` | A cada navegação protegida: lê `profiles`; chama `session_slot_status`, `two_factor_gate_status`, `get_my_legal_consent_status` |
| `POST /app/chat/turn` | Chat AI: lê catálogo/clientes/agenda (RLS); tabelas `chat_*` com service role; `chat_bump_usage` |
| `POST /app/chat/confirm` | Chat AI: grava agendamento (`create_appointment`), cliente novo, auditoria |
| `GET /app/relatorios/export` | Exporta relatórios (lê vendas, financeiro, etc.) |
| `POST /api/billing/create-payment` | Cria cobrança (service role: `plans`, `subscription_payments`; RPC `claim_subscription_payment`) |
| `POST /api/webhooks/evopay` | **Webhook de pagamento** (service role: `subscription_payments`, `webhook_deliveries`; RPC de confirmação) |
| `GET /api/health` | Saúde: chama `get_public_plans` (se o banco cair, o health falha) |
| `POST /api/presence` | Marca presença: RPC `touch_presence` |
| 30 arquivos `"use server"` | Ações de cada módulo (criar/editar/cancelar…) |
| Páginas (`/app/**`, `/admin/**`, `/conta`) | Leituras via Server Components |

---

## 4. Banco de Produção — inventário

- **PostgreSQL 17.6**, fuso `UTC`, 22 MB, `max_connections=60`, `shared_buffers=224MB` (plano pequeno).
- **Extensões:** `pgcrypto` (usada por 9 funções), `uuid-ossp` (instalada, **nenhuma função usa**), `postgres_fdw` (**sem servidores**), `pg_stat_statements`, `supabase_vault` (vazio), `plpgsql`.
- **Esquemas:** `public` (app), `auth`, `storage`, `realtime`, `vault`, `graphql`, `graphql_public`, `extensions`, `supabase_migrations`.
- **public:** 74 tabelas, 0 views, 180 funções (158 `SECURITY DEFINER`, 2 chamáveis por `anon`), 83 triggers, 40 enums, 294 índices, 61 colunas com `gen_random_uuid()`.
- **Nenhuma tabela do app tem chave estrangeira para `auth.users`.** (As 24 FKs que apontam para `auth` são do próprio esquema `auth`.) Isso facilita muito.
- **Event triggers:** `ensure_rls` (**nosso**: liga RLS automaticamente em tabela nova, função `rls_auto_enable`) e os do Supabase (`pgrst_ddl_watch`/`pgrst_drop_watch` avisam o PostgREST para recarregar o esquema; `issue_pg_graphql_access`, `issue_pg_cron_access`, `issue_pg_net_access`, `issue_graphql_placeholder`).
- **Papéis:** `anon`, `authenticated`, `service_role`, `authenticator`, `postgres`, `supabase_admin`, `supabase_auth_admin`, `supabase_storage_admin`, `dashboard_user`, `pgbouncer`.
- **Maiores tabelas** (todas < 1 MB): `chat_messages` (473 linhas), `chat_drafts` (149), `audit_logs` (240), `sales`, `products`, `financial_entries`…
- **Migrations aplicadas:** 95 (última `20261111131723`). **No repositório:** 87 em `supabase/migrations` (+25 rollbacks, 5 candidatas, 2 superadas).
- **Testes de banco:** 30 arquivos em `tests/sql/` (isolamento de empresas, financeiro, RH, chat, permissões etc.). **Servem para provar o banco novo.**

### As 74 tabelas (public)
`accounts_payable, appointments, audit_logs, cash_movements, cash_registers, chat_drafts, chat_feedback, chat_messages, chat_sessions, chat_settings, chat_usage, companies, company_entitlements, company_members, company_settings, cost_centers, customer_documents, customer_raffle_entries, customer_raffles, customers, finance_default_seed_guard, financial_categories, financial_entries, hr_adjustments, hr_employee_clt, hr_employees, hr_payments, hr_settings, hr_tax_tables, hr_time_entries, hr_vacations, legal_document_versions, loyalty_accounts, loyalty_campaigns, loyalty_multipliers, loyalty_settings, loyalty_tier_thresholds, loyalty_transactions, payment_events, plan_benefits, plans, platform_operation_keys, platform_settings, product_categories, products, professional_availability, professional_blocks, professional_profiles, professional_services, profiles, purchase_order_items, purchase_orders, purchase_receipt_items, purchase_receipts, retained_billing_records, sale_items, sale_payments, sales, service_categories, services, stock_movements, subscription_payments, subscriptions, supplier_products, suppliers, trial_signup_events, two_factor_session_verifications, user_consents, user_preferences, user_presence, user_session_slots, user_two_factor, user_two_factor_backup_codes, webhook_deliveries`

### Funções por família (180)
- **Painel de administração da plataforma:** `admin_*` (27), `list_platform_*`, `get_platform_*`, `platform_*`, `set_platform_*`, `create/update_platform_plan`.
- **Vendas/caixa/financeiro/estoque/compras:** `complete_sale`, `cancel_sale`, `add_sale_payment`, `receive_sale_payment`, `recalculate_sale_totals`, `open/close_cash_register`, `create_cash_movement`, `create_financial_*`, `pay_accounts_payable`, `adjust_product_stock`, `create/receive/cancel_purchase_*`.
- **Agenda/equipe:** `create_appointment`, `reschedule_appointment`, `complete_appointment`, `set_appointment_status`, `upsert_professional_profile`, `set_professional_*`, `create/delete_professional_block`, `list_company_team`, `*_company_member*`.
- **RH:** `hr_*` (19).
- **Fidelidade:** `adjust/redeem_loyalty_points`, `undo_loyalty_redemption_for_draft_sale`, `grant/reverse_loyalty_points_for_sale`, `expire_loyalty_points_batch`.
- **Conta, assinatura e segurança:** `create_company_with_owner`, `update_own_company`, `claim_free_trial`, `confirm_subscription_payment`, `claim_subscription_payment`, `two_factor_*`, `*_session_slot*`, `record_legal_consent`, `get_*legal*`, `delete_account_data`, `account_deletion_preview`, `ensure_profile`, `write_audit_log`.
- **Chat AI:** `chat_bump_usage`, `chat_expire_due_drafts`, `chat_purge_old_messages`, `chat_member_company_id`, `chat_owner_company_id`.
- **Base da segurança:** `current_profile_user_id`, `is_platform_admin`, `is_super_admin`, `rls_auto_enable`.
- **Triggers (22 funções):** `set_updated_at`, `protect_*`, `guard_price_cost_change`, `hr_employees_guard/audit`, `legal_document_versions_guard`, `user_consents_append_only`, `enforce_company_seat_limit`, `recompute_sale_payment_status`, `reopen_appointment_on_sale_cancel`, `seed_financial_defaults_on_company`, `webhook_deliveries_prune`, etc.

---

## 5. A cola entre Clerk e Supabase (o ponto mais delicado)

1. O Clerk emite o token da sessão. O código o entrega ao Supabase por `createClient(url, anonKey, { accessToken: () => auth().getToken() })`.
2. O Supabase valida o token pelo **JWKS do Clerk** (domínio `clerk.primeges.com.br`) e usa o claim **`role` = `authenticated`** para escolher o papel do Postgres.
3. As políticas chamam `current_profile_user_id()`, que faz `select user_id from profiles where clerk_user_id = (auth.jwt() ->> 'sub') and status = 'active'`.
4. **No servidor novo é preciso reproduzir exatamente isto:** (a) a Data API aceitar tokens do Clerk (JWKS), (b) existir a função `auth.jwt()`, (c) o claim `role: authenticated` continuar no token do Clerk (configuração do lado do Clerk, que já existe e não muda), (d) papéis e permissões (`GRANT`) idênticos.
5. O `profiles.role` (`user`/`admin`/`super_admin`) e `company_members.role` (`owner`/`admin`/`employee`) são dados do app, não do Supabase.

---

## 6. Variáveis de ambiente

### Que o código usa (o que precisa existir no servidor novo)
| Variável | Onde | Observação |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | servidor e navegador | URL da Data API do servidor novo (**precisa ser HTTPS público**) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | servidor | Chave `anon` do servidor novo |
| `SUPABASE_SERVICE_ROLE_KEY` | só servidor | Chave `service_role` do servidor novo |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` | Clerk | **Não mudam** |
| `TWO_FACTOR_ENCRYPTION_KEY` | 2FA | **Tem que ser a MESMA de hoje**, senão ninguém abre o 2FA (a Vercel mostrou pendência de criar) |
| `ANTIFRAUD_HASH_SECRET` | antifraude do teste grátis | A mesma de hoje |
| `EVOPAY_API_KEY`, `EVOPAY_API_BASE_URL` | cobrança | Não mudam |
| `RESEND_API_KEY`, `EMAIL_FROM` | e-mail | Conferir se existem na Vercel |
| `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_APP_ENV` | geral | Conferir |
| `CHAT_AI_ENABLED`, `CHAT_AI_CONFIRM_ENABLED`, `CHAT_DAILY_LIMIT` | Chat AI | Valores atuais: ligados, limite 200 |

### Que existem na Vercel mas o código **não** usa (vieram da integração Vercel↔Supabase)
`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `SUPABASE_JWT_SECRET`, `POSTGRES_URL`, `POSTGRES_PRISMA_URL`, `POSTGRES_URL_NON_POOLING`, `POSTGRES_USER`, `POSTGRES_HOST`, `POSTGRES_PASSWORD`, `POSTGRES_DATABASE`. **Depois da virada, remover a integração** para ela não recriar essas variáveis apontando para o projeto antigo.

> Importante: o ambiente de **Preview** usa um segundo projeto Supabase (TEST, `zlmxbqlpjstmllrvafmy`). A migração precisa de **dois bancos novos** (produção e teste), ou de um jeito de manter o ambiente de ensaio.

---

## 7. O que quebra no dia em que o Supabase sair (e como cada coisa se resolve)

| # | O que depende | Se faltar | Solução na migração |
|---|---|---|---|
| 1 | URL `/rest/v1` e `/rest/v1/rpc` | Nenhuma página autenticada abre | Servidor expõe a mesma API (Supabase self-hosted) |
| 2 | Aceitar o token do Clerk | Todos "não autenticados" | Configurar JWKS do Clerk no gateway/PostgREST |
| 3 | Função `auth.jwt()` e esquema `auth` | Políticas RLS falham | Já existe no Supabase self-hosted |
| 4 | Papéis e GRANTs | Erro de permissão em dezenas de telas | Restaurar roles/grants do dump |
| 5 | `/storage/v1` | Upload/ver/excluir documento de cliente e exclusão de conta | Subir o serviço Storage (ou mover para disco/S3) |
| 6 | Event trigger `pgrst_ddl_watch` | Esquema novo não é visto sem reiniciar | Vem com o Supabase self-hosted |
| 7 | Event trigger `ensure_rls` (nosso) | Tabela nova nasce sem RLS | Está no dump |
| 8 | Webhook EvoPay (`/api/webhooks/evopay`) | Pagamentos não confirmam | A URL pública do site não muda se ele continuar na Vercel; se o site mudar de lugar, atualizar no painel da EvoPay |
| 9 | Middleware consulta o banco a cada navegação | Site lento se o banco estiver "longe" | Servidor com boa conexão; ver latência |
| 10 | Integração Vercel↔Supabase | Recria variáveis antigas | Remover a integração |
| 11 | Conector MCP do Supabase (meu acesso) | Eu perco a forma de aplicar migrations | Acesso por túnel + `psql` + migrations em arquivo (ver tutorial) |
| 12 | `supabase_migrations.schema_migrations` | Histórico perdido | Restaurar no dump ou recomeçar com baseline |
| 13 | `src/types/supabase.ts` | Tipos desatualizados | Regerar contra o banco novo (comando no pacote) |
| 14 | Tarefas de limpeza (não agendadas) | Tabelas `chat_*`/`webhook_deliveries` crescem | Agendar no servidor novo (cron do sistema) — ver §8 |
| 15 | Backups | Hoje o Supabase faz | Você passa a ser o responsável: ver tutorial |

---

## 8. Achados que valem corrigir **junto** com a migração (sem mexer no site agora)

1. **Migrations 87 × 95:** exportar o esquema da Produção como baseline e guardar no repositório.
2. **Funções de limpeza sem agendador:** `chat_purge_old_messages`, `chat_expire_due_drafts` e `webhook_deliveries_prune` nunca rodam sozinhas hoje. No servidor novo, agendar (cron do Linux chamando `psql`). Registrar como regra de LGPD (apagar histórico do chat após prazo).
3. **Extensões sem uso** (`uuid-ossp`, `postgres_fdw`, `supabase_vault`): não precisa levar `postgres_fdw`.
4. **`max_connections=60`:** o servidor novo pode ter bem mais, mas a Data API usa um pool pequeno; dimensionar o pool, não o número de conexões.
5. **Dois ambientes** (Produção e TEST): planejar os dois.
