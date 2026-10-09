# Admin Platform (Control Center)

Painel da PLATAFORMA do Prime Ges em `/admin`. Identidade = Clerk; autorização =
`profiles.role` + `profiles.status` no banco. Este documento descreve a arquitetura da
Missão 06 e o procedimento seguro para promovê-la a Production.

> Estado: implementado e validado em **TEST**. Production **não** recebeu estas migrations
> nem este código. Ver "Promoção para Production".

## Princípios

1. **UI nunca é segurança.** Cada ação = Server Action (valida formato com zod) → RPC
   `SECURITY DEFINER` (revalida ator, alvo, hierarquia, limites, estado; grava auditoria).
2. **Sem service_role no browser.** `SUPABASE_SERVICE_ROLE_KEY` só existe em código de
   servidor (webhook EvoPay, reverificação). As telas usam o client de sessão (JWT do
   Clerk + chave anon).
3. **Um único caminho para mudar acesso**: `platform_apply_access()` atualiza
   `subscriptions` (fonte de verdade do guard) e `company_entitlements` (projeção) no mesmo
   passo, sob `pg_advisory_xact_lock` por empresa.
4. **Dinheiro nunca é apagado.** Pagamento manual só é *anulado* (status), por super_admin;
   planos só são *desativados*.
5. **Sem dados falsos.** Tudo que aparece vem do banco; "receita recorrente estimada" é
   derivada e rotulada como estimativa.

## Migrations (ordem)

| Arquivo | Conteúdo |
|---|---|
| `20261009000000_admin_platform_core.sql` | `platform_settings`, presença (`user_presence`, `touch_presence`), `plans.sort_order`, colunas/índice de pagamento manual, `webhook_deliveries`, `platform_audit_category`, `platform_apply_access` |
| `20261009010000_admin_users_companies.sql` | Listas v2 de usuários/empresas, detalhes, edição de nome, busca por e-mail (super), `platform_safe_metadata` |
| `20261009020000_admin_billing_ops.sql` | Conceder dias, 30 dias, ajuste de vencimento, pagamento manual, anular, trocar plano, cancelar, reativar, listas/resumo/detalhe de assinaturas e pagamentos, CRUD de planos |
| `20261009030000_admin_insights_tools.sql` | Auditoria, dashboard, busca global, diagnósticos, ações rápidas, webhooks/integrações, edição de empresa |
| `20261009040000_admin_webhook_retention.sql` | Retenção (60 dias) do histórico de webhooks |
| `20261009050000_admin_hardening.sql` | Revoga EXECUTE de `protect_last_super_admin()` |
| `20261009060000_admin_lists_dynamic_filters.sql` | Correção de performance das listas (CTE `MATERIALIZED`) |
| `20261009070000_admin_presence_min_online.sql` | Piso de 90 s para `presence_online_seconds` (QA 06.1) |

Aplicar sempre **em ordem**. Nenhuma altera dados existentes além de adicionar colunas
com default e tabelas novas.

## Catálogo de RPCs

Admin = `is_platform_admin()`; Super = `is_super_admin()`.

| RPC | Quem | Auditoria |
|---|---|---|
| `list_platform_admin_users`, `get_platform_user_detail` | Admin (clerk_user_id só super) | — |
| `admin_update_user_profile` (só nome) | Admin (em user comum/si) / Super | `platform.user.profile_updated` |
| `admin_find_user_by_email` | Super | — |
| `set_platform_user_role`, `set_platform_user_status` | Super / Admin só em user comum | `platform.user.role_changed` / `status_changed` |
| `list_platform_admin_companies`, `get_platform_company_detail` | Admin | — |
| `admin_update_company` | Admin | `platform.company.updated` |
| `set_platform_company_status` | Super | `platform.company.*` |
| `admin_grant_access_days` (limite configurável) | Admin / Super (≤365) | `platform.access.days_granted` |
| `admin_release_30_days` | Admin | `platform.access.thirty_days_released` |
| `admin_adjust_access_expiry` | Super | `platform.access.expiry_adjusted` |
| `admin_record_manual_payment` | Admin | `platform.payment.manual_recorded` |
| `admin_void_manual_payment` | Super | `platform.payment.manual_voided` |
| `admin_assign_plan`, `admin_reactivate_subscription` | Admin | `platform.subscription.plan_changed` / `reactivated` |
| `admin_cancel_subscription` | Super | `platform.subscription.cancelled` |
| `list_platform_subscriptions`, `list_platform_payments`, `platform_payments_summary`, `get_platform_payment_detail` | Admin | — |
| `list_platform_plans` | Admin | — |
| `create_platform_plan`, `update_platform_plan`, `set_platform_plan_status` | Super | `platform.plan.*` |
| `get_platform_settings` / `set_platform_setting` | Admin lê / Super grava | `platform.settings.updated` |
| `list_platform_audit` | Admin (só próprias ações) / Super (tudo) | — |
| `get_platform_dashboard`, `platform_global_search`, `platform_diagnostics`, `platform_integrations_status` | Admin | — |
| `admin_sync_company_entitlements`, `admin_mark_expired_subscriptions` | Admin | `platform.admin.*` |
| `admin_audit_payment_reverify` | Admin | `platform.payment.reverified` |
| `list_platform_webhook_deliveries`, `list_platform_payment_events` | Admin | — |
| `touch_presence` | qualquer usuário ativo (grava só a própria linha, no máx. 1×/30 s) | — |

Funções internas (sem EXECUTE para anon/authenticated): `platform_apply_access`,
`platform_extend_access_core`, `platform_assert_*`, `platform_clean_reason`,
`platform_safe_metadata`, `platform_setting_int`, `platform_presence_status`,
`platform_audit_category`, `write_platform_audit_log`.

## Categorias de auditoria

`USER_MANAGEMENT`, `ROLE_CHANGE`, `STATUS_CHANGE`, `ACCESS_EXTENSION`, `PLAN_CHANGE`,
`SUBSCRIPTION_CHANGE`, `MANUAL_PAYMENT`, `PAYMENT`, `ADMIN_ACTION`, `SYSTEM`, `WEBHOOK`,
`INTEGRATION` — derivadas do nome da ação por `platform_audit_category()`. O metadata
exibido passa por `platform_safe_metadata()` (remove chaves com token/senha/jwt/
authorization/api key/cookie/payload).

## Configurações reais (`platform_settings`)

| Chave | Efeito | Faixa |
|---|---|---|
| `admin_max_free_days` | limite de dias que um ADMIN concede por operação | 1–365 (padrão 30) |
| `presence_online_seconds` | janela de "online agora" (piso de 90 s: o heartbeat é de 60 s) | 90–900 (padrão 120) |
| `presence_recent_minutes` | janela de "ativo recentemente" | 5–240 (padrão 15) |

## Presença

`<PresenceHeartbeat />` (shells do app e do admin) chama `POST /api/presence` a cada 60 s
com a aba visível; `touch_presence()` só grava se a última marca tem >30 s e só para perfil
**ativo**. Estados: online / recente / offline.

## Webhook EvoPay

A EvoPay não assina nem reenvia. `POST /api/webhooks/evopay` continua só *localizando* o
pagamento pelo id e reconfirmando por GET server-to-server (idempotente via
`payment_events`). Agora registra cada entrega em `webhook_deliveries` (resultado + id
externo; **nunca** o payload). "Reprocessar" = *Reverificar na EvoPay* no detalhe do pagamento.

## Testes

```bash
npm run typecheck && npm run lint && npm run test:unit && npm run build
```

- `tests/unit/*.test.mjs` — permissões, parsing de parâmetros, formatadores, claim do JWT.
- `tests/sql/admin_platform.sql` — bateria de RPCs/RLS/grants (**somente TEST**, termina em
  `ROLLBACK`): USER, ADMIN, SUPER, suspenso, anon, DML direto, último super_admin,
  consistência subscriptions×entitlements, cobertura de auditoria. Cole no SQL do TEST;
  o resultado é um JSON com `fail: 0` quando tudo passa.

## Promoção para Production (quando autorizada)

1. Backup/point-in-time do Production e janela de manutenção curta.
2. Aplicar as 8 migrations **em ordem** (só adicionam/redefinem funções; a última apenas eleva
   `presence_online_seconds` para o piso de 90 s se estiver abaixo).
3. Rodar `get_advisors` e conferir grants (anon sem EXECUTE nas funções novas).
4. Deploy do código. Smoke: `/admin` com sessão real do super_admin.
5. Rodar a bateria de leitura (`tests/sql/admin_platform.sql` **não** — é só TEST; em
   Production fazer apenas checagens somente-leitura/rollback combinadas).
6. Nenhum dado de teste persistido em Production; HAT GROUP e o super_admin real
   permanecem intocados.

## Limitações conhecidas

- Total de registros (`total_count`) das listas é calculado por `count(*) over ()`: ótimo
  até dezenas de milhares de linhas; para milhões de linhas de auditoria considerar
  contagem aproximada/cursor.
- Anular pagamento manual **não** reverte o acesso (use *Ajustar vencimento*).
- Gestão de membros/propriedade da empresa não é feita pelo admin (preserva multi-tenancy).
- Webhook do Clerk não é usado (sessão validada por JWKS).
