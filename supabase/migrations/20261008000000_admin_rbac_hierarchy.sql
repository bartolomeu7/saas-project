-- =============================================================================
-- RBAC administrativo: SUPER_ADMIN > ADMIN > USER
--
-- Modelo (o menor possível): continua profiles.role (user | admin | super_admin)
-- + profiles.status. Sem tabela de permissões. Operações críticas verificam
-- super_admin EXPLICITAMENTE; a autorização vem sempre da sessão do ator
-- (current_profile_user_id()), nunca de parâmetros do cliente nem do alvo.
--
-- Regra de acesso ao painel (única, usada por middleware, layout, RPCs e RLS):
--   admin      = role in (admin, super_admin) E status = active  -> is_platform_admin()
--   superadmin = role = super_admin           E status = active  -> is_super_admin()
--
-- Matriz aplicada (default-deny):
--   ver usuários/empresas/planos/assinaturas ........ admin | super_admin
--   suspender/reativar usuário comum (role=user) .... admin | super_admin
--   suspender/reativar admin ou super_admin ......... super_admin
--   alterar role (promover/rebaixar) ................ super_admin
--   alterar status de empresa ....................... super_admin
--   listar administradores .......................... super_admin
--   auditoria ....................................... super_admin: tudo | admin: só as próprias
--   ninguém altera o próprio role/status; a plataforma sempre mantém >= 1 super_admin ativo
-- =============================================================================

-- ------------------------------------------------------------ is_super_admin()
create or replace function public.is_super_admin()
 returns boolean
 language sql
 security definer
 set search_path to 'public'
as $function$
  select exists (
    select 1
    from public.profiles p
    where p.user_id = (select public.current_profile_user_id())
      and p.role = 'super_admin'
      and p.status = 'active'
  );
$function$;

revoke all on function public.is_super_admin() from public, anon;
grant execute on function public.is_super_admin() to authenticated;

-- ------------------------------------------------- trigger de profiles (role/status)
-- Antes: role e status só mudavam com service_role. Agora também mudam DENTRO das
-- RPCs de plataforma abaixo, e somente lá: exige (1) o marcador transacional
-- app.platform_profile_write = on (setado só por essas RPCs) E (2) que o statement
-- rode como dono da função SECURITY DEFINER (current_user fora de authenticated/anon).
-- Quem executa SQL como authenticated não consegue ligar a exceção. user_id,
-- clerk_user_id, email e last_login_at continuam imutáveis para o usuário.
create or replace function public.protect_profile_restricted_fields()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
declare
  v_platform_write boolean :=
    coalesce(current_setting('app.platform_profile_write', true), '') = 'on'
    and current_user not in ('authenticated', 'anon');
begin
  if auth.role() = 'service_role' then
    return new;
  end if;

  if new.user_id is distinct from old.user_id then
    raise exception 'Não é permitido alterar user_id.';
  end if;

  if new.role is distinct from old.role and not v_platform_write then
    raise exception 'Não é permitido alterar a própria role. Essa alteração é restrita ao sistema administrativo.';
  end if;

  if new.status is distinct from old.status and not v_platform_write then
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

-- ----------------------------------------------------------------- policies (RLS)
-- Auditoria: super_admin lê tudo; admin lê só o que ele mesmo fez; membros da
-- empresa continuam lendo a auditoria da própria empresa.
alter policy audit_logs_select_own_company on public.audit_logs
  using (
    company_id in (
      select cm.company_id
      from public.company_members cm
      where cm.user_id = (select public.current_profile_user_id())
    )
    or (select public.is_super_admin())
    or (
      (select public.is_platform_admin())
      and actor_user_id = (select public.current_profile_user_id())
    )
  );

-- Rifas: o acesso cross-empresa de plataforma passa a respeitar status active
-- (antes olhava só a role: um admin suspenso ainda lia rifas de todas as empresas).
alter policy customer_raffles_select_own_company on public.customer_raffles
  using (
    company_id in (
      select cm.company_id
      from public.company_members cm
      where cm.user_id = (select public.current_profile_user_id())
    )
    or (select public.is_platform_admin())
  );

alter policy customer_raffle_entries_select_own_company on public.customer_raffle_entries
  using (
    company_id in (
      select cm.company_id
      from public.company_members cm
      where cm.user_id = (select public.current_profile_user_id())
    )
    or (select public.is_platform_admin())
  );

-- ------------------------------------------------ set_platform_company_status
-- Passa a exigir super_admin (era admin|super_admin) e a auditar pelo caminho
-- único write_platform_audit_log(). Mesma assinatura e retorno.
create or replace function public.set_platform_company_status(p_company_id uuid, p_status public.company_status)
 returns public.companies
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  updated_company public.companies;
begin
  if not public.is_super_admin() then
    raise exception 'not authorized';
  end if;

  update public.companies
  set status = p_status,
      updated_at = now()
  where id = p_company_id
  returning * into updated_company;

  if updated_company.id is null then
    raise exception 'company not found';
  end if;

  perform public.write_platform_audit_log(
    'platform.company.status_changed',
    'company',
    p_company_id,
    p_company_id,
    null,
    jsonb_build_object('status', p_status)
  );

  return updated_company;
end;
$function$;

-- ------------------------------------------------------ set_platform_user_role
-- SUPER_ADMIN ONLY. Promove/rebaixa qualquer outro usuário (user | admin |
-- super_admin). Ninguém altera o próprio papel; a plataforma mantém >= 1
-- super_admin ativo (advisory lock + checagem final contra corrida entre dois
-- super_admins que se rebaixam ao mesmo tempo).
create or replace function public.set_platform_user_role(p_target_user_id uuid, p_role public.user_role)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_actor uuid := public.current_profile_user_id();
  v_target public.profiles;
begin
  if not public.is_super_admin() then
    raise exception 'not authorized';
  end if;

  if p_target_user_id is null or p_role is null then
    raise exception 'Parâmetros inválidos.';
  end if;

  if p_target_user_id = v_actor then
    raise exception 'Não é permitido alterar o próprio papel.';
  end if;

  perform pg_advisory_xact_lock(hashtext('platform_admin_roles'));

  -- Reconfere o ator depois do lock (outra transação pode ter acabado de rebaixá-lo).
  if not public.is_super_admin() then
    raise exception 'not authorized';
  end if;

  select * into v_target from public.profiles where user_id = p_target_user_id for update;

  if not found then
    raise exception 'Usuário não encontrado.';
  end if;

  if v_target.role = p_role then
    raise exception 'O usuário já possui este papel.';
  end if;

  perform set_config('app.platform_profile_write', 'on', true);
  update public.profiles set role = p_role where user_id = p_target_user_id;
  perform set_config('app.platform_profile_write', 'off', true);

  if not exists (
    select 1 from public.profiles p where p.role = 'super_admin' and p.status = 'active'
  ) then
    raise exception 'A plataforma precisa manter ao menos um super_admin ativo.';
  end if;

  perform public.write_platform_audit_log(
    'platform.user.role_changed',
    'profile',
    p_target_user_id,
    null,
    p_target_user_id,
    jsonb_build_object('from', v_target.role, 'to', p_role)
  );
end;
$function$;

-- ---------------------------------------------------- set_platform_user_status
-- admin | super_admin. admin só age sobre usuários comuns (role = user);
-- super_admin age sobre qualquer outro usuário. Ninguém altera o próprio status.
create or replace function public.set_platform_user_status(p_target_user_id uuid, p_status public.user_status)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_actor uuid := public.current_profile_user_id();
  v_actor_role public.user_role;
  v_target public.profiles;
begin
  if not public.is_platform_admin() then
    raise exception 'not authorized';
  end if;

  if p_target_user_id is null or p_status is null then
    raise exception 'Parâmetros inválidos.';
  end if;

  if p_target_user_id = v_actor then
    raise exception 'Não é permitido alterar o próprio status.';
  end if;

  perform pg_advisory_xact_lock(hashtext('platform_admin_roles'));

  if not public.is_platform_admin() then
    raise exception 'not authorized';
  end if;

  select p.role into v_actor_role from public.profiles p where p.user_id = v_actor;

  select * into v_target from public.profiles where user_id = p_target_user_id for update;

  if not found then
    raise exception 'Usuário não encontrado.';
  end if;

  if v_actor_role <> 'super_admin' and v_target.role <> 'user' then
    raise exception 'Sem permissão para alterar este usuário.';
  end if;

  if v_target.status = p_status then
    raise exception 'O usuário já está neste status.';
  end if;

  perform set_config('app.platform_profile_write', 'on', true);
  update public.profiles set status = p_status where user_id = p_target_user_id;
  perform set_config('app.platform_profile_write', 'off', true);

  if not exists (
    select 1 from public.profiles p where p.role = 'super_admin' and p.status = 'active'
  ) then
    raise exception 'A plataforma precisa manter ao menos um super_admin ativo.';
  end if;

  perform public.write_platform_audit_log(
    'platform.user.status_changed',
    'profile',
    p_target_user_id,
    null,
    p_target_user_id,
    jsonb_build_object('from', v_target.status, 'to', p_status, 'target_role', v_target.role)
  );
end;
$function$;

-- ------------------------------------------------- list_platform_administrators
-- SUPER_ADMIN ONLY. Base da futura área /admin/administrators.
create or replace function public.list_platform_administrators()
 returns table (
  user_id uuid,
  full_name text,
  email text,
  role public.user_role,
  status public.user_status,
  created_at timestamptz,
  last_login_at timestamptz,
  clerk_linked boolean
 )
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if not public.is_super_admin() then
    raise exception 'not authorized';
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
    (p.clerk_user_id is not null)
  from public.profiles p
  where p.role in ('admin', 'super_admin')
  order by (p.role = 'super_admin') desc, p.created_at, p.user_id
  limit 200;
end;
$function$;

-- --------------------------------------------------------------------- grants
revoke all on function public.set_platform_company_status(uuid, public.company_status) from public, anon;
grant execute on function public.set_platform_company_status(uuid, public.company_status) to authenticated;

revoke all on function public.set_platform_user_role(uuid, public.user_role) from public, anon;
grant execute on function public.set_platform_user_role(uuid, public.user_role) to authenticated;

revoke all on function public.set_platform_user_status(uuid, public.user_status) from public, anon;
grant execute on function public.set_platform_user_status(uuid, public.user_status) to authenticated;

revoke all on function public.list_platform_administrators() from public, anon;
grant execute on function public.list_platform_administrators() to authenticated;
