-- =============================================================================
-- ROLLBACK de 20261011000000_billing_hardening.sql (NÃO é uma migration: fica fora de supabase/migrations de propósito).
-- Volta ao estado anterior (Production hoje): confirm_subscription_payment de 6 argumentos (migration 019) e
-- platform_diagnostics de 11 verificações (migration 20261009030000). Executar como postgres, numa transação.
--
-- O que NÃO é desfeito: a higienização das cobranças pendentes duplicadas (as antigas viraram 'cancelled') e
-- eventos de pagamento já gravados. Rollback do CÓDIGO: reimplantar o deployment anterior (o código antigo funciona
-- com este estado do banco).
-- Testado em TEST em transação revertida (docs/qa/mission-07-1-release-readiness.md).
-- =============================================================================
begin;

drop function if exists public.claim_subscription_payment(uuid, uuid, numeric, text, integer);
drop function if exists public.confirm_subscription_payment(uuid, public.subscription_payment_status, text, text, text, jsonb, numeric);
drop index if exists public.subscription_payments_one_open_evopay_charge_idx;

-- ---- confirm_subscription_payment (6 argumentos), como na migration 019
create or replace function public.confirm_subscription_payment(
  p_payment_id uuid,
  p_provider_status public.subscription_payment_status,
  p_end_to_end_id text,
  p_event_id text,
  p_event_type text,
  p_event_payload jsonb
)
returns table (
  ok boolean,
  new_status public.subscription_payment_status,
  already_processed boolean,
  not_found boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.subscription_payments;
  v_event_processed boolean;
  v_event_exists boolean;
  v_plan public.plans;
  v_subscription public.subscriptions;
  v_now timestamptz := now();
  v_base_date timestamptz;
  v_new_expires_at timestamptz;
begin
  -- Trava a linha do pagamento: serializa TODAS as chamadas concorrentes
  -- de confirmação para este paymentId específico. A segunda chamada só
  -- prossegue depois que a primeira já commitou (ou desistiu) — nunca lê
  -- um estado "no meio do caminho".
  select * into v_payment from public.subscription_payments where id = p_payment_id for update;

  if not found then
    return query select false, 'pending'::public.subscription_payment_status, false, true;
    return;
  end if;

  -- Idempotência via payment_events, agora DENTRO do lock da linha do
  -- pagamento (antes, o INSERT concorrente na mesma unique constraint
  -- falhava silenciosamente sem que o código verificasse o erro).
  select exists(
    select 1 from public.payment_events where provider = 'evopay' and event_id = p_event_id
  ) into v_event_exists;

  if v_event_exists then
    select processed into v_event_processed
      from public.payment_events where provider = 'evopay' and event_id = p_event_id;
  else
    insert into public.payment_events (provider, event_id, event_type, payload, subscription_payment_id, processed)
    values ('evopay', p_event_id, p_event_type, p_event_payload, p_payment_id, false);
    v_event_processed := false;
  end if;

  if v_event_processed then
    return query select true, v_payment.status, true, false;
    return;
  end if;

  -- Já estava pago antes desta chamada: nunca reprocessa a renovação —
  -- é exatamente isso que impede conceder o período em dobro.
  if v_payment.status = 'paid' then
    update public.payment_events set processed = true, processed_at = v_now
      where provider = 'evopay' and event_id = p_event_id;
    return query select true, v_payment.status, false, false;
    return;
  end if;

  if p_provider_status = v_payment.status then
    update public.payment_events set processed = true, processed_at = v_now
      where provider = 'evopay' and event_id = p_event_id;
    return query select true, p_provider_status, false, false;
    return;
  end if;

  update public.subscription_payments
    set status = p_provider_status,
        end_to_end_id = coalesce(p_end_to_end_id, end_to_end_id),
        paid_at = case when p_provider_status = 'paid' and paid_at is null then v_now else paid_at end
    where id = p_payment_id;

  if p_provider_status = 'paid' then
    -- Trava a subscription da empresa (protege contra dois PAGAMENTOS
    -- DIFERENTES da mesma empresa renovando ao mesmo tempo — cenário mais
    -- raro que o principal, mas a mesma classe de corrida).
    select * into v_subscription from public.subscriptions where company_id = v_payment.company_id for update;
    select * into v_plan from public.plans where id = v_payment.plan_id;

    if v_plan.id is not null and v_plan.access_duration_days is not null then
      v_base_date := v_now;
      if v_subscription.id is not null
         and v_subscription.status in ('active', 'trialing')
         and v_subscription.expires_at > v_now then
        v_base_date := v_subscription.expires_at;
      end if;

      v_new_expires_at := v_base_date + (v_plan.access_duration_days || ' days')::interval;

      if v_subscription.id is not null then
        update public.subscriptions
          set plan_id = v_plan.id, status = 'active', expires_at = v_new_expires_at, provider = 'evopay'
          where company_id = v_payment.company_id;
      else
        insert into public.subscriptions (company_id, plan_id, status, starts_at, expires_at, provider)
        values (v_payment.company_id, v_plan.id, 'active', v_now, v_new_expires_at, 'evopay');
      end if;

      insert into public.company_entitlements (
        company_id, plan_id, status, access_starts_at, access_expires_at,
        max_additional_users, support_enabled, tickets_enabled,
        exclusive_groups_enabled, early_access_enabled
      ) values (
        v_payment.company_id, v_plan.id, 'active',
        coalesce(v_subscription.starts_at, v_now), v_new_expires_at,
        v_plan.additional_user_limit, v_plan.support_enabled, v_plan.tickets_enabled,
        v_plan.exclusive_groups_enabled, v_plan.early_access_enabled
      )
      on conflict (company_id) do update set
        plan_id = excluded.plan_id,
        status = excluded.status,
        access_starts_at = excluded.access_starts_at,
        access_expires_at = excluded.access_expires_at,
        max_additional_users = excluded.max_additional_users,
        support_enabled = excluded.support_enabled,
        tickets_enabled = excluded.tickets_enabled,
        exclusive_groups_enabled = excluded.exclusive_groups_enabled,
        early_access_enabled = excluded.early_access_enabled,
        updated_at = v_now;
    end if;
  end if;

  update public.payment_events set processed = true, processed_at = v_now
    where provider = 'evopay' and event_id = p_event_id;

  return query select true, p_provider_status, false, false;
end;
$$;

comment on function public.confirm_subscription_payment(uuid, public.subscription_payment_status, text, text, text, jsonb) is
  'Único ponto de escrita atômico para confirmação de pagamento Pix (EvoPay) + renovação de assinatura. Trava subscription_payments (e, se for pagamento confirmado, subscriptions) com FOR UPDATE antes de decidir e escrever — corrige a corrida em que duas confirmações concorrentes do mesmo pagamento podiam conceder o dobro do período pago. Chamado por src/lib/billing/confirm-payment.ts (createAdminClient), nunca pelo client.';

-- SECURITY DEFINER com privilégios amplos sobre dados de billing: só o
-- backend (service_role, via createAdminClient) pode chamar.
revoke all on function public.confirm_subscription_payment(uuid, public.subscription_payment_status, text, text, text, jsonb) from public;
revoke all on function public.confirm_subscription_payment(uuid, public.subscription_payment_status, text, text, text, jsonb) from anon;
revoke all on function public.confirm_subscription_payment(uuid, public.subscription_payment_status, text, text, text, jsonb) from authenticated;
grant execute on function public.confirm_subscription_payment(uuid, public.subscription_payment_status, text, text, text, jsonb) to service_role;

-- ---- platform_diagnostics (11 verificações), como na migration 20261009030000
create or replace function public.platform_diagnostics()
 returns table (check_key text, label text, severity text, affected bigint, hint text)
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if not public.is_platform_admin() then
    raise exception 'not authorized';
  end if;

  return query
  with checks as (
    select 'entitlements_missing'::text k, 'Assinaturas sem projeção de entitlements'::text l, 'error'::text sev,
           (select count(*) from public.subscriptions s where not exists (select 1 from public.company_entitlements e where e.company_id = s.company_id)) n,
           'Use "Sincronizar entitlements" na empresa.'::text h
    union all
    select 'entitlements_mismatch', 'Entitlements divergentes da assinatura', 'error',
           (select count(*) from public.subscriptions s join public.company_entitlements e on e.company_id = s.company_id
             where e.plan_id <> s.plan_id or e.status <> s.status or e.access_expires_at <> s.expires_at),
           'Use "Sincronizar entitlements" na empresa.'
    union all
    select 'subscriptions_stale_status', 'Assinaturas vencidas ainda marcadas como ativas', 'warn',
           (select count(*) from public.subscriptions where status in ('active', 'trialing') and expires_at <= now()),
           'Ação rápida: marcar assinaturas vencidas como expiradas (o acesso já é bloqueado pela data).'
    union all
    select 'companies_without_owner', 'Empresas sem proprietário', 'warn',
           (select count(*) from public.companies c where not exists (select 1 from public.company_members m where m.company_id = c.id and m.role = 'owner')),
           'Revise a empresa em Empresas.'
    union all
    select 'companies_without_subscription', 'Empresas sem assinatura', 'warn',
           (select count(*) from public.companies c where not exists (select 1 from public.subscriptions s where s.company_id = c.id)),
           'Conceda acesso em Usuários/Empresas se necessário.'
    union all
    select 'profiles_unlinked', 'Perfis sem vínculo com o Clerk', 'warn',
           (select count(*) from public.profiles where clerk_user_id is null),
           'Perfis legados: o vínculo é feito no primeiro login pelo Clerk.'
    union all
    select 'payments_pending_old', 'Pagamentos PIX pendentes há mais de 1 hora', 'warn',
           (select count(*) from public.subscription_payments where status = 'pending' and provider <> 'manual' and created_at < now() - interval '1 hour'),
           'Reverifique o pagamento em Pagamentos (consulta o EvoPay).'
    union all
    select 'webhook_errors_24h', 'Webhooks com erro nas últimas 24h', 'error',
           (select count(*) from public.webhook_deliveries where outcome = 'error' and received_at >= now() - interval '24 hours'),
           'Veja Integrações > Entregas.'
    union all
    select 'webhook_unmatched_24h', 'Webhooks sem pagamento correspondente (24h)', 'warn',
           (select count(*) from public.webhook_deliveries where outcome = 'payment_not_found' and received_at >= now() - interval '24 hours'),
           'Veja Integrações > Entregas.'
    union all
    select 'inactive_company_with_access', 'Empresas inativas com acesso ativo', 'warn',
           (select count(*) from public.companies c join public.subscriptions s on s.company_id = c.id
             where c.status = 'inactive' and s.status in ('active', 'trialing') and s.expires_at > now()),
           'Revise o status da empresa.'
    union all
    select 'no_active_super_admin', 'Nenhum super administrador ativo', 'error',
           (select case when count(*) = 0 then 1 else 0 end from public.profiles where role = 'super_admin' and status = 'active'),
           'Crítico: promova um super_admin pelo banco.'
  )
  select c.k, c.l, case when c.n = 0 then 'ok' else c.sev end, c.n, c.h from checks c;
end;
$function$;
revoke all on function public.platform_diagnostics() from public, anon;
grant execute on function public.platform_diagnostics() to authenticated;

commit;
