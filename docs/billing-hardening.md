# Billing: proteção financeira (Missão 07)

Migration: `supabase/migrations/20261011000000_billing_hardening.sql` — aplicada **somente em TEST**. Production ainda tem 71 migrations (a última é `20261008202401`) e nenhuma cobrança, evento ou consentimento.

## Problemas reproduzidos em TEST antes da correção

1. Era possível inserir várias cobranças `pending` da mesma empresa e plano (duplo clique ou duas abas geravam duas cobranças Pix).
2. Uma confirmação com valor divergente (R$ 1,00 numa cobrança de R$ 89,00) liberava o acesso completo.
3. Estorno não era detectável: pagamento já `paid` retornava cedo e nunca era reconsultado.
4. A confirmação não validava que o evento pertencia à cobrança.

## Desenho

**Criação idempotente** (`claim_subscription_payment`, só `service_role`). Valida plano ativo, preço, duração e moeda; exige `amount == preço do plano`; serializa por `pg_advisory_xact_lock('billing_claim:<empresa>:<plano>')`; reaproveita a cobrança aberta; reserva em andamento (menos de 120 s) devolve a mesma sem criar outra; reserva velha vira `failed`. Índice único parcial `subscription_payments_one_open_evopay_charge_idx (company_id, plan_id) where provider='evopay' and status='pending'` é a segunda barreira. A rota `create-payment` só chama o provedor se o claim devolveu `created` sem cobrança; depois confere `amountsMatch(plan.price, charge.amount)` e, se divergir, marca `failed` e responde 502 **antes** de existir QR.

**Confirmação** (`confirm_subscription_payment`, 7 argumentos, só `service_role`):

- evento duplicado (`unique provider,event_id`) é ignorado; evento de outra cobrança → `EVENT_PAYMENT_MISMATCH`;
- `paid` exige cobrança no provedor (`NO_PROVIDER_CHARGE`), valor informado (`AMOUNT_MISSING`) e igual ao da cobrança até o centavo (`AMOUNT_MISMATCH`), plano com duração fixa (`PLAN_NOT_BILLABLE`);
- com `paid` aceito: trava por empresa, marca pago e chama `platform_apply_access` (único escritor do acesso);
- `paid → refunded` é aceito e **não revoga o acesso automaticamente** (decisão de negócio: revogar é ação do admin); `refunded` é terminal (`REFUNDED_TERMINAL` para qualquer `paid` posterior);
- status igual ou `pending` atrasado são ignorados; rejeições **não** marcam o evento como processado e geram auditoria `subscription_payment.confirmation_rejected`.

**Verdade vem do provedor:** o webhook da EvoPay não é assinado, então a rota só usa o evento como gatilho e confirma por `GET /pix?id=` servidor-a-servidor (`confirmPaymentFromProvider(id, { recheckPaid: true })`).

**Diagnóstico** (`platform_diagnostics()`, agora 13 verificações): + `refunded_with_access` e `payment_events_unprocessed`.

## Evidência (TEST)

| Bateria | Resultado |
|---|---|
| `tests/sql/billing_confirm.sql` | 69/69 |
| `tests/sql/admin_platform.sql` | 299/299 |
| `tests/sql/tenant_isolation.sql` | 0 vazamentos em 39 tabelas |
| `tests/unit/billing.test.mjs` | 17 testes (mapper, referência, centavos, cliente HTTP com fetch simulado) |

## Limitações (não esconder)

- **Concorrência real NÃO verificada.** As chamadas paralelas do MCP executaram em sequência (sem sobreposição de tempo). A garantia vem do lock advisory + índice único (o índice foi testado). O script `tests/integration/billing-concurrency.mjs` roda 20 requisições simultâneas contra um TEST local, mas está **BLOCKED**: precisa da service-role key de TEST, e a variável local está vazia.
- **EvoPay não tem sandbox** e não há nenhum payload real de pagamento nos dois bancos. A semântica do campo de valor devolvido pelo provedor (reais ou centavos, nome do campo) é desconhecida. A decisão foi **falhar fechado**: valor ausente ou divergente rejeita a confirmação. Risco: a primeira cobrança real pode ser rejeitada por formato inesperado; nesse caso o evento fica não processado (`payment_events_unprocessed`) e o admin pode registrar o pagamento manualmente. Validar com uma cobrança de valor mínimo, com autorização do dono, antes de divulgar.
- Estorno revoga acesso? Não automaticamente (ver acima).

## Rollback

```sql
drop function if exists public.claim_subscription_payment(uuid, uuid, numeric, text, integer);
drop function if exists public.confirm_subscription_payment(uuid, public.subscription_payment_status, text, text, text, jsonb, numeric);
drop index if exists public.subscription_payments_one_open_evopay_charge_idx;
-- recriar o confirm_subscription_payment de 6 argumentos a partir da migration 019
-- e platform_diagnostics() da versão anterior (11 verificações).
```

A higienização das cobranças duplicadas (as mais antigas viraram `cancelled`) não é revertida, pois não havia dado real. O código novo (`create-payment`, `confirm-payment`) depende do claim e do confirm de 7 argumentos: aplicar migration e código na ordem descrita em `docs/legal-consent.md` (migrations primeiro).
