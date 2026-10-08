-- =============================================================================
-- Admin Control Center — INSIGHTS e FERRAMENTAS (somente TEST nesta fase)
--
-- Central de auditoria, dashboard com dados reais, busca global, diagnósticos,
-- ações rápidas seguras, webhooks/integrações e edição de empresa.
-- Tudo SECURITY DEFINER atrás de is_platform_admin(); ADMIN só enxerga os próprios
-- registros de auditoria (mesma regra da RLS de audit_logs); SUPER vê tudo.
-- Nada devolve payloads brutos, tokens, segredos nem service_role.
-- =============================================================================

-- ------------------------------------------------------------ list_platform_audit
create or replace function public.list_platform_audit(
  p_category text default null,
  p_search text default null,
  p_company_id uuid default null,
  p_actor_user_id uuid default null,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_limit integer default 25,
  p_offset integer default 0
)
 returns table (
  id uuid,
  action text,
  category text,
  created_at timestamptz,
  actor_user_id uuid,
  actor_email text,
  company_id uuid,
  company_name text,
  entity_type text,
  entity_id uuid,
  target_user_id uuid,
  target_email text,
  metadata jsonb,
  total_count bigint
 )
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
#variable_conflict use_column
declare
  v_actor uuid := public.current_profile_user_id();
  v_super boolean := public.is_super_admin();
  v_pattern text;
  v_limit integer := least(greatest(coalesce(p_limit, 25), 1), 100);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
begin
  if not public.is_platform_admin() then
    raise exception 'not authorized';
  end if;
  if p_category is not null and p_category not in (
    'USER_MANAGEMENT', 'ROLE_CHANGE', 'STATUS_CHANGE', 'ACCESS_EXTENSION', 'PLAN_CHANGE', 'SUBSCRIPTION_CHANGE',
    'MANUAL_PAYMENT', 'PAYMENT', 'ADMIN_ACTION', 'SYSTEM', 'WEBHOOK', 'INTEGRATION'
  ) then
    raise exception 'Categoria inválida.';
  end if;
  if nullif(trim(coalesce(p_search, '')), '') is not null then
    v_pattern := '%' || replace(replace(replace(trim(p_search), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;

  return query
  select a.id, a.action, public.platform_audit_category(a.action), a.created_at, a.actor_user_id, ap.email,
         a.company_id, c.name, a.entity_type, a.entity_id, a.target_user_id, tp.email,
         public.platform_safe_metadata(a.metadata), count(*) over ()
  from public.audit_logs a
  left join public.profiles ap on ap.user_id = a.actor_user_id
  left join public.profiles tp on tp.user_id = a.target_user_id
  left join public.companies c on c.id = a.company_id
  where (v_super or a.actor_user_id = v_actor)
    and (p_category is null or public.platform_audit_category(a.action) = p_category)
    and (p_company_id is null or a.company_id = p_company_id)
    and (p_actor_user_id is null or a.actor_user_id = p_actor_user_id)
    and (p_from is null or a.created_at >= p_from)
    and (p_to is null or a.created_at < p_to)
    and (v_pattern is null or a.action ilike v_pattern escape '\' or ap.email ilike v_pattern escape '\'
         or tp.email ilike v_pattern escape '\' or c.name ilike v_pattern escape '\')
  order by a.created_at desc, a.id
  limit v_limit offset v_offset;
end;
$function$;
revoke all on function public.list_platform_audit(text, text, uuid, uuid, timestamptz, timestamptz, integer, integer) from public, anon;
grant execute on function public.list_platform_audit(text, text, uuid, uuid, timestamptz, timestamptz, integer, integer) to authenticated;

-- ---------------------------------------------------------- get_platform_dashboard
create or replace function public.get_platform_dashboard()
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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
        'active', count(*) filter (where status = 'active' and expires_at > now()),
        'trialing', count(*) filter (where status = 'trialing' and expires_at > now()),
        'expired', count(*) filter (where status in ('active', 'trialing') and expires_at <= now()) + count(*) filter (where status = 'expired'),
        'cancelled', count(*) filter (where status = 'cancelled'),
        'pending', count(*) filter (where status = 'pending'),
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
        'manual_30d', coalesce(sum(amount) filter (where status = 'paid' and provider = 'manual' and coalesce(paid_at, created_at) >= now() - interval '30 days'), 0)
      ) from public.subscription_payments
    ),
    -- Estimativa derivada: soma de preço/duração*30 das assinaturas pagas ativas (não é receita contábil).
    'mrr_estimate', (
      select coalesce(round(sum(pl.price / nullif(pl.access_duration_days, 0) * 30), 2), 0)
      from public.subscriptions s join public.plans pl on pl.id = s.plan_id
      where s.status = 'active' and s.expires_at > now() and not pl.trial and pl.price > 0
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
            where s.status in ('active', 'trialing') and s.expires_at > now() group by pl.code, pl.name) g
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
$function$;
revoke all on function public.get_platform_dashboard() from public, anon;
grant execute on function public.get_platform_dashboard() to authenticated;

-- --------------------------------------------------------- platform_global_search
create or replace function public.platform_global_search(p_query text)
 returns table (kind text, id uuid, title text, subtitle text, extra text)
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
#variable_conflict use_column
declare
  v_q text := trim(coalesce(p_query, ''));
  v_pattern text;
begin
  if not public.is_platform_admin() then
    raise exception 'not authorized';
  end if;
  if char_length(v_q) < 2 or char_length(v_q) > 100 then
    raise exception 'Digite de 2 a 100 caracteres.';
  end if;
  v_pattern := '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%';

  return query
  (select 'user'::text, p.user_id, coalesce(p.full_name, p.email), p.email, p.role::text || ' · ' || p.status::text
     from public.profiles p
    where p.email ilike v_pattern escape '\' or p.full_name ilike v_pattern escape '\'
    order by p.created_at desc limit 8)
  union all
  (select 'company'::text, c.id, c.name, o.email, c.status::text
     from public.companies c
     left join lateral (select pr.email from public.company_members cm join public.profiles pr on pr.user_id = cm.user_id
                        where cm.company_id = c.id and cm.role = 'owner' order by cm.created_at limit 1) o on true
    where c.name ilike v_pattern escape '\' or o.email ilike v_pattern escape '\'
    order by c.created_at desc limit 8)
  union all
  (select 'payment'::text, sp.id, c.name, coalesce(sp.external_reference, sp.provider_transaction_id),
          sp.provider || ' · ' || sp.status::text || ' · ' || sp.amount::text
     from public.subscription_payments sp join public.companies c on c.id = sp.company_id
    where sp.external_reference ilike v_pattern escape '\' or sp.provider_transaction_id ilike v_pattern escape '\'
       or sp.end_to_end_id ilike v_pattern escape '\'
       or (v_q ~ '^[0-9a-fA-F-]{4,}$' and sp.id::text like lower(v_q) || '%')
    order by sp.created_at desc limit 8);
end;
$function$;
revoke all on function public.platform_global_search(text) from public, anon;
grant execute on function public.platform_global_search(text) to authenticated;

-- ------------------------------------------------------------ platform_diagnostics
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

-- ------------------------------------------------ ações rápidas seguras / idempotentes
create or replace function public.admin_sync_company_entitlements(p_company_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_sub public.subscriptions;
begin
  if not public.is_platform_admin() then
    raise exception 'not authorized';
  end if;
  perform public.platform_assert_company(p_company_id);

  perform pg_advisory_xact_lock(hashtext('company_access:' || p_company_id::text));
  select * into v_sub from public.subscriptions where company_id = p_company_id;
  if not found then
    raise exception 'A empresa não possui assinatura.';
  end if;

  perform public.platform_apply_access(p_company_id, v_sub.plan_id, v_sub.status, v_sub.expires_at);

  perform public.write_platform_audit_log(
    'platform.admin.entitlements_synced', 'company', p_company_id, p_company_id, null,
    jsonb_build_object('status', v_sub.status, 'expires_at', v_sub.expires_at)
  );
end;
$function$;
revoke all on function public.admin_sync_company_entitlements(uuid) from public, anon;
grant execute on function public.admin_sync_company_entitlements(uuid) to authenticated;

create or replace function public.admin_mark_expired_subscriptions()
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_ids uuid[];
begin
  if not public.is_platform_admin() then
    raise exception 'not authorized';
  end if;

  with upd as (
    update public.subscriptions set status = 'expired'
     where status in ('active', 'trialing') and expires_at <= now()
     returning company_id
  )
  select coalesce(array_agg(company_id), '{}') into v_ids from upd;

  update public.company_entitlements set status = 'expired', updated_at = now()
   where company_id = any (v_ids);

  if coalesce(array_length(v_ids, 1), 0) > 0 then
    perform public.write_platform_audit_log(
      'platform.admin.subscriptions_marked_expired', 'subscription', gen_random_uuid(), null, null,
      jsonb_build_object('count', array_length(v_ids, 1))
    );
  end if;

  return coalesce(array_length(v_ids, 1), 0);
end;
$function$;
revoke all on function public.admin_mark_expired_subscriptions() from public, anon;
grant execute on function public.admin_mark_expired_subscriptions() to authenticated;

-- A reverificação em si (consulta ao EvoPay) acontece no servidor; aqui só se registra.
create or replace function public.admin_audit_payment_reverify(p_payment_id uuid, p_outcome text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_company uuid;
begin
  if not public.is_platform_admin() then
    raise exception 'not authorized';
  end if;
  if p_outcome is null or p_outcome not in ('paid', 'pending', 'expired', 'cancelled', 'failed', 'refunded', 'unchanged', 'error') then
    raise exception 'Resultado inválido.';
  end if;

  select company_id into v_company from public.subscription_payments where id = p_payment_id;
  if not found then
    raise exception 'Pagamento não encontrado.';
  end if;

  perform public.write_platform_audit_log(
    'platform.payment.reverified', 'subscription_payment', p_payment_id, v_company, null,
    jsonb_build_object('outcome', p_outcome)
  );
end;
$function$;
revoke all on function public.admin_audit_payment_reverify(uuid, text) from public, anon;
grant execute on function public.admin_audit_payment_reverify(uuid, text) to authenticated;

-- ----------------------------------------------------- webhooks / integrações
create or replace function public.list_platform_webhook_deliveries(
  p_provider text default null,
  p_outcome text default null,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_limit integer default 25,
  p_offset integer default 0
)
 returns table (
  delivery_id uuid, provider text, external_id text, outcome text, detail text, received_at timestamptz,
  payment_id uuid, company_id uuid, company_name text, total_count bigint
 )
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
#variable_conflict use_column
declare
  v_limit integer := least(greatest(coalesce(p_limit, 25), 1), 100);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
begin
  if not public.is_platform_admin() then
    raise exception 'not authorized';
  end if;
  if p_outcome is not null and p_outcome not in ('processed', 'payment_not_found', 'ignored', 'error') then
    raise exception 'Filtro inválido.';
  end if;

  return query
  select d.id, d.provider, d.external_id, d.outcome, d.detail, d.received_at, d.payment_id, sp.company_id, c.name, count(*) over ()
  from public.webhook_deliveries d
  left join public.subscription_payments sp on sp.id = d.payment_id
  left join public.companies c on c.id = sp.company_id
  where (p_provider is null or d.provider = p_provider)
    and (p_outcome is null or d.outcome = p_outcome)
    and (p_from is null or d.received_at >= p_from)
    and (p_to is null or d.received_at < p_to)
  order by d.received_at desc, d.id
  limit v_limit offset v_offset;
end;
$function$;
revoke all on function public.list_platform_webhook_deliveries(text, text, timestamptz, timestamptz, integer, integer) from public, anon;
grant execute on function public.list_platform_webhook_deliveries(text, text, timestamptz, timestamptz, integer, integer) to authenticated;

create or replace function public.list_platform_payment_events(
  p_provider text default null,
  p_processed boolean default null,
  p_limit integer default 25,
  p_offset integer default 0
)
 returns table (
  event_row_id uuid, provider text, event_id text, event_type text, processed boolean, processed_at timestamptz,
  created_at timestamptz, payment_id uuid, company_name text, total_count bigint
 )
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
#variable_conflict use_column
declare
  v_limit integer := least(greatest(coalesce(p_limit, 25), 1), 100);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
begin
  if not public.is_platform_admin() then
    raise exception 'not authorized';
  end if;

  return query
  select e.id, e.provider, e.event_id, e.event_type, e.processed, e.processed_at, e.created_at,
         e.subscription_payment_id, c.name, count(*) over ()
  from public.payment_events e
  left join public.subscription_payments sp on sp.id = e.subscription_payment_id
  left join public.companies c on c.id = sp.company_id
  where (p_provider is null or e.provider = p_provider)
    and (p_processed is null or e.processed = p_processed)
  order by e.created_at desc, e.id
  limit v_limit offset v_offset;
end;
$function$;
revoke all on function public.list_platform_payment_events(text, boolean, integer, integer) from public, anon;
grant execute on function public.list_platform_payment_events(text, boolean, integer, integer) to authenticated;

create or replace function public.platform_integrations_status()
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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
$function$;
revoke all on function public.platform_integrations_status() from public, anon;
grant execute on function public.platform_integrations_status() to authenticated;

-- ------------------------------------------------------------ admin_update_company
-- Nome e tipo de negócio. Status continua em set_platform_company_status (super only);
-- membros/propriedade/dados do tenant NÃO são alterados aqui (isolamento multi-tenant).
create or replace function public.admin_update_company(p_company_id uuid, p_name text, p_business_type public.business_type)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_old public.companies;
  v_name text := nullif(trim(coalesce(p_name, '')), '');
begin
  if not public.is_platform_admin() then
    raise exception 'not authorized';
  end if;
  if v_name is null or char_length(v_name) > 120 or p_business_type is null then
    raise exception 'Parâmetros inválidos.';
  end if;

  select * into v_old from public.companies where id = p_company_id for update;
  if not found then
    raise exception 'Empresa não encontrada.';
  end if;
  if v_old.name = v_name and v_old.business_type = p_business_type then
    raise exception 'Nenhuma alteração.';
  end if;

  update public.companies set name = v_name, business_type = p_business_type where id = p_company_id;

  perform public.write_platform_audit_log(
    'platform.company.updated', 'company', p_company_id, p_company_id, null,
    jsonb_build_object('from', jsonb_build_object('name', v_old.name, 'business_type', v_old.business_type),
                       'to', jsonb_build_object('name', v_name, 'business_type', p_business_type))
  );
end;
$function$;
revoke all on function public.admin_update_company(uuid, text, public.business_type) from public, anon;
grant execute on function public.admin_update_company(uuid, text, public.business_type) to authenticated;
