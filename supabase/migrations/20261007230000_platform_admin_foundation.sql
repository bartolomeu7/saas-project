-- =============================================================================
-- Painel administrativo da PLATAFORMA — fundação (segurança + leitura + auditoria)
--
-- Reaproveita is_platform_admin() (migration 033) como única regra de acesso.
-- Nenhuma tabela é aberta globalmente: toda leitura cross-empresa passa por
-- RPC SECURITY DEFINER que exige is_platform_admin() (role admin|super_admin
-- E status active). RLS das tabelas de negócio permanece intacta.
--
-- 1. profiles: identidade e telemetria deixam de ser editáveis pelo usuário.
-- 2. audit_logs: passa a aceitar eventos de plataforma (company_id opcional,
--    target_user_id) e a leitura de admin usa is_platform_admin().
-- 3. write_platform_audit_log(): ÚNICO caminho de escrita de auditoria de admin;
--    só chamável por outras funções SECURITY DEFINER (não exposta à API).
-- 4. get_platform_admin_overview(): contagens de assinatura corretas (considera
--    expires_at; nada grava status 'expired').
-- 5. list_platform_admin_companies(): evolui a RPC existente (busca, status,
--    paginação, plano, dono). Chamada sem argumentos continua válida.
-- 6. list_platform_admin_users(): lista paginada de usuários da plataforma.
-- =============================================================================

-- ---------------------------------------------------------------- 1. profiles
-- Mantém as proteções existentes (user_id, role, status) e acrescenta o que o
-- painel exibe como fonte de verdade: clerk_user_id (vínculo de identidade),
-- email e last_login_at. service_role continua livre. Nenhum fluxo do app
-- atualiza profiles (só leitura), então nada existente depende desses campos.
create or replace function public.protect_profile_restricted_fields()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
begin
  if auth.role() = 'service_role' then
    return new;
  end if;

  if new.user_id is distinct from old.user_id then
    raise exception 'Não é permitido alterar user_id.';
  end if;

  if new.role is distinct from old.role then
    raise exception 'Não é permitido alterar a própria role. Essa alteração é restrita ao sistema administrativo.';
  end if;

  if new.status is distinct from old.status then
    raise exception 'Não é permitido alterar o próprio status. Essa alteração é restrita ao sistema administrativo.';
  end if;

  if new.clerk_user_id is distinct from old.clerk_user_id then
    raise exception 'Não é permitido alterar o vínculo de identidade (clerk_user_id).';
  end if;

  if new.email is distinct from old.email then
    raise exception 'Não é permitido alterar o e-mail do perfil.';
  end if;

  if new.last_login_at is distinct from old.last_login_at then
    raise exception 'Não é permitido alterar last_login_at.';
  end if;

  return new;
end;
$function$;

-- --------------------------------------------------------------- 2. audit_logs
-- Eventos de plataforma (ex.: alterar role de um usuário sem empresa) não têm
-- company_id; o usuário afetado fica em target_user_id.
alter table public.audit_logs alter column company_id drop not null;

alter table public.audit_logs
  add column if not exists target_user_id uuid references public.profiles(user_id) on delete set null;

create index if not exists idx_audit_logs_target_user_id on public.audit_logs (target_user_id);
create index if not exists idx_audit_logs_created_at on public.audit_logs (created_at desc);

-- Leitura: membros da própria empresa OU platform admin. Passa a usar
-- is_platform_admin() (que também exige status active) em vez de checar só a role.
alter policy audit_logs_select_own_company on public.audit_logs
  using (
    company_id in (
      select cm.company_id
      from public.company_members cm
      where cm.user_id = (select public.current_profile_user_id())
    )
    or (select public.is_platform_admin())
  );

-- ------------------------------------------------- 3. write_platform_audit_log
create or replace function public.write_platform_audit_log(
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_company_id uuid default null,
  p_target_user_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_actor uuid := public.current_profile_user_id();
  v_meta jsonb := coalesce(p_metadata, '{}'::jsonb);
begin
  if not public.is_platform_admin() then
    raise exception 'not authorized';
  end if;

  if p_entity_id is null
     or nullif(trim(p_entity_type), '') is null or char_length(p_entity_type) > 64
     or p_action is null or char_length(p_action) > 96
     or p_action !~ '^platform\.[a-z_]+(\.[a-z_]+)*$' then
    raise exception 'Evento de auditoria inválido.';
  end if;

  if jsonb_typeof(v_meta) <> 'object' or pg_column_size(v_meta) > 8192 then
    raise exception 'Metadados de auditoria inválidos.';
  end if;

  if p_company_id is not null
     and not exists (select 1 from public.companies c where c.id = p_company_id) then
    raise exception 'Empresa inválida.';
  end if;

  if p_target_user_id is not null
     and not exists (select 1 from public.profiles p where p.user_id = p_target_user_id) then
    raise exception 'Usuário afetado inválido.';
  end if;

  insert into public.audit_logs (
    company_id, actor_user_id, target_user_id, entity_type, entity_id, action, metadata
  ) values (
    p_company_id, v_actor, p_target_user_id, p_entity_type, p_entity_id, p_action,
    v_meta || jsonb_build_object('_origin', 'platform_admin')
  );
end;
$function$;

-- Não exposta à API: só funções SECURITY DEFINER do próprio banco a chamam.
revoke all on function public.write_platform_audit_log(text, text, uuid, uuid, uuid, jsonb)
  from public, anon, authenticated;

-- --------------------------------------------- 4. get_platform_admin_overview
-- Antes: contava status='active'/'expired' armazenado, ignorando expires_at —
-- e nada grava 'expired'. Agora o acesso é avaliado como no guard do app
-- (status E expires_at). Sem consumidores anteriores; assinatura recriada.
drop function if exists public.get_platform_admin_overview();

create function public.get_platform_admin_overview()
 returns table (
  total_users bigint,
  active_users bigint,
  inactive_users bigint,
  suspended_users bigint,
  platform_admins bigint,
  total_companies bigint,
  active_companies bigint,
  inactive_companies bigint,
  subscriptions_active bigint,
  subscriptions_trialing bigint,
  subscriptions_expired bigint,
  subscriptions_cancelled bigint,
  companies_without_subscription bigint,
  active_plans bigint
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
  select
    (select count(*) from public.profiles),
    (select count(*) from public.profiles p where p.status = 'active'),
    (select count(*) from public.profiles p where p.status = 'inactive'),
    (select count(*) from public.profiles p where p.status = 'suspended'),
    (select count(*) from public.profiles p where p.role in ('admin', 'super_admin')),
    (select count(*) from public.companies),
    (select count(*) from public.companies c where c.status = 'active'),
    (select count(*) from public.companies c where c.status = 'inactive'),
    (select count(*) from public.subscriptions s where s.status = 'active' and s.expires_at > now()),
    (select count(*) from public.subscriptions s where s.status = 'trialing' and s.expires_at > now()),
    (select count(*) from public.subscriptions s
       where s.status = 'expired'
          or (s.status in ('trialing', 'active') and s.expires_at <= now())),
    (select count(*) from public.subscriptions s where s.status = 'cancelled'),
    (select count(*) from public.companies c
       where not exists (select 1 from public.subscriptions s where s.company_id = c.id)),
    (select count(*) from public.plans pl where pl.status = 'active');
end;
$function$;

revoke all on function public.get_platform_admin_overview() from public, anon;
grant execute on function public.get_platform_admin_overview() to authenticated;

-- ---------------------------------------- 5. list_platform_admin_companies
-- Evolução da RPC existente (era: sem argumentos, 100 mais novas). Os mesmos
-- campos continuam presentes; chamada sem argumentos segue válida (defaults).
drop function if exists public.list_platform_admin_companies();

create function public.list_platform_admin_companies(
  p_search text default null,
  p_status public.company_status default null,
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
begin
  if not public.is_platform_admin() then
    raise exception 'not authorized';
  end if;

  if nullif(trim(coalesce(p_search, '')), '') is not null then
    v_pattern := '%' || replace(replace(replace(trim(p_search), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;

  return query
  select
    c.id,
    c.name,
    c.business_type,
    c.status,
    c.created_at,
    (select count(*) from public.company_members cm where cm.company_id = c.id),
    o.full_name,
    o.email,
    pl.code,
    pl.name,
    s.status,
    s.expires_at,
    coalesce(s.status in ('trialing', 'active') and s.expires_at > now(), false),
    count(*) over ()
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
  where (p_status is null or c.status = p_status)
    and (
      v_pattern is null
      or c.name ilike v_pattern escape '\'
      or o.email ilike v_pattern escape '\'
      or o.full_name ilike v_pattern escape '\'
    )
  order by c.created_at desc, c.id
  limit v_limit offset v_offset;
end;
$function$;

revoke all on function public.list_platform_admin_companies(text, public.company_status, integer, integer)
  from public, anon;
grant execute on function public.list_platform_admin_companies(text, public.company_status, integer, integer)
  to authenticated;

-- ------------------------------------------- 6. list_platform_admin_users
-- Não devolve clerk_user_id (apenas se existe vínculo). Empresa/plano são os da
-- membership mais antiga do usuário (hoje um usuário pertence a uma empresa).
create function public.list_platform_admin_users(
  p_search text default null,
  p_status public.user_status default null,
  p_role public.user_role default null,
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
  last_login_at timestamptz,
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
begin
  if not public.is_platform_admin() then
    raise exception 'not authorized';
  end if;

  if nullif(trim(coalesce(p_search, '')), '') is not null then
    v_pattern := '%' || replace(replace(replace(trim(p_search), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;

  return query
  select
    p.user_id,
    p.full_name,
    p.email,
    p.role,
    p.status,
    p.created_at,
    p.last_login_at,
    (p.clerk_user_id is not null),
    m.company_id,
    c.name,
    m.role,
    pl.code,
    pl.name,
    s.status,
    s.expires_at,
    coalesce(s.status in ('trialing', 'active') and s.expires_at > now(), false),
    count(*) over ()
  from public.profiles p
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
  where (p_status is null or p.status = p_status)
    and (p_role is null or p.role = p_role)
    and (
      v_pattern is null
      or p.email ilike v_pattern escape '\'
      or p.full_name ilike v_pattern escape '\'
      or c.name ilike v_pattern escape '\'
    )
  order by p.created_at desc, p.user_id
  limit v_limit offset v_offset;
end;
$function$;

revoke all on function public.list_platform_admin_users(text, public.user_status, public.user_role, integer, integer)
  from public, anon;
grant execute on function public.list_platform_admin_users(text, public.user_status, public.user_role, integer, integer)
  to authenticated;
