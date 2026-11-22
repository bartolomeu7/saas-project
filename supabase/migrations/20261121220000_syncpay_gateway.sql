-- =============================================================================
-- Gateway de pagamento: SyncPay no lugar da EvoPay (Pix e cartão, cobrança avulsa que concede N dias de acesso).
--  - subscription_payments: charge_method ('pix'|'card'), card_brand, card_last4, card_submitted_at, card_attempts, status_checks
--    (consultas de contingência feitas ao provedor: a SyncPay aceita no máximo 5 por transação).
--  - claim_gateway_payment(): reserva idempotente por empresa+plano+forma (substitui claim_subscription_payment, que continua
--    existindo só para o código antigo durante a troca da imagem).
--  - confirm_subscription_payment(): passa a aceitar os provedores 'evopay' (histórico) e 'syncpay'.
--  - painel: integrações, reconciliação, resumo e diagnóstico enxergam os dois provedores.
-- Linhas antigas (EvoPay) não mudam. Reversão: supabase/rollback/20261121220000_syncpay_gateway.down.sql
-- =============================================================================
begin;

alter table public.subscription_payments
  add column if not exists charge_method text,
  add column if not exists card_brand text,
  add column if not exists card_last4 text,
  add column if not exists card_submitted_at timestamptz,
  add column if not exists card_attempts smallint not null default 0,
  add column if not exists status_checks smallint not null default 0;

alter table public.subscription_payments
  drop constraint if exists subscription_payments_charge_method_check;
alter table public.subscription_payments
  add constraint subscription_payments_charge_method_check check (charge_method is null or charge_method in ('pix', 'card'));

-- no máximo UMA cobrança aberta por empresa + plano + forma de pagamento
create unique index if not exists subscription_payments_one_open_syncpay_charge_idx
  on public.subscription_payments (company_id, plan_id, (coalesce(charge_method, 'pix')))
  where provider = 'syncpay' and status = 'pending';

create or replace function public.claim_gateway_payment(
  p_company_id uuid,
  p_plan_id uuid,
  p_amount numeric,
  p_currency text default 'BRL',
  p_method text default 'pix',
  p_stale_seconds integer default 120
)
returns table(payment_id uuid, created boolean, has_charge boolean, payment_status public.subscription_payment_status)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_plan public.plans;
  v_existing public.subscription_payments;
  v_sub_id uuid;
  v_id uuid;
  v_method text := lower(btrim(coalesce(p_method, 'pix')));
begin
  if p_company_id is null or p_plan_id is null or p_amount is null then
    raise exception 'Parâmetros inválidos.';
  end if;
  if v_method not in ('pix', 'card') then
    raise exception 'Forma de pagamento inválida.';
  end if;
  if not exists (select 1 from public.companies where id = p_company_id) then
    raise exception 'Empresa não encontrada.';
  end if;

  select * into v_plan from public.plans where id = p_plan_id;
  if not found or v_plan.status <> 'active' then
    raise exception 'Plano indisponível.';
  end if;
  if v_plan.price is null or v_plan.price <= 0 or v_plan.trial or v_plan.access_duration_days is null then
    raise exception 'Plano sem preço ou duração fixa.';
  end if;
  -- o valor vem do plano no banco: o chamador só confirma o que leu
  if round(p_amount, 2) <> round(v_plan.price, 2) then
    raise exception 'O valor informado não corresponde ao preço do plano.';
  end if;
  if coalesce(p_currency, '') <> coalesce(v_plan.currency, 'BRL') then
    raise exception 'Moeda diferente da do plano.';
  end if;

  -- serializa as reservas da mesma intenção (empresa + plano)
  perform pg_advisory_xact_lock(hashtext('billing_claim:' || p_company_id::text || ':' || p_plan_id::text));

  select * into v_existing
    from public.subscription_payments
   where company_id = p_company_id and plan_id = p_plan_id
     and provider = 'syncpay' and status = 'pending'
     and coalesce(charge_method, 'pix') = v_method
   for update;

  if found then
    if v_method = 'pix' then
      if v_existing.provider_transaction_id is not null then
        -- cobrança aberta já criada no provedor: reutiliza (mesma intenção)
        return query select v_existing.id, false, true, v_existing.status;
        return;
      end if;
      if v_existing.created_at > now() - make_interval(secs => greatest(coalesce(p_stale_seconds, 120), 30)) then
        -- outra requisição está criando a cobrança agora
        return query select v_existing.id, false, false, v_existing.status;
        return;
      end if;
      update public.subscription_payments
         set status = 'failed',
             notes = coalesce(notes || ' | ', '') || 'Reserva abandonada antes de ser criada no provedor.'
       where id = v_existing.id;
    else
      -- cartão: a reserva só guarda a intenção; a cobrança acontece depois, com o token do iFrame
      if v_existing.card_submitted_at is null and v_existing.created_at > now() - interval '1 hour' then
        return query select v_existing.id, false, true, v_existing.status;
        return;
      end if;
      if v_existing.card_submitted_at is not null and v_existing.card_submitted_at > now() - interval '30 minutes' then
        -- cobrança enviada há pouco: aguarda o webhook, não abre outra (o provedor não tem idempotência no cartão)
        return query select v_existing.id, false, true, v_existing.status;
        return;
      end if;
      update public.subscription_payments
         set status = case when card_submitted_at is null then 'expired'::public.subscription_payment_status else 'failed'::public.subscription_payment_status end,
             notes = coalesce(notes || ' | ', '') || 'Reserva de cartão encerrada sem confirmação.'
       where id = v_existing.id;
    end if;
  end if;

  select id into v_sub_id from public.subscriptions where company_id = p_company_id;

  insert into public.subscription_payments (company_id, subscription_id, plan_id, provider, status, amount, currency, charge_method)
  values (p_company_id, v_sub_id, p_plan_id, 'syncpay', 'pending', v_plan.price, v_plan.currency, v_method)
  returning id into v_id;

  return query select v_id, true, (v_method = 'card'), 'pending'::public.subscription_payment_status;
end;
$function$;

CREATE OR REPLACE FUNCTION public.confirm_subscription_payment(p_payment_id uuid, p_provider_status subscription_payment_status, p_end_to_end_id text, p_event_id text, p_event_type text, p_event_payload jsonb, p_provider_amount numeric DEFAULT NULL::numeric)
 RETURNS TABLE(ok boolean, new_status subscription_payment_status, already_processed boolean, not_found boolean, rejection text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_payment public.subscription_payments;
  v_event public.payment_events;
  v_plan public.plans;
  v_subscription public.subscriptions;
  v_now timestamptz := now();
  v_base timestamptz;
  v_new_expires timestamptz;
  v_sub_id uuid;
  v_amount numeric := p_provider_amount;
begin
  if v_amount is null and jsonb_typeof(p_event_payload -> 'amount') = 'number' then
    v_amount := (p_event_payload ->> 'amount')::numeric;
  end if;

  select * into v_payment from public.subscription_payments where id = p_payment_id for update;

  if not found then
    return query select false, 'pending'::public.subscription_payment_status, false, true, null::text;
    return;
  end if;

  select * into v_event from public.payment_events where provider = v_payment.provider and event_id = p_event_id;
  if found then
    if v_event.subscription_payment_id is distinct from p_payment_id then
      return query select false, v_payment.status, false, false, 'EVENT_PAYMENT_MISMATCH'::text;
      return;
    end if;
  else
    insert into public.payment_events (provider, event_id, event_type, payload, subscription_payment_id, processed)
    values (v_payment.provider, p_event_id, p_event_type, p_event_payload, p_payment_id, false)
    returning * into v_event;
  end if;

  if v_event.processed then
    return query select true, v_payment.status, true, false, null::text;
    return;
  end if;

  if v_payment.status = 'paid' then
    if p_provider_status = 'refunded' then
      update public.subscription_payments set status = 'refunded' where id = p_payment_id;
      update public.payment_events set processed = true, processed_at = v_now where id = v_event.id;
      return query select true, 'refunded'::public.subscription_payment_status, false, false, null::text;
      return;
    end if;
    update public.payment_events set processed = true, processed_at = v_now where id = v_event.id;
    return query select true, v_payment.status, false, false, null::text;
    return;
  end if;

  if v_payment.status = 'refunded' then
    if p_provider_status = 'paid' then
      return query select false, v_payment.status, false, false, 'REFUNDED_TERMINAL'::text;
      return;
    end if;
    update public.payment_events set processed = true, processed_at = v_now where id = v_event.id;
    return query select true, v_payment.status, false, false, null::text;
    return;
  end if;

  if p_provider_status = v_payment.status or p_provider_status = 'pending' then
    update public.payment_events set processed = true, processed_at = v_now where id = v_event.id;
    return query select true, v_payment.status, false, false, null::text;
    return;
  end if;

  if p_provider_status = 'paid' then
    if v_payment.provider not in ('evopay', 'syncpay') or v_payment.provider_transaction_id is null then
      return query select false, v_payment.status, false, false, 'NO_PROVIDER_CHARGE'::text;
      return;
    end if;
    if v_amount is null then
      return query select false, v_payment.status, false, false, 'AMOUNT_MISSING'::text;
      return;
    end if;
    if round(v_amount, 2) <> round(v_payment.amount, 2) then
      return query select false, v_payment.status, false, false, 'AMOUNT_MISMATCH'::text;
      return;
    end if;
    select * into v_plan from public.plans where id = v_payment.plan_id;
    if not found or v_plan.access_duration_days is null then
      return query select false, v_payment.status, false, false, 'PLAN_NOT_BILLABLE'::text;
      return;
    end if;

    perform pg_advisory_xact_lock(hashtext('company_access:' || v_payment.company_id::text));

    update public.subscription_payments
       set status = 'paid',
           end_to_end_id = coalesce(p_end_to_end_id, end_to_end_id),
           paid_at = coalesce(paid_at, v_now)
     where id = p_payment_id;

    select * into v_subscription from public.subscriptions where company_id = v_payment.company_id for update;

    if found and v_subscription.lifetime then
      -- LIFETIME: pagamento registrado, acesso permanente NÃO é alterado (nem encurtado nem estendido).
      update public.subscription_payments set subscription_id = coalesce(subscription_id, v_subscription.id) where id = p_payment_id;
    else
      v_base := v_now;
      if found and v_subscription.status in ('active', 'trialing') and v_subscription.expires_at > v_now then
        v_base := v_subscription.expires_at;
      end if;
      v_new_expires := v_base + make_interval(days => v_plan.access_duration_days);

      perform public.platform_apply_access(v_payment.company_id, v_plan.id, 'active'::public.subscription_status, v_new_expires, null, v_payment.provider);
      update public.subscriptions set provider = v_payment.provider where company_id = v_payment.company_id;
      select id into v_sub_id from public.subscriptions where company_id = v_payment.company_id;
      update public.subscription_payments set subscription_id = coalesce(subscription_id, v_sub_id) where id = p_payment_id;
    end if;
  else
    update public.subscription_payments
       set status = p_provider_status,
           end_to_end_id = coalesce(p_end_to_end_id, end_to_end_id)
     where id = p_payment_id;
  end if;

  update public.payment_events set processed = true, processed_at = v_now where id = v_event.id;
  return query select true, p_provider_status, false, false, null::text;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.platform_integrations_status()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.is_platform_admin() then
    raise exception 'not authorized';
  end if;

  return jsonb_build_object(
    'evopay', (
      select jsonb_build_object(
        'deliveries_24h', count(*) filter (where received_at >= now() - interval '24 hours'),
        'processed_24h', count(*) filter (where received_at >= now() - interval '24 hours' and outcome = 'processed'),
        'errors_24h', count(*) filter (where received_at >= now() - interval '24 hours' and outcome = 'error'),
        'unmatched_24h', count(*) filter (where received_at >= now() - interval '24 hours' and outcome = 'payment_not_found'),
        'last_delivery_at', max(received_at),
        'last_error_at', max(received_at) filter (where outcome = 'error'),
        'pending_payments', (select count(*) from public.subscription_payments where provider = 'evopay' and status = 'pending'),
        'pending_older_1h', (select count(*) from public.subscription_payments where provider = 'evopay' and status = 'pending' and created_at < now() - interval '1 hour'),
        'last_paid_at', (select max(paid_at) from public.subscription_payments where provider = 'evopay' and status = 'paid'),
        'events_total', (select count(*) from public.payment_events where provider = 'evopay'),
        'events_unprocessed', (select count(*) from public.payment_events where provider = 'evopay' and not processed)
      ) from public.webhook_deliveries where provider = 'evopay'
    ),
    'syncpay', (
      select jsonb_build_object(
        'deliveries_24h', count(*) filter (where received_at >= now() - interval '24 hours'),
        'processed_24h', count(*) filter (where received_at >= now() - interval '24 hours' and outcome = 'processed'),
        'errors_24h', count(*) filter (where received_at >= now() - interval '24 hours' and outcome = 'error'),
        'unmatched_24h', count(*) filter (where received_at >= now() - interval '24 hours' and outcome = 'payment_not_found'),
        'last_delivery_at', max(received_at),
        'last_error_at', max(received_at) filter (where outcome = 'error'),
        'pending_payments', (select count(*) from public.subscription_payments where provider = 'syncpay' and status = 'pending'),
        'pending_older_1h', (select count(*) from public.subscription_payments where provider = 'syncpay' and status = 'pending' and created_at < now() - interval '1 hour'),
        'last_paid_at', (select max(paid_at) from public.subscription_payments where provider = 'syncpay' and status = 'paid'),
        'events_total', (select count(*) from public.payment_events where provider = 'syncpay'),
        'events_unprocessed', (select count(*) from public.payment_events where provider = 'syncpay' and not processed)
      ) from public.webhook_deliveries where provider = 'syncpay'
    ),
    'clerk', (
      select jsonb_build_object(
        'profiles_total', count(*),
        'profiles_linked', count(*) filter (where clerk_user_id is not null),
        'profiles_unlinked', count(*) filter (where clerk_user_id is null),
        'last_login_at', max(last_login_at),
        'webhook_configured', false
      ) from public.profiles
    ),
    'supabase', jsonb_build_object(
      'database', 'ok',
      'checked_at', now(),
      'companies', (select count(*) from public.companies),
      'audit_logs_total', (select count(*) from public.audit_logs)
    )
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.platform_reconcile_candidates(p_limit integer DEFAULT 25, p_min_age_minutes integer DEFAULT 10)
 RETURNS TABLE(payment_id uuid, company_id uuid, company_name text, created_at timestamp with time zone, age_minutes integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
declare
  v_limit integer := least(greatest(coalesce(p_limit, 25), 1), 50);
  v_age integer := least(greatest(coalesce(p_min_age_minutes, 10), 1), 10080);
begin
  if not public.is_platform_admin() then
    raise exception 'not authorized';
  end if;

  return query
  select sp.id, sp.company_id, c.name, sp.created_at,
         greatest(0, floor(extract(epoch from (now() - sp.created_at)) / 60))::integer
    from public.subscription_payments sp
    join public.companies c on c.id = sp.company_id
   where sp.provider in ('evopay', 'syncpay')
     and sp.status = 'pending'
     and sp.status_checks < 4
     and sp.provider_transaction_id is not null
     and sp.created_at < now() - make_interval(mins => v_age)
     and sp.created_at > now() - interval '30 days'
   order by sp.created_at
   limit v_limit;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_platform_dashboard()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_actor uuid := public.current_profile_user_id();
  v_super boolean := public.is_super_admin();
  v_online integer := public.platform_setting_int('presence_online_seconds', 120);
  v_recent integer := public.platform_setting_int('presence_recent_minutes', 15);
  v_result jsonb;
begin
  if not public.is_platform_admin() then
    raise exception 'not authorized';
  end if;

  select jsonb_build_object(
    'generated_at', now(),
    'users', (
      select jsonb_build_object(
        'total', count(*),
        'active', count(*) filter (where status = 'active'),
        'suspended', count(*) filter (where status = 'suspended'),
        'inactive', count(*) filter (where status = 'inactive'),
        'admins', count(*) filter (where role in ('admin', 'super_admin')),
        'new_7d', count(*) filter (where created_at >= now() - interval '7 days'),
        'new_30d', count(*) filter (where created_at >= now() - interval '30 days')
      ) from public.profiles
    ),
    'presence', (
      select jsonb_build_object(
        'online_now', count(*) filter (where last_seen_at >= now() - make_interval(secs => v_online)),
        'recent', count(*) filter (where last_seen_at >= now() - make_interval(mins => v_recent)),
        'seen_24h', count(*) filter (where last_seen_at >= now() - interval '24 hours'),
        'online_seconds', v_online, 'recent_minutes', v_recent
      ) from public.user_presence
    ),
    'companies', (
      select jsonb_build_object(
        'total', count(*),
        'active', count(*) filter (where status = 'active'),
        'inactive', count(*) filter (where status = 'inactive'),
        'new_30d', count(*) filter (where created_at >= now() - interval '30 days')
      ) from public.companies
    ),
    'subscriptions', (
      select jsonb_build_object(
        'active', count(*) filter (where status = 'active' and (lifetime or expires_at > now())),
        'trialing', count(*) filter (where status = 'trialing' and (lifetime or expires_at > now())),
        'expired', count(*) filter (where status in ('active', 'trialing') and not lifetime and expires_at <= now()) + count(*) filter (where status = 'expired'),
        'cancelled', count(*) filter (where status = 'cancelled'),
        'pending', count(*) filter (where status = 'pending'),
        'lifetime', count(*) filter (where lifetime and status = 'active'),
        'expiring_7d', count(*) filter (where status in ('active', 'trialing') and expires_at > now() and expires_at <= now() + interval '7 days'),
        'expiring_30d', count(*) filter (where status in ('active', 'trialing') and expires_at > now() and expires_at <= now() + interval '30 days'),
        'companies_without_subscription', (select count(*) from public.companies c where not exists (select 1 from public.subscriptions s where s.company_id = c.id))
      ) from public.subscriptions
    ),
    'revenue', (
      select jsonb_build_object(
        'currency', 'BRL',
        'paid_total', coalesce(sum(amount) filter (where status = 'paid'), 0),
        'paid_30d', coalesce(sum(amount) filter (where status = 'paid' and coalesce(paid_at, created_at) >= now() - interval '30 days'), 0),
        'paid_prev_30d', coalesce(sum(amount) filter (where status = 'paid' and coalesce(paid_at, created_at) >= now() - interval '60 days' and coalesce(paid_at, created_at) < now() - interval '30 days'), 0),
        'paid_count_30d', count(*) filter (where status = 'paid' and coalesce(paid_at, created_at) >= now() - interval '30 days'),
        'pending_total', coalesce(sum(amount) filter (where status = 'pending'), 0),
        'pending_count', count(*) filter (where status = 'pending'),
        'manual_30d', coalesce(sum(amount) filter (where status = 'paid' and provider = 'manual' and coalesce(paid_at, created_at) >= now() - interval '30 days'), 0),
        'evopay_30d', coalesce(sum(amount) filter (where status = 'paid' and provider = 'evopay' and coalesce(paid_at, created_at) >= now() - interval '30 days'), 0),
        'gateway_30d', coalesce(sum(amount) filter (where status = 'paid' and provider in ('evopay', 'syncpay') and coalesce(paid_at, created_at) >= now() - interval '30 days'), 0),
        'refunded_total', coalesce(sum(amount) filter (where status = 'refunded'), 0)
      ) from public.subscription_payments
    ),
    -- Estimativa derivada: soma de preço/duração*30 das assinaturas pagas ativas (não é receita contábil).
    'mrr_estimate', (
      select coalesce(round(sum(pl.price / nullif(pl.access_duration_days, 0) * 30), 2), 0)
      from public.subscriptions s join public.plans pl on pl.id = s.plan_id
      where s.status = 'active' and not s.lifetime and s.expires_at > now() and not pl.trial and pl.price > 0
    ),
    'payments_by_day', coalesce((
      select jsonb_agg(jsonb_build_object('day', d.day, 'total', coalesce(p.total, 0), 'count', coalesce(p.cnt, 0)) order by d.day)
      from (select generate_series((now() - interval '29 days')::date, now()::date, interval '1 day')::date as day) d
      left join (
        select coalesce(paid_at, created_at)::date as day, sum(amount) total, count(*) cnt
        from public.subscription_payments
        where status = 'paid' and coalesce(paid_at, created_at) >= (now() - interval '29 days')::date
        group by 1
      ) p on p.day = d.day
    ), '[]'::jsonb),
    'signups_by_day', coalesce((
      select jsonb_agg(jsonb_build_object('day', d.day, 'users', coalesce(u.cnt, 0), 'companies', coalesce(c.cnt, 0)) order by d.day)
      from (select generate_series((now() - interval '29 days')::date, now()::date, interval '1 day')::date as day) d
      left join (select created_at::date as day, count(*) cnt from public.profiles
                 where created_at >= (now() - interval '29 days')::date group by 1) u on u.day = d.day
      left join (select created_at::date as day, count(*) cnt from public.companies
                 where created_at >= (now() - interval '29 days')::date group by 1) c on c.day = d.day
    ), '[]'::jsonb),
    'subscriptions_by_plan', coalesce((
      select jsonb_agg(jsonb_build_object('plan_code', g.code, 'plan_name', g.name, 'count', g.cnt) order by g.cnt desc)
      from (select pl.code, pl.name, count(*) cnt from public.subscriptions s join public.plans pl on pl.id = s.plan_id
            where s.status in ('active', 'trialing') and (s.lifetime or s.expires_at > now()) group by pl.code, pl.name) g
    ), '[]'::jsonb),
    'webhooks_24h', (
      select jsonb_build_object(
        'total', count(*),
        'processed', count(*) filter (where outcome = 'processed'),
        'ignored', count(*) filter (where outcome = 'ignored'),
        'payment_not_found', count(*) filter (where outcome = 'payment_not_found'),
        'error', count(*) filter (where outcome = 'error')
      ) from public.webhook_deliveries where received_at >= now() - interval '24 hours'
    ),
    'recent_audit', coalesce((
      select jsonb_agg(jsonb_build_object('id', x.id, 'action', x.action, 'category', public.platform_audit_category(x.action),
                                          'created_at', x.created_at, 'actor_email', x.email) order by x.created_at desc)
      from (select a.id, a.action, a.created_at, ap.email from public.audit_logs a
            left join public.profiles ap on ap.user_id = a.actor_user_id
            where (v_super or a.actor_user_id = v_actor)
            order by a.created_at desc limit 8) x
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.platform_diagnostics()
 RETURNS TABLE(check_key text, label text, severity text, affected bigint, hint text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
             where e.plan_id <> s.plan_id or e.status <> s.status
                or e.access_expires_at is distinct from s.expires_at or e.lifetime <> s.lifetime),
           'Use "Sincronizar entitlements" na empresa.'
    union all
    select 'subscriptions_stale_status', 'Assinaturas vencidas ainda marcadas como ativas', 'warn',
           (select count(*) from public.subscriptions where status in ('active', 'trialing') and not lifetime and expires_at <= now()),
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
           (select count(*) from public.subscription_payments where status = 'pending' and provider <> 'manual' and not (charge_method = 'card' and card_submitted_at is null) and created_at < now() - interval '1 hour'),
           'Reverifique o pagamento em Pagamentos (consulta o gateway de pagamento) ou use "Reconciliar pendentes".'
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
             where c.status = 'inactive' and s.status in ('active', 'trialing') and (s.lifetime or s.expires_at > now())),
           'Revise o status da empresa.'
    union all
    select 'refunded_with_access', 'Pagamentos estornados com acesso ainda ativo', 'warn',
           (select count(distinct sp.id) from public.subscription_payments sp join public.subscriptions s on s.company_id = sp.company_id
             where sp.status = 'refunded' and s.status in ('active', 'trialing') and (s.lifetime or s.expires_at > now())),
           'O estorno não revoga o acesso automaticamente: revise a empresa e, se for o caso, ajuste o vencimento ou cancele a assinatura.'
    union all
    select 'payment_events_unprocessed', 'Eventos de pagamento não processados há mais de 1 hora', 'warn',
           (select count(*) from public.payment_events where not processed and created_at < now() - interval '1 hour'),
           'Confirmação rejeitada (valor divergente/ausente) ou falha: reverifique o pagamento e compare com o valor esperado.'
    union all
    select 'manual_payment_below_price', 'Pagamentos manuais com acesso e valor abaixo do preço do plano (90 dias)', 'warn',
           (select count(*) from public.subscription_payments sp join public.plans pl on pl.id = sp.plan_id
             where sp.provider = 'manual' and sp.status = 'paid' and sp.subscription_id is not null
               and pl.price is not null and sp.amount < pl.price and sp.created_at >= now() - interval '90 days'),
           'Confira se o desconto foi combinado com o cliente (campo Observação do pagamento).'
    union all
    select 'no_active_super_admin', 'Nenhum super administrador ativo', 'error',
           (select case when count(*) = 0 then 1 else 0 end from public.profiles where role = 'super_admin' and status = 'active'),
           'Crítico: promova um super_admin pelo banco.'
  )
  select c.k, c.l, case when c.n = 0 then 'ok' else c.sev end, c.n, c.h from checks c;
end;
$function$
;

revoke all on function public.claim_gateway_payment(uuid, uuid, numeric, text, text, integer) from public, anon, authenticated;
grant execute on function public.claim_gateway_payment(uuid, uuid, numeric, text, text, integer) to service_role;

notify pgrst, 'reload schema';

commit;
