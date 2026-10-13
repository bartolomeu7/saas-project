# Licenças, acesso vitalício e operações idempotentes (Missão 08)

## Modelo de acesso

| Conceito | Representação |
|---|---|
| Assinatura com prazo | `subscriptions.expires_at` preenchido, `lifetime = false` |
| **Acesso vitalício** | `expires_at IS NULL` **e** `lifetime = true` (CHECK `subscriptions_lifetime_coherent`: nunca um sem o outro) |
| Plano vitalício | `plans.lifetime = true`, sem preço e sem duração (CHECK `plans_lifetime_has_no_duration`); código `LIFETIME`, não aparece no catálogo público nem em `/app/assinatura/planos`, e `claim_subscription_payment` o recusa (sem preço) |
| Projeção de recursos | `company_entitlements.lifetime` espelha a assinatura; `access_expires_at` fica nulo |

**Não existe data fictícia** (2099/9999). **Regra de acesso, em todo lugar:** `status em (trialing, active) E (lifetime OU expires_at > now())`. Está em `public.subscription_access_active()` (SQL), nas leituras reescritas (listas, detalhes, dashboard, diagnósticos) e em `src/lib/billing/access.ts` (guard, página de assinatura, testes). Falha **fechado**: `expires_at` nulo sem `lifetime = true` explícito nunca concede acesso.

### Semântica operacional

- Vitalício **não expira** (`admin_mark_expired_subscriptions` ignora), **não conta como MRR** nem como “vencendo”, e aparece como “Vitalício” nas telas.
- Só **super_admin** concede o vitalício. Cancelar/suspender continua possível (super_admin cancela; reativar devolve o acesso permanente, sem prazo novo).
- Sair do vitalício = **revogar um acesso permanente**: só super_admin, atribuindo um plano com prazo e informando os dias (`admin_assign_plan`). `admin_adjust_access_expiry` recusa vitalício.
- Estender dias (`admin_grant_license`, `admin_grant_access_days`, `admin_release_30_days`) sobre vitalício é recusado (“não há prazo a estender”).
- Pagamento Pix confirmado sobre empresa vitalícia: o pagamento fica **registrado como pago**, o acesso permanente **não é alterado**. Pagamento manual **com acesso** sobre vitalício é recusado; **sem acesso** (só documentar) é permitido.
- Desativar o plano `LIFETIME` (super_admin) bloqueia **novas** concessões vitalícias; as existentes continuam.

## Concessão de acesso (`admin_grant_license`)

| Tipo | O que faz | Quem |
|---|---|---|
| `thirty_days` | soma 30 dias ao vencimento atual (ou a partir de hoje, se vencido) | admin e super_admin |
| `plan_period` | soma a **duração configurada no plano** (31/93/365 hoje) e passa a empresa para esse plano | admin e super_admin |
| `custom_days` | soma exatamente N dias (1–365); **não** é “plano trimestral” | admin e super_admin |
| `lifetime` | acesso permanente | **só super_admin** |

**Limite sem pagamento:** administrador comum concede até `admin_max_free_days` (padrão 30) por operação; super_admin até 365. Para dar mais ao admin: registrar o pagamento manual (exige valor recebido > 0) ou pedir a um super_admin. *Mudança de política desta missão:* o mesmo limite passou a valer em `admin_assign_plan` e `admin_reactivate_subscription` quando concedem prazo novo sem pagamento (antes eram um atalho para dar o prazo cheio do plano). Trocar de plano **preservando o período ativo** continua livre.

Exige motivo (3–500 caracteres), confirmação explícita na UI e grava `platform.access.license_granted` / `platform.access.lifetime_granted` com tipo, dias, plano anterior/novo, vencimentos e ator.

## Registro de pagamento manual (`admin_record_manual_payment`)

Três comportamentos explícitos na tela:

1. **Liberar acesso agora** (marcado): grava o pagamento **e** soma a duração do plano ao vencimento (mesma transação — se algo falhar, nada fica gravado). Exige valor > 0.
2. **Apenas documentar** (desmarcado): grava o pagamento sem tocar na assinatura.
3. Troca de plano com período ativo é a operação separada “Trocar plano”.

O administrador afirma que o dinheiro foi recebido; o sistema não simula nem cobra nada. A auditoria guarda o preço do plano e `below_plan_price`; o diagnóstico `manual_payment_below_price` lista os casos dos últimos 90 dias.

## Idempotência

`platform_operation_keys (request_key PK, operation, company_id, actor, result)`. A UI gera um UUID por diálogo (`useRequestKey`), estável até o sucesso. No banco, `platform_begin_operation` reserva a chave **dentro da transação da operação**:

- repetição (duplo clique, retry de rede) → devolve o resultado guardado com `replayed: true`, sem executar de novo;
- a mesma chave em outra empresa/tipo/ator → recusada;
- operação que falha → transação (e chave) desfeita; o retry com a mesma chave executa;
- uma **nova** concessão legítima usa chave nova e é permitida.

Duas chamadas simultâneas com a mesma chave serializam no `INSERT ... ON CONFLICT` da PK. **Concorrência real continua NOT VERIFIED** (ver `docs/qa/mission-08-admin-control-center-golive.md`).

## Equipe e propriedade (`admin_*_company_member`, `admin_transfer_company_ownership`)

Modelo atual: **uma empresa por usuário**; papéis `owner/admin/employee`; limite de adicionais vem do entitlement do plano. O admin da plataforma adiciona um perfil **existente e ativo** (por e-mail), altera `admin ⇄ employee` e remove não-owners; **transferir a propriedade é exclusivo de super_admin** e atômico (um único owner ao final; o antigo vira `admin`). Nenhuma dessas operações cria identidade: quem não tem conta precisa se cadastrar pelo Clerk.

## Reconciliação de pagamentos

O webhook da EvoPay não é assinado e tem **uma única tentativa**. “Reconciliar pendentes” (em `/admin/payments`) reconsulta `GET /pix?id=` das cobranças Pix pendentes há mais de 10 minutos (até 15 por vez, 8 s de orçamento) pelo mesmo caminho do “Já paguei”, e registra o resultado agregado na auditoria. Não há agendamento automático (exigiria um segredo de cron na Vercel).

## Rollback

`supabase/rollback/20261012*.down.sql` (gerados por `build-down-20261012.mjs` a partir das definições versionadas). O de `20261012000000` **recusa rodar** se existir vitalício. Prova em `docs/qa/mission-08-admin-control-center-golive.md`.
