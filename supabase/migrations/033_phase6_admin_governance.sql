-- Fase 6: Administração, Configurações e Governança
create table if not exists public.company_settings (
  company_id uuid primary key references public.companies(id) on delete cascade,
  timezone text not null default 'America/Sao_Paulo',
  locale text not null default 'pt-BR',
  currency text not null default 'BRL',
  week_starts_on smallint not null default 1 check (week_starts_on between 0 and 6),
  notifications_enabled boolean not null default true,
  email_notifications_enabled boolean not null default true,
  operational_preferences jsonb not null default '{}'::jsonb check (jsonb_typeof(operational_preferences) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

create table if not exists public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  theme text not null default 'system' check (theme in ('light','dark','system')),
  density text not null default 'comfortable' check (density in ('comfortable','compact')),
  locale text not null default 'pt-BR',
  timezone text not null default 'America/Sao_Paulo',
  notifications_enabled boolean not null default true,
  email_notifications_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.company_settings enable row level security;
alter table public.user_preferences enable row level security;

create policy company_settings_select_member
on public.company_settings
for select to authenticated
using (
  exists (
    select 1 from public.company_members cm
    where cm.company_id = company_settings.company_id
      and cm.user_id = (select auth.uid())
  )
);

create policy company_settings_insert_admin
on public.company_settings
for insert to authenticated
with check (
  exists (
    select 1 from public.company_members cm
    where cm.company_id = company_settings.company_id
      and cm.user_id = (select auth.uid())
      and cm.role in ('owner','admin')
  )
);

create policy company_settings_update_admin
on public.company_settings
for update to authenticated
using (
  exists (
    select 1 from public.company_members cm
    where cm.company_id = company_settings.company_id
      and cm.user_id = (select auth.uid())
      and cm.role in ('owner','admin')
  )
)
with check (
  exists (
    select 1 from public.company_members cm
    where cm.company_id = company_settings.company_id
      and cm.user_id = (select auth.uid())
      and cm.role in ('owner','admin')
  )
);

create policy company_settings_delete_admin
on public.company_settings
for delete to authenticated
using (
  exists (
    select 1 from public.company_members cm
    where cm.company_id = company_settings.company_id
      and cm.user_id = (select auth.uid())
      and cm.role in ('owner','admin')
  )
);

create policy user_preferences_select_own
on public.user_preferences
for select to authenticated
using (user_id = (select auth.uid()));

create policy user_preferences_insert_own
on public.user_preferences
for insert to authenticated
with check (user_id = (select auth.uid()));

create policy user_preferences_update_own
on public.user_preferences
for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create or replace function public.is_platform_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.user_id = (select auth.uid())
      and p.role in ('admin','super_admin')
      and p.status = 'active'
  );
$$;

create or replace function public.get_platform_admin_overview()
returns table (
  total_users bigint,
  active_users bigint,
  suspended_users bigint,
  total_companies bigint,
  active_companies bigint,
  inactive_companies bigint,
  active_subscriptions bigint,
  expired_subscriptions bigint
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then raise exception 'not authorized'; end if;

  return query
  select
    (select count(*) from public.profiles),
    (select count(*) from public.profiles where status = 'active'),
    (select count(*) from public.profiles where status = 'suspended'),
    (select count(*) from public.companies),
    (select count(*) from public.companies where status = 'active'),
    (select count(*) from public.companies where status = 'inactive'),
    (select count(*) from public.subscriptions where status = 'active'),
    (select count(*) from public.subscriptions where status = 'expired');
end;
$$;

create or replace function public.list_platform_admin_companies()
returns table (
  company_id uuid,
  name text,
  business_type public.business_type,
  status public.company_status,
  members_count bigint,
  subscription_status public.subscription_status,
  subscription_expires_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then raise exception 'not authorized'; end if;

  return query
  select
    c.id,
    c.name,
    c.business_type,
    c.status,
    (select count(*) from public.company_members cm where cm.company_id = c.id),
    s.status,
    s.expires_at
  from public.companies c
  left join lateral (
    select status, expires_at
    from public.subscriptions
    where company_id = c.id
    order by updated_at desc
    limit 1
  ) s on true
  order by c.created_at desc
  limit 100;
end;
$$;

create or replace function public.set_platform_company_status(
  p_company_id uuid,
  p_status public.company_status
)
returns public.companies
language plpgsql
security definer
set search_path = public
as $$
declare updated_company public.companies;
begin
  if not public.is_platform_admin() then raise exception 'not authorized'; end if;

  update public.companies
  set status = p_status, updated_at = now()
  where id = p_company_id
  returning * into updated_company;

  if updated_company.id is null then raise exception 'company not found'; end if;

  insert into public.audit_logs (
    company_id, actor_user_id, entity_type, entity_id, action, metadata
  )
  values (
    p_company_id, (select auth.uid()), 'company', p_company_id,
    'platform_status_changed', jsonb_build_object('status', p_status)
  );

  return updated_company;
end;
$$;

create or replace function public.ensure_company_settings()
returns public.company_settings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_settings public.company_settings;
begin
  select cm.company_id into v_company_id
  from public.company_members cm
  where cm.user_id = (select auth.uid())
  order by cm.created_at asc
  limit 1;

  if v_company_id is null then raise exception 'company not found'; end if;

  insert into public.company_settings (company_id)
  values (v_company_id)
  on conflict (company_id) do nothing;

  select * into v_settings
  from public.company_settings
  where company_id = v_company_id;

  return v_settings;
end;
$$;
