-- Phase 2: RPC/RBAC/Governance hardening.
--
-- Applied to Supabase as migration:
-- 20260923115135_phase2_rpc_rbac_governance_hardening

revoke all on table public.payment_events from anon, authenticated;
revoke all on table public.finance_default_seed_guard from anon, authenticated;
revoke insert, update, delete on table public.audit_logs from anon, authenticated;

do $$
declare
  r record;
begin
  for r in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and 'public' = any(roles)
  loop
    execute format(
      'alter policy %I on %I.%I to authenticated',
      r.policyname, r.schemaname, r.tablename
    );
  end loop;
end
$$;

alter extension postgres_fdw set schema extensions;

create or replace function public.add_existing_company_member(
  p_email text,
  p_role company_role default 'employee'::company_role
)
returns company_members
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user_id uuid;
  v_company_id uuid;
  v_actor_role public.company_role;
  v_row public.company_members;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.';
  end if;

  select company_id, role into v_company_id, v_actor_role
  from public.company_members
  where user_id = auth.uid()
  order by created_at asc
  limit 1;

  if v_company_id is null then raise exception 'Nenhuma empresa encontrada.'; end if;
  if v_actor_role not in ('owner','admin') then raise exception 'Apenas owner/admin podem adicionar colaboradores.'; end if;
  if p_role = 'owner' then raise exception 'Novo colaborador deve entrar como admin ou employee.'; end if;
  if nullif(trim(p_email), '') is null then raise exception 'Informe o e-mail do colaborador.'; end if;

  select user_id into v_user_id
  from public.profiles
  where lower(email) = lower(trim(p_email))
  limit 1;

  if v_user_id is null then
    raise exception 'Usuário não encontrado. A pessoa precisa criar a conta no Prime Ges antes de ser adicionada.';
  end if;

  if exists (
    select 1 from public.company_members
    where company_id = v_company_id and user_id = v_user_id
  ) then
    raise exception 'Este usuário já pertence à empresa.';
  end if;

  insert into public.company_members(company_id, user_id, role)
  values(v_company_id, v_user_id, p_role)
  returning * into v_row;

  insert into public.audit_logs (
    company_id, actor_user_id, entity_type, entity_id, action, metadata
  ) values (
    v_company_id, auth.uid(), 'company_member', v_row.id, 'company_member.added',
    jsonb_build_object('member_user_id', v_row.user_id, 'role', v_row.role)
  );

  return v_row;
end;
$function$;

create or replace function public.update_company_member_role(
  p_member_id uuid,
  p_role company_role
)
returns company_members
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_company_id uuid;
  v_actor_role public.company_role;
  v_target public.company_members;
  v_owner_count integer;
  v_previous_role public.company_role;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.';
  end if;

  select company_id, role into v_company_id, v_actor_role
  from public.company_members
  where user_id = auth.uid()
  order by created_at asc
  limit 1;

  if v_company_id is null then raise exception 'Nenhuma empresa encontrada.'; end if;
  if v_actor_role not in ('owner','admin') then raise exception 'Apenas owner/admin podem alterar permissões.'; end if;

  select * into v_target
  from public.company_members
  where id = p_member_id and company_id = v_company_id
  for update;

  if v_target is null then raise exception 'Colaborador não encontrado.'; end if;

  v_previous_role := v_target.role;

  if v_target.role = 'owner' and p_role <> 'owner' then
    select count(*) into v_owner_count
    from public.company_members
    where company_id = v_company_id and role = 'owner';
    if v_owner_count <= 1 then
      raise exception 'A empresa precisa manter pelo menos um owner.';
    end if;
  end if;

  if p_role = 'owner' and v_actor_role <> 'owner' then
    raise exception 'Somente owner pode promover outro colaborador a owner.';
  end if;

  update public.company_members
  set role = p_role
  where id = p_member_id
  returning * into v_target;

  insert into public.audit_logs (
    company_id, actor_user_id, entity_type, entity_id, action, metadata
  ) values (
    v_company_id, auth.uid(), 'company_member', v_target.id, 'company_member.role_changed',
    jsonb_build_object(
      'member_user_id', v_target.user_id,
      'previous_role', v_previous_role,
      'new_role', v_target.role
    )
  );

  return v_target;
end;
$function$;

create or replace function public.remove_company_member(
  p_member_id uuid
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_company_id uuid;
  v_actor_role public.company_role;
  v_target public.company_members;
  v_owner_count integer;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.';
  end if;

  select company_id, role into v_company_id, v_actor_role
  from public.company_members
  where user_id = auth.uid()
  order by created_at asc
  limit 1;

  if v_company_id is null then raise exception 'Nenhuma empresa encontrada.'; end if;
  if v_actor_role not in ('owner','admin') then raise exception 'Apenas owner/admin podem remover colaboradores.'; end if;

  select * into v_target
  from public.company_members
  where id = p_member_id and company_id = v_company_id
  for update;

  if v_target is null then raise exception 'Colaborador não encontrado.'; end if;
  if v_target.user_id = auth.uid() and v_target.role = 'owner' then raise exception 'O owner atual não pode remover a própria conta.'; end if;

  if v_target.role = 'owner' then
    select count(*) into v_owner_count
    from public.company_members
    where company_id = v_company_id and role = 'owner';
    if v_owner_count <= 1 then
      raise exception 'Não é possível remover o último owner.';
    end if;
    if v_actor_role <> 'owner' then
      raise exception 'Somente owner pode remover outro owner.';
    end if;
  end if;

  delete from public.company_members where id = p_member_id;

  insert into public.audit_logs (
    company_id, actor_user_id, entity_type, entity_id, action, metadata
  ) values (
    v_company_id, auth.uid(), 'company_member', p_member_id, 'company_member.removed',
    jsonb_build_object('member_user_id', v_target.user_id, 'role', v_target.role)
  );
end;
$function$;

revoke all on function public.add_existing_company_member(text, public.company_role) from public;
revoke all on function public.update_company_member_role(uuid, public.company_role) from public;
revoke all on function public.remove_company_member(uuid) from public;
grant execute on function public.add_existing_company_member(text, public.company_role) to authenticated, service_role;
grant execute on function public.update_company_member_role(uuid, public.company_role) to authenticated, service_role;
grant execute on function public.remove_company_member(uuid) to authenticated, service_role;
