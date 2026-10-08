-- =============================================================================
-- Admin Control Center — NÚCLEO (somente TEST nesta fase)
--
-- 1. platform_settings: configurações REAIS da plataforma (cada chave é lida por
--    uma RPC; nada de configuração decorativa).
-- 2. user_presence: presença por heartbeat (1 linha por usuário, upsert limitado).
-- 3. Colunas novas: plans.sort_order; subscription_payments.method/notes/recorded_by
--    (pagamento manual) + unicidade de referência manual.
-- 4. webhook_deliveries: registro de entregas do webhook (monitoramento).
-- 5. platform_apply_access(): ÚNICO helper que grava acesso (subscriptions +
--    company_entitlements coerentes). Interno: não é exposto à API.
-- 6. platform_audit_category(): categoria de cada ação de auditoria.
--
-- Todas as tabelas novas têm RLS ligada e NENHUMA policy: só RPCs SECURITY DEFINER
-- (ou service_role no webhook) acessam. Nada é aberto ao cliente.
-- =============================================================================

-- ------------------------------------------------------------ platform_settings
create table if not exists public.platform_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(user_id) on delete set null
);
alter table public.platform_settings enable row level security;
revoke all on table public.platform_settings from anon, authenticated;

-- Leitura interna de um inteiro configurado (com padrão). Não exposta.
create or replace function public.platform_setting_int(p_key text, p_default integer)
 returns integer
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select coalesce(
    (select (s.value #>> '{}')::integer from public.platform_settings s where s.key = p_key),
    p_default
  );
$function$;
revoke all on function public.platform_setting_int(text, integer) from public, anon, authenticated;

-- Definição das chaves existentes: chave, padrão, mínimo, máximo, descrição.
create or replace function public.platform_setting_definitions()
 returns table (key text, default_value integer, min_value integer, max_value integer, description text)
 language sql
 immutable
 set search_path to 'public'
as $function$
  select * from (values
    ('admin_max_free_days', 30, 1, 365,
     'Máximo de dias gratuitos que um ADMIN pode conceder em uma única operação (super_admin pode até 365).'),
    ('presence_online_seconds', 120, 90, 900,
     'Segundos desde o último sinal para um usuário contar como ONLINE (mínimo 90: o heartbeat do app roda a cada 60 s).'),
    ('presence_recent_minutes', 15, 5, 240,
     'Minutos desde o último sinal para um usuário contar como RECENTEMENTE ONLINE.')
  ) as t(key, default_value, min_value, max_value, description);
$function$;
revoke all on function public.platform_setting_definitions() from public, anon, authenticated;

create or replace function public.get_platform_settings()
 returns table (
  key text, value integer, default_value integer, min_value integer, max_value integer,
  description text, updated_at timestamptz, updated_by_email text
 )
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if not public.is_platform_admin() then
    raise exception 'not authorized';
  end if;

  return query
  select d.key,
         coalesce((s.value #>> '{}')::integer, d.default_value),
         d.default_value, d.min_value, d.max_value, d.description,
         s.updated_at, p.email
  from public.platform_setting_definitions() d
  left join public.platform_settings s on s.key = d.key
  left join public.profiles p on p.user_id = s.updated_by
  order by d.key;
end;
$function$;

create or replace function public.set_platform_setting(p_key text, p_value integer, p_reason text default null)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_def record;
  v_old integer;
begin
  if not public.is_super_admin() then
    raise exception 'not authorized';
  end if;

  select * into v_def from public.platform_setting_definitions() d where d.key = p_key;
  if not found then
    raise exception 'Configuração desconhecida.';
  end if;

  if p_value is null or p_value < v_def.min_value or p_value > v_def.max_value then
    raise exception 'Valor fora do intervalo permitido (% a %).', v_def.min_value, v_def.max_value;
  end if;

  -- recent >= online (em minutos vs segundos): garante coerência entre os dois limiares
  if p_key = 'presence_online_seconds' and p_value > public.platform_setting_int('presence_recent_minutes', 15) * 60 then
    raise exception 'O limiar ONLINE não pode ser maior que o de RECENTEMENTE ONLINE.';
  end if;
  if p_key = 'presence_recent_minutes' and p_value * 60 < public.platform_setting_int('presence_online_seconds', 120) then
    raise exception 'O limiar RECENTEMENTE ONLINE não pode ser menor que o de ONLINE.';
  end if;

  v_old := public.platform_setting_int(p_key, v_def.default_value);

  insert into public.platform_settings (key, value, updated_at, updated_by)
  values (p_key, to_jsonb(p_value), now(), public.current_profile_user_id())
  on conflict (key) do update
    set value = excluded.value, updated_at = now(), updated_by = excluded.updated_by;

  perform public.write_platform_audit_log(
    'platform.settings.updated', 'platform_setting', md5('platform_setting:' || p_key)::uuid,
    null, null,
    jsonb_build_object('key', p_key, 'from', v_old, 'to', p_value, 'reason', nullif(trim(coalesce(p_reason, '')), ''))
  );
end;
$function$;

revoke all on function public.get_platform_settings() from public, anon;
grant execute on function public.get_platform_settings() to authenticated;
revoke all on function public.set_platform_setting(text, integer, text) from public, anon;
grant execute on function public.set_platform_setting(text, integer, text) to authenticated;

-- ------------------------------------------------------------------- presença
create table if not exists public.user_presence (
  user_id uuid primary key references public.profiles(user_id) on delete cascade,
  last_seen_at timestamptz not null default now()
);
alter table public.user_presence enable row level security;
revoke all on table public.user_presence from anon, authenticated;
create index if not exists idx_user_presence_last_seen on public.user_presence (last_seen_at desc);

-- Heartbeat do próprio usuário (só perfil ATIVO tem identidade). O upsert só grava
-- se o último sinal tem mais de 30 s: no máximo ~2 escritas/min por usuário, 1 linha
-- por usuário (sem crescimento).
create or replace function public.touch_presence()
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_uid uuid := public.current_profile_user_id();
begin
  if v_uid is null then
    return;
  end if;

  insert into public.user_presence (user_id, last_seen_at)
  values (v_uid, now())
  on conflict (user_id) do update
    set last_seen_at = now()
    where user_presence.last_seen_at < now() - interval '30 seconds';
end;
$function$;

revoke all on function public.touch_presence() from public, anon;
grant execute on function public.touch_presence() to authenticated;

-- ONLINE / RECENT / OFFLINE a partir do último sinal e dos limiares configurados.
create or replace function public.platform_presence_status(p_last_seen timestamptz)
 returns text
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select case
    when p_last_seen is null then 'offline'
    when p_last_seen >= now() - make_interval(secs => public.platform_setting_int('presence_online_seconds', 120)) then 'online'
    when p_last_seen >= now() - make_interval(mins => public.platform_setting_int('presence_recent_minutes', 15)) then 'recent'
    else 'offline'
  end;
$function$;
revoke all on function public.platform_presence_status(timestamptz) from public, anon, authenticated;

-- ------------------------------------------------------- colunas e índices novos
alter table public.plans add column if not exists sort_order integer not null default 0;

alter table public.subscription_payments add column if not exists method text;
alter table public.subscription_payments add column if not exists notes text;
alter table public.subscription_payments add column if not exists recorded_by uuid references public.profiles(user_id) on delete set null;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'subscription_payments_method_check') then
    alter table public.subscription_payments
      add constraint subscription_payments_method_check
      check (method is null or method in ('pix', 'transfer', 'cash', 'card_external', 'other'));
  end if;
end $$;

-- Pagamento manual: uma referência por empresa (evita lançar o mesmo comprovante duas vezes).
create unique index if not exists subscription_payments_manual_reference_unique
  on public.subscription_payments (company_id, external_reference)
  where provider = 'manual' and external_reference is not null;

create index if not exists idx_subscription_payments_created_at on public.subscription_payments (created_at desc);
create index if not exists idx_subscription_payments_provider on public.subscription_payments (provider);
create index if not exists idx_subscription_payments_status on public.subscription_payments (status);
create index if not exists idx_subscription_payments_recorded_by on public.subscription_payments (recorded_by);
create index if not exists idx_subscriptions_updated_at on public.subscriptions (updated_at desc);

-- --------------------------------------------------------- webhook_deliveries
create table if not exists public.webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  external_id text,
  payment_id uuid references public.subscription_payments(id) on delete set null,
  outcome text not null check (outcome in ('processed', 'payment_not_found', 'ignored', 'error')),
  detail text,
  received_at timestamptz not null default now()
);
alter table public.webhook_deliveries enable row level security;
revoke all on table public.webhook_deliveries from anon, authenticated;
create index if not exists idx_webhook_deliveries_received_at on public.webhook_deliveries (received_at desc);
create index if not exists idx_webhook_deliveries_payment_id on public.webhook_deliveries (payment_id);

-- ------------------------------------------------------------ categoria de auditoria
create or replace function public.platform_audit_category(p_action text)
 returns text
 language sql
 immutable
 set search_path to 'public'
as $function$
  select case
    when p_action = 'platform.user.role_changed' then 'ROLE_CHANGE'
    when p_action = 'platform.user.status_changed' then 'STATUS_CHANGE'
    when p_action like 'platform.user.%' then 'USER_MANAGEMENT'
    when p_action like 'platform.access.%' then 'ACCESS_EXTENSION'
    when p_action = 'platform.subscription.plan_changed' or p_action like 'platform.plan.%' then 'PLAN_CHANGE'
    when p_action like 'platform.subscription.%' or p_action like 'subscription.%' then 'SUBSCRIPTION_CHANGE'
    when p_action like 'platform.payment.manual%' then 'MANUAL_PAYMENT'
    when p_action like 'platform.payment.%' or p_action like 'subscription_payment.%' then 'PAYMENT'
    when p_action like 'platform.webhook.%' then 'WEBHOOK'
    when p_action like 'platform.integration.%' then 'INTEGRATION'
    when p_action like 'platform.%' then 'ADMIN_ACTION'
    else 'SYSTEM'
  end;
$function$;
revoke all on function public.platform_audit_category(text) from public, anon, authenticated;

-- ---------------------------------------------------------- platform_apply_access
-- ÚNICO ponto que grava acesso por operação administrativa: mantém subscriptions
-- (fonte de verdade do guard) e company_entitlements (projeção) coerentes, no mesmo
-- molde de confirm_subscription_payment. Interno: chamado só por RPCs deste arquivo.
create or replace function public.platform_apply_access(
  p_company_id uuid,
  p_plan_id uuid,
  p_status public.subscription_status,
  p_expires_at timestamptz,
  p_starts_at timestamptz default null,
  p_provider text default 'manual'
)
 returns public.subscriptions
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_plan public.plans;
  v_sub public.subscriptions;
  v_now timestamptz := now();
begin
  select * into v_plan from public.plans where id = p_plan_id;
  if not found then
    raise exception 'Plano não encontrado.';
  end if;

  select * into v_sub from public.subscriptions where company_id = p_company_id for update;

  if found then
    update public.subscriptions
       set plan_id = p_plan_id,
           status = p_status,
           expires_at = p_expires_at,
           starts_at = coalesce(p_starts_at, starts_at),
           cancelled_at = case when p_status in ('active', 'trialing') then null else cancelled_at end
     where company_id = p_company_id
     returning * into v_sub;
  else
    insert into public.subscriptions (company_id, plan_id, status, starts_at, expires_at, provider)
    values (p_company_id, p_plan_id, p_status, coalesce(p_starts_at, v_now), p_expires_at, p_provider)
    returning * into v_sub;
  end if;

  insert into public.company_entitlements (
    company_id, plan_id, status, access_starts_at, access_expires_at,
    max_additional_users, support_enabled, tickets_enabled, exclusive_groups_enabled, early_access_enabled
  ) values (
    p_company_id, p_plan_id, p_status, v_sub.starts_at, v_sub.expires_at,
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

  return v_sub;
end;
$function$;
revoke all on function public.platform_apply_access(uuid, uuid, public.subscription_status, timestamptz, timestamptz, text)
  from public, anon, authenticated;
