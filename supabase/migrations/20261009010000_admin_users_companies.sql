-- =============================================================================
-- Admin Control Center — USUÁRIOS e EMPRESAS (somente TEST nesta fase)
--
-- Listas paginadas no banco (filtros reais, ordenação, total_count), detalhes e a
-- única edição de perfil permitida a admin (full_name). Tudo SECURITY DEFINER atrás
-- de is_platform_admin(); clerk_user_id só é devolvido ao super_admin; metadados de
-- auditoria passam por platform_safe_metadata() (remove chaves sensíveis).
-- =============================================================================

-- Remove chaves que nunca devem aparecer em tela (defesa em profundidade).
create or replace function public.platform_safe_metadata(p_meta jsonb)
 returns jsonb
 language sql
 immutable
 set search_path to 'public'
as $function$
  select coalesce(
    (select jsonb_object_agg(e.k, e.v)
       from jsonb_each(coalesce(p_meta, '{}'::jsonb)) as e(k, v)
      where e.k !~* '(token|secret|password|jwt|authorization|api[_-]?key|cookie|payload)'),
    '{}'::jsonb
  );
$function$;
revoke all on function public.platform_safe_metadata(jsonb) from public, anon, authenticated;

-- ------------------------------------------------- list_platform_admin_users (v2)
drop function if exists public.list_platform_admin_users(text, public.user_status, public.user_role, integer, integer);

create function public.list_platform_admin_users(
  p_search text default null,
  p_status public.user_status default null,
  p_role public.user_role default null,
  p_plan_code text default null,
  p_subscription text default null,   -- active | trialing | expired | cancelled | pending | none
  p_presence text default null,       -- online | recent | offline
  p_sort text default 'created_desc', -- created_desc | created_asc | name_asc | last_seen_desc | expires_asc
  p_limit integer default 25,
  p_offset integer default 0
)
 returns table (
  user_id uuid,
  full_name text,
  email text,
  role public.user_role,
  status public.user_status,
  created_at timestamptz,
  last_seen_at timestamptz,
  presence text,
  clerk_linked boolean,
  company_id uuid,
  company_name text,
  company_role public.company_role,
  plan_code text,
  plan_name text,
  subscription_status public.subscription_status,
  subscription_expires_at timestamptz,
  access_active boolean,
  total_count bigint
 )
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
#variable_conflict use_column
declare
  v_pattern text;
  v_limit integer := least(greatest(coalesce(p_limit, 25), 1), 100);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
begin
  if not public.is_platform_admin() then
    raise exception 'not authorized';
  end if;

  if p_subscription is not null and p_subscription not in ('active', 'trialing', 'expired', 'cancelled', 'pending', 'none') then
    raise exception 'Filtro de assinatura inválido.';
  end if;
  if p_presence is not null and p_presence not in ('online', 'recent', 'offline') then
    raise exception 'Filtro de presença inválido.';
  end if;

  if nullif(trim(coalesce(p_search, '')), '') is not null then
    v_pattern := '%' || replace(replace(replace(trim(p_search), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;

  return query
  with base as (
    select
      p.user_id as b_user_id, p.full_name as b_full_name, p.email as b_email, p.role as b_role,
      p.status as b_status, p.created_at as b_created_at, up.last_seen_at as b_last_seen_at,
      public.platform_presence_status(up.last_seen_at) as b_presence,
      (p.clerk_user_id is not null) as b_clerk_linked,
      m.company_id as b_company_id, c.name as b_company_name, m.role as b_company_role,
      pl.code as b_plan_code, pl.name as b_plan_name, s.status as b_sub_status, s.expires_at as b_sub_expires,
      coalesce(s.status in ('trialing', 'active') and s.expires_at > now(), false) as b_access_active,
      case
        when s.id is null then 'none'
        when s.status = 'cancelled' then 'cancelled'
        when s.status = 'pending' then 'pending'
        when s.status in ('trialing', 'active') and s.expires_at > now() then s.status::text
        else 'expired'
      end as b_sub_state
    from public.profiles p
    left join public.user_presence up on up.user_id = p.user_id
    left join lateral (
      select cm.company_id, cm.role
      from public.company_members cm
      where cm.user_id = p.user_id
      order by cm.created_at
      limit 1
    ) m on true
    left join public.companies c on c.id = m.company_id
    left join public.subscriptions s on s.company_id = m.company_id
    left join public.plans pl on pl.id = s.plan_id
  )
  select
    b.b_user_id, b.b_full_name, b.b_email, b.b_role, b.b_status, b.b_created_at, b.b_last_seen_at,
    b.b_presence, b.b_clerk_linked, b.b_company_id, b.b_company_name, b.b_company_role,
    b.b_plan_code, b.b_plan_name, b.b_sub_status, b.b_sub_expires, b.b_access_active,
    count(*) over ()
  from base b
  where (p_status is null or b.b_status = p_status)
    and (p_role is null or b.b_role = p_role)
    and (p_plan_code is null or b.b_plan_code = p_plan_code)
    and (p_subscription is null or b.b_sub_state = p_subscription)
    and (p_presence is null or b.b_presence = p_presence)
    and (
      v_pattern is null
      or b.b_email ilike v_pattern escape '\'
      or b.b_full_name ilike v_pattern escape '\'
      or b.b_company_name ilike v_pattern escape '\'
    )
  order by
    case when p_sort = 'name_asc' then lower(coalesce(b.b_full_name, b.b_email)) end asc nulls last,
    case when p_sort = 'last_seen_desc' then b.b_last_seen_at end desc nulls last,
    case when p_sort = 'expires_asc' then b.b_sub_expires end asc nulls last,
    case when p_sort = 'created_asc' then b.b_created_at end asc,
    b.b_created_at desc, b.b_user_id
  limit v_limit offset v_offset;
end;
$function$;

revoke all on function public.list_platform_admin_users(text, public.user_status, public.user_role, text, text, text, text, integer, integer)
  from public, anon;
grant execute on function public.list_platform_admin_users(text, public.user_status, public.user_role, text, text, text, text, integer, integer)
  to authenticated;

-- --------------------------------------------------- list_platform_admin_companies (v2)
drop function if exists public.list_platform_admin_companies(text, public.company_status, integer, integer);

create function public.list_platform_admin_companies(
  p_search text default null,
  p_status public.company_status default null,
  p_plan_code text default null,
  p_subscription text default null,   -- active | trialing | expired | cancelled | pending | none
  p_sort text default 'created_desc', -- created_desc | created_asc | name_asc | expires_asc | revenue_desc
  p_limit integer default 25,
  p_offset integer default 0
)
 returns table (
  company_id uuid,
  name text,
  business_type public.business_type,
  status public.company_status,
  created_at timestamptz,
  members_count bigint,
  owner_name text,
  owner_email text,
  plan_code text,
  plan_name text,
  subscription_status public.subscription_status,
  subscription_expires_at timestamptz,
  access_active boolean,
  paid_total numeric,
  total_count bigint
 )
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
#variable_conflict use_column
declare
  v_pattern text;
  v_limit integer := least(greatest(coalesce(p_limit, 25), 1), 100);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
begin
  if not public.is_platform_admin() then
    raise exception 'not authorized';
  end if;

  if p_subscription is not null and p_subscription not in ('active', 'trialing', 'expired', 'cancelled', 'pending', 'none') then
    raise exception 'Filtro de assinatura inválido.';
  end if;

  if nullif(trim(coalesce(p_search, '')), '') is not null then
    v_pattern := '%' || replace(replace(replace(trim(p_search), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;

  return query
  with base as (
    select
      c.id as b_id, c.name as b_name, c.business_type as b_type, c.status as b_status, c.created_at as b_created,
      (select count(*) from public.company_members cm where cm.company_id = c.id) as b_members,
      o.full_name as b_owner_name, o.email as b_owner_email,
      pl.code as b_plan_code, pl.name as b_plan_name, s.status as b_sub_status, s.expires_at as b_sub_expires,
      coalesce(s.status in ('trialing', 'active') and s.expires_at > now(), false) as b_access_active,
      coalesce((select sum(sp.amount) from public.subscription_payments sp where sp.company_id = c.id and sp.status = 'paid'), 0) as b_paid_total,
      case
        when s.id is null then 'none'
        when s.status = 'cancelled' then 'cancelled'
        when s.status = 'pending' then 'pending'
        when s.status in ('trialing', 'active') and s.expires_at > now() then s.status::text
        else 'expired'
      end as b_sub_state
    from public.companies c
    left join lateral (
      select p.full_name, p.email
      from public.company_members cm
      join public.profiles p on p.user_id = cm.user_id
      where cm.company_id = c.id and cm.role = 'owner'
      order by cm.created_at
      limit 1
    ) o on true
    left join public.subscriptions s on s.company_id = c.id
    left join public.plans pl on pl.id = s.plan_id
  )
  select
    b.b_id, b.b_name, b.b_type, b.b_status, b.b_created, b.b_members, b.b_owner_name, b.b_owner_email,
    b.b_plan_code, b.b_plan_name, b.b_sub_status, b.b_sub_expires, b.b_access_active, b.b_paid_total,
    count(*) over ()
  from base b
  where (p_status is null or b.b_status = p_status)
    and (p_plan_code is null or b.b_plan_code = p_plan_code)
    and (p_subscription is null or b.b_sub_state = p_subscription)
    and (
      v_pattern is null
      or b.b_name ilike v_pattern escape '\'
      or b.b_owner_email ilike v_pattern escape '\'
      or b.b_owner_name ilike v_pattern escape '\'
    )
  order by
    case when p_sort = 'name_asc' then lower(b.b_name) end asc,
    case when p_sort = 'expires_asc' then b.b_sub_expires end asc nulls last,
    case when p_sort = 'revenue_desc' then b.b_paid_total end desc,
    case when p_sort = 'created_asc' then b.b_created end asc,
    b.b_created desc, b.b_id
  limit v_limit offset v_offset;
end;
$function$;

revoke all on function public.list_platform_admin_companies(text, public.company_status, text, text, text, integer, integer)
  from public, anon;
grant execute on function public.list_platform_admin_companies(text, public.company_status, text, text, text, integer, integer)
  to authenticated;

-- ------------------------------------------------------- get_platform_user_detail
create or replace function public.get_platform_user_detail(p_user_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
#variable_conflict use_column
declare
  v_actor uuid := public.current_profile_user_id();
  v_is_super boolean := public.is_super_admin();
  v_p public.profiles;
  v_last_seen timestamptz;
  v_company_id uuid;
begin
  if not public.is_platform_admin() then
    raise exception 'not authorized';
  end if;

  select * into v_p from public.profiles where user_id = p_user_id;
  if not found then
    raise exception 'Usuário não encontrado.';
  end if;

  select up.last_seen_at into v_last_seen from public.user_presence up where up.user_id = p_user_id;
  select cm.company_id into v_company_id from public.company_members cm
   where cm.user_id = p_user_id order by cm.created_at limit 1;

  return jsonb_build_object(
    'profile', jsonb_build_object(
      'user_id', v_p.user_id, 'full_name', v_p.full_name, 'email', v_p.email,
      'role', v_p.role, 'status', v_p.status, 'created_at', v_p.created_at, 'updated_at', v_p.updated_at,
      'clerk_linked', v_p.clerk_user_id is not null,
      'clerk_user_id', case when v_is_super then v_p.clerk_user_id end,
      'last_seen_at', v_last_seen,
      'presence', public.platform_presence_status(v_last_seen)
    ),
    'company', (
      select jsonb_build_object('id', c.id, 'name', c.name, 'business_type', c.business_type, 'status', c.status,
                                'member_role', cm.role, 'created_at', c.created_at)
      from public.companies c join public.company_members cm on cm.company_id = c.id and cm.user_id = p_user_id
      where c.id = v_company_id
    ),
    'subscription', (
      select jsonb_build_object(
        'id', s.id, 'status', s.status, 'starts_at', s.starts_at, 'expires_at', s.expires_at,
        'cancelled_at', s.cancelled_at, 'provider', s.provider, 'updated_at', s.updated_at,
        'access_active', s.status in ('trialing', 'active') and s.expires_at > now(),
        'days_left', greatest(0, ceil(extract(epoch from (s.expires_at - now())) / 86400.0))::int,
        'plan', jsonb_build_object('id', pl.id, 'code', pl.code, 'name', pl.name, 'price', pl.price,
                                   'currency', pl.currency, 'access_duration_days', pl.access_duration_days, 'trial', pl.trial)
      )
      from public.subscriptions s join public.plans pl on pl.id = s.plan_id
      where s.company_id = v_company_id
    ),
    'payments', coalesce((
      select jsonb_agg(x order by x.created_at desc) from (
        select sp.id, sp.provider, sp.method, sp.status, sp.amount, sp.currency, sp.paid_at, sp.created_at,
               sp.external_reference, pl.name as plan_name
        from public.subscription_payments sp join public.plans pl on pl.id = sp.plan_id
        where sp.company_id = v_company_id
        order by sp.created_at desc limit 10
      ) x
    ), '[]'::jsonb),
    'audit', coalesce((
      select jsonb_agg(y order by y.created_at desc) from (
        select a.id, a.action, public.platform_audit_category(a.action) as category, a.created_at,
               ap.email as actor_email, ap.full_name as actor_name,
               public.platform_safe_metadata(a.metadata) as metadata
        from public.audit_logs a left join public.profiles ap on ap.user_id = a.actor_user_id
        where (a.target_user_id = p_user_id or (a.entity_type = 'profile' and a.entity_id = p_user_id)
               or (v_company_id is not null and a.company_id = v_company_id and a.action like 'platform.%'))
          and (v_is_super or a.actor_user_id = v_actor)
        order by a.created_at desc limit 20
      ) y
    ), '[]'::jsonb)
  );
end;
$function$;

revoke all on function public.get_platform_user_detail(uuid) from public, anon;
grant execute on function public.get_platform_user_detail(uuid) to authenticated;

-- ----------------------------------------------------- get_platform_company_detail
create or replace function public.get_platform_company_detail(p_company_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
#variable_conflict use_column
declare
  v_actor uuid := public.current_profile_user_id();
  v_is_super boolean := public.is_super_admin();
  v_c public.companies;
begin
  if not public.is_platform_admin() then
    raise exception 'not authorized';
  end if;

  select * into v_c from public.companies where id = p_company_id;
  if not found then
    raise exception 'Empresa não encontrada.';
  end if;

  return jsonb_build_object(
    'company', jsonb_build_object('id', v_c.id, 'name', v_c.name, 'business_type', v_c.business_type,
                                  'status', v_c.status, 'created_at', v_c.created_at),
    'members', coalesce((
      select jsonb_agg(m order by m.joined_at) from (
        select p.user_id, p.full_name, p.email, cm.role as company_role, p.status as user_status, p.role as platform_role,
               cm.created_at as joined_at, public.platform_presence_status(up.last_seen_at) as presence
        from public.company_members cm join public.profiles p on p.user_id = cm.user_id
        left join public.user_presence up on up.user_id = p.user_id
        where cm.company_id = p_company_id
      ) m
    ), '[]'::jsonb),
    'subscription', (
      select jsonb_build_object(
        'id', s.id, 'status', s.status, 'starts_at', s.starts_at, 'expires_at', s.expires_at,
        'cancelled_at', s.cancelled_at, 'provider', s.provider, 'updated_at', s.updated_at,
        'access_active', s.status in ('trialing', 'active') and s.expires_at > now(),
        'days_left', greatest(0, ceil(extract(epoch from (s.expires_at - now())) / 86400.0))::int,
        'plan', jsonb_build_object('id', pl.id, 'code', pl.code, 'name', pl.name, 'price', pl.price,
                                   'currency', pl.currency, 'access_duration_days', pl.access_duration_days, 'trial', pl.trial)
      )
      from public.subscriptions s join public.plans pl on pl.id = s.plan_id
      where s.company_id = p_company_id
    ),
    'payments', coalesce((
      select jsonb_agg(x order by x.created_at desc) from (
        select sp.id, sp.provider, sp.method, sp.status, sp.amount, sp.currency, sp.paid_at, sp.created_at,
               sp.external_reference, pl.name as plan_name
        from public.subscription_payments sp join public.plans pl on pl.id = sp.plan_id
        where sp.company_id = p_company_id
        order by sp.created_at desc limit 10
      ) x
    ), '[]'::jsonb),
    'paid_total', coalesce((select sum(amount) from public.subscription_payments where company_id = p_company_id and status = 'paid'), 0),
    -- uso: contagens reais das tabelas do próprio Prime Ges (nada estimado)
    'usage', jsonb_build_object(
      'customers', (select count(*) from public.customers where company_id = p_company_id),
      'products', (select count(*) from public.products where company_id = p_company_id),
      'services', (select count(*) from public.services where company_id = p_company_id),
      'sales_total', (select count(*) from public.sales where company_id = p_company_id),
      'sales_last_30d', (select count(*) from public.sales where company_id = p_company_id and created_at >= now() - interval '30 days'),
      'appointments', (select count(*) from public.appointments where company_id = p_company_id),
      'last_sale_at', (select max(created_at) from public.sales where company_id = p_company_id)
    ),
    'audit', coalesce((
      select jsonb_agg(y order by y.created_at desc) from (
        select a.id, a.action, public.platform_audit_category(a.action) as category, a.created_at,
               ap.email as actor_email, ap.full_name as actor_name,
               public.platform_safe_metadata(a.metadata) as metadata
        from public.audit_logs a left join public.profiles ap on ap.user_id = a.actor_user_id
        where a.company_id = p_company_id and a.action like 'platform.%'
          and (v_is_super or a.actor_user_id = v_actor)
        order by a.created_at desc limit 20
      ) y
    ), '[]'::jsonb)
  );
end;
$function$;

revoke all on function public.get_platform_company_detail(uuid) from public, anon;
grant execute on function public.get_platform_company_detail(uuid) to authenticated;

-- -------------------------------------------------------- admin_update_user_profile
-- Único campo editável por administrador: full_name. clerk_user_id, e-mail, role e
-- status NÃO passam por aqui (identidade é do Clerk; papel/status têm RPCs próprias).
create or replace function public.admin_update_user_profile(p_user_id uuid, p_full_name text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_actor uuid := public.current_profile_user_id();
  v_actor_super boolean := public.is_super_admin();
  v_target public.profiles;
  v_name text := nullif(trim(coalesce(p_full_name, '')), '');
begin
  if not public.is_platform_admin() then
    raise exception 'not authorized';
  end if;

  if p_user_id is null or v_name is null or char_length(v_name) > 160 then
    raise exception 'Parâmetros inválidos.';
  end if;

  select * into v_target from public.profiles where user_id = p_user_id for update;
  if not found then
    raise exception 'Usuário não encontrado.';
  end if;

  if not v_actor_super and p_user_id <> v_actor and v_target.role <> 'user' then
    raise exception 'Sem permissão para alterar este usuário.';
  end if;

  if v_target.full_name is not distinct from v_name then
    raise exception 'O nome já é este.';
  end if;

  update public.profiles set full_name = v_name where user_id = p_user_id;

  perform public.write_platform_audit_log(
    'platform.user.profile_updated', 'profile', p_user_id, null, p_user_id,
    jsonb_build_object('field', 'full_name', 'from', v_target.full_name, 'to', v_name)
  );
end;
$function$;

revoke all on function public.admin_update_user_profile(uuid, text) from public, anon;
grant execute on function public.admin_update_user_profile(uuid, text) to authenticated;

-- ---------------------------------------------------------- admin_find_user_by_email
-- SUPER_ADMIN ONLY: localiza um perfil EXISTENTE pelo e-mail (para promover a administrador).
-- Nunca cria identidade; se houver mais de um, não escolhe.
create or replace function public.admin_find_user_by_email(p_email text)
 returns table (user_id uuid, full_name text, email text, role public.user_role, status public.user_status, clerk_linked boolean)
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
#variable_conflict use_column
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_count integer;
begin
  if not public.is_super_admin() then
    raise exception 'not authorized';
  end if;

  if v_email = '' or char_length(v_email) > 254 then
    raise exception 'Parâmetros inválidos.';
  end if;

  select count(*) into v_count from public.profiles p where lower(p.email) = v_email;
  if v_count = 0 then
    raise exception 'Usuário não encontrado.';
  end if;
  if v_count > 1 then
    raise exception 'Mais de um perfil com este e-mail; não é possível escolher.';
  end if;

  return query
  select p.user_id, p.full_name, p.email, p.role, p.status, (p.clerk_user_id is not null)
  from public.profiles p where lower(p.email) = v_email;
end;
$function$;

revoke all on function public.admin_find_user_by_email(text) from public, anon;
grant execute on function public.admin_find_user_by_email(text) to authenticated;
