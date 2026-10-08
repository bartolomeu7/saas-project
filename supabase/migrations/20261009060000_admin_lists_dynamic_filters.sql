-- =============================================================================
-- Listas administrativas: filtros montados dinamicamente (somente TEST nesta fase)
--
-- Achado de performance (B20): com os filtros escritos como "($n is null or coluna = $n)"
-- o planejador do plpgsql não elimina as condições inativas; combinando dois filtros
-- (ex.: plano + assinatura) ele estimava 1 linha, escolhia um plano ruim e a consulta
-- virava O(n²) (5.000 usuários = ~41 s). A correção é montar o WHERE só com os filtros
-- realmente informados (EXECUTE ... USING: valores SEMPRE como parâmetros, nunca
-- concatenados; ORDER BY vem de uma lista fixa), de modo que cada combinação ganha um
-- plano próprio e correto.
--
-- Causa raiz confirmada com EXPLAIN: o filtro `pl.code = ...` na cláusula WHERE tornava
-- os LEFT JOINs "inner" e o planejador reordenava as junções (produto cartesiano
-- profiles × subscriptions por plan_id = 1,7 milhão de linhas com 1.500 usuários).
-- A CTE `base` agora é MATERIALIZED (barreira de otimização): as junções são resolvidas
-- uma vez, na ordem correta, e só depois filtradas. Vale também para empresas e assinaturas.
-- =============================================================================

-- ------------------------------------------------------- list_platform_admin_users
create or replace function public.list_platform_admin_users(
  p_search text default null,
  p_status public.user_status default null,
  p_role public.user_role default null,
  p_plan_code text default null,
  p_subscription text default null,
  p_presence text default null,
  p_sort text default 'created_desc',
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
declare
  v_pattern text;
  v_limit integer := least(greatest(coalesce(p_limit, 25), 1), 100);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_where text := '';
  v_order text;
  v_sql text;
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
    v_where := v_where || E'\n and (b.b_email ilike $6 escape ''\\'' or b.b_full_name ilike $6 escape ''\\'' or b.b_company_name ilike $6 escape ''\\'')';
  end if;
  if p_status is not null then v_where := v_where || ' and b.b_status = $1'; end if;
  if p_role is not null then v_where := v_where || ' and b.b_role = $2'; end if;
  if p_plan_code is not null then v_where := v_where || ' and b.b_plan_code = $3'; end if;
  if p_subscription is not null then v_where := v_where || ' and b.b_sub_state = $4'; end if;
  if p_presence is not null then v_where := v_where || ' and b.b_presence = $5'; end if;

  v_order := case p_sort
    when 'name_asc' then 'lower(coalesce(b.b_full_name, b.b_email)) asc nulls last, b.b_created_at desc, b.b_user_id'
    when 'last_seen_desc' then 'b.b_last_seen_at desc nulls last, b.b_created_at desc, b.b_user_id'
    when 'expires_asc' then 'b.b_sub_expires asc nulls last, b.b_created_at desc, b.b_user_id'
    when 'created_asc' then 'b.b_created_at asc, b.b_user_id'
    else 'b.b_created_at desc, b.b_user_id'
  end;

  v_sql := $sql$
    with base as materialized (
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
    where true $sql$ || v_where || ' order by ' || v_order || ' limit $7 offset $8';

  return query execute v_sql using p_status, p_role, p_plan_code, p_subscription, p_presence, v_pattern, v_limit, v_offset;
end;
$function$;

revoke all on function public.list_platform_admin_users(text, public.user_status, public.user_role, text, text, text, text, integer, integer)
  from public, anon;
grant execute on function public.list_platform_admin_users(text, public.user_status, public.user_role, text, text, text, text, integer, integer)
  to authenticated;

-- --------------------------------------------------- list_platform_admin_companies
create or replace function public.list_platform_admin_companies(
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
  with base as materialized (
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

-- ------------------------------------------------------- list_platform_subscriptions
create or replace function public.list_platform_subscriptions(
  p_search text default null,
  p_state text default null,          -- active | trialing | expired | cancelled | pending
  p_plan_code text default null,
  p_provider text default null,
  p_expiring_days integer default null,
  p_sort text default 'expires_asc',  -- expires_asc | expires_desc | updated_desc | company_asc
  p_limit integer default 25,
  p_offset integer default 0
)
 returns table (
  subscription_id uuid,
  company_id uuid,
  company_name text,
  company_status public.company_status,
  plan_code text,
  plan_name text,
  status public.subscription_status,
  state text,
  starts_at timestamptz,
  expires_at timestamptz,
  days_left integer,
  provider text,
  paid_total numeric,
  last_paid_at timestamptz,
  updated_at timestamptz,
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
  if p_state is not null and p_state not in ('active', 'trialing', 'expired', 'cancelled', 'pending') then
    raise exception 'Filtro de estado inválido.';
  end if;
  if p_expiring_days is not null and (p_expiring_days < 1 or p_expiring_days > 365) then
    raise exception 'Janela de vencimento inválida.';
  end if;
  if nullif(trim(coalesce(p_search, '')), '') is not null then
    v_pattern := '%' || replace(replace(replace(trim(p_search), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;

  return query
  with base as materialized (
    select
      s.id as b_id, s.company_id as b_company, c.name as b_cname, c.status as b_cstatus,
      pl.code as b_pcode, pl.name as b_pname, s.status as b_status,
      case
        when s.status = 'cancelled' then 'cancelled'
        when s.status = 'pending' then 'pending'
        when s.status in ('trialing', 'active') and s.expires_at > now() then s.status::text
        else 'expired'
      end as b_state,
      s.starts_at as b_starts, s.expires_at as b_expires,
      greatest(0, ceil(extract(epoch from (s.expires_at - now())) / 86400.0))::integer as b_days,
      s.provider as b_provider,
      coalesce((select sum(sp.amount) from public.subscription_payments sp where sp.company_id = s.company_id and sp.status = 'paid'), 0) as b_paid,
      (select max(sp.paid_at) from public.subscription_payments sp where sp.company_id = s.company_id and sp.status = 'paid') as b_last_paid,
      s.updated_at as b_updated
    from public.subscriptions s
    join public.companies c on c.id = s.company_id
    join public.plans pl on pl.id = s.plan_id
  )
  select b.b_id, b.b_company, b.b_cname, b.b_cstatus, b.b_pcode, b.b_pname, b.b_status, b.b_state,
         b.b_starts, b.b_expires, b.b_days, b.b_provider, b.b_paid, b.b_last_paid, b.b_updated,
         count(*) over ()
  from base b
  where (p_state is null or b.b_state = p_state)
    and (p_plan_code is null or b.b_pcode = p_plan_code)
    and (p_provider is null or b.b_provider = p_provider)
    and (p_expiring_days is null or (b.b_state in ('active', 'trialing') and b.b_expires <= now() + make_interval(days => p_expiring_days)))
    and (v_pattern is null or b.b_cname ilike v_pattern escape '\')
  order by
    case when p_sort = 'expires_desc' then b.b_expires end desc,
    case when p_sort = 'updated_desc' then b.b_updated end desc,
    case when p_sort = 'company_asc' then lower(b.b_cname) end asc,
    case when p_sort = 'expires_asc' then b.b_expires end asc,
    b.b_id
  limit v_limit offset v_offset;
end;
$function$;
revoke all on function public.list_platform_subscriptions(text, text, text, text, integer, text, integer, integer) from public, anon;
grant execute on function public.list_platform_subscriptions(text, text, text, text, integer, text, integer, integer) to authenticated;
