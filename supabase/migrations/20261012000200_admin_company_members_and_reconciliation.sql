-- =============================================================================
-- Missão 08 — (1) gestão administrativa de membros e propriedade das empresas; (2) reconciliação de pagamentos pendentes.
--
-- Membros (modelo atual: 1 empresa por usuário, papéis owner/admin/employee, limite de adicionais pelo entitlement):
--   admin_add_company_member            platform admin   adiciona perfil EXISTENTE e ATIVO como admin/employee, sem estourar o limite do plano
--                                                        e sem permitir que o usuário pertença a duas empresas
--   admin_set_company_member_role       platform admin   admin <-> employee (nunca mexe em owner)
--   admin_remove_company_member         platform admin   remove não-owner
--   admin_transfer_company_ownership    SUPER_ADMIN      transfere a propriedade a um membro ativo, atomicamente (um único owner ao final)
-- Todas: SECURITY DEFINER, autoridade no banco, motivo obrigatório, auditoria (platform.company.*), lock por empresa;
-- adicionar/transferir aceitam chave de idempotência (platform_begin_operation).
-- Autoprivilégio: ninguém se adiciona a uma empresa nem muda o próprio papel nela; só super_admin adiciona outro
-- administrador da plataforma (o vínculo dá acesso por RLS aos dados do tenant). Provado em TEST (company_members_reconcile.sql).
--
-- Reconciliação: platform_reconcile_candidates() lista cobranças EvoPay pendentes (com cobrança já criada no provedor) para o
-- servidor reconsultar o provedor (GET /pix?id=) uma a uma; admin_audit_reconciliation() registra o resultado agregado.
-- O webhook da EvoPay tem uma única tentativa e não é assinado: esta é a rede de segurança operacional.
-- ROLLBACK: supabase/rollback/20261012000200_admin_company_members_and_reconciliation.down.sql
-- =============================================================================

-- ------------------------------------------------------------------ membros
create or replace function public.admin_add_company_member(
  p_company_id uuid,
  p_email text,
  p_role public.company_role,
  p_reason text,
  p_request_key uuid
)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_reason text;
  v_replay jsonb;
  v_user public.profiles;
  v_company public.companies;
  v_max integer;
  v_current integer;
  v_row public.company_members;
  v_result jsonb;
begin
  if not public.is_platform_admin() then
    raise exception 'not authorized';
  end if;
  v_reason := public.platform_clean_reason(p_reason);
  perform public.platform_assert_company(p_company_id);
  if p_role is null or p_role not in ('admin', 'employee') then
    raise exception 'O novo colaborador deve entrar como admin ou employee.';
  end if;
  if nullif(trim(coalesce(p_email, '')), '') is null or char_length(p_email) > 254 then
    raise exception 'Informe o e-mail do colaborador.';
  end if;

  v_replay := public.platform_begin_operation(p_request_key, 'member_add', p_company_id);
  if v_replay is not null then
    return v_replay || jsonb_build_object('replayed', true);
  end if;

  select * into v_company from public.companies where id = p_company_id;
  if v_company.status <> 'active' then
    raise exception 'A empresa está inativa.';
  end if;

  select * into v_user from public.profiles where lower(email) = lower(trim(p_email)) limit 1;
  if not found then
    raise exception 'Usuário não encontrado. A pessoa precisa criar a conta no Prime Ges antes de ser adicionada.';
  end if;
  if v_user.status <> 'active' then
    raise exception 'O usuário precisa estar ativo para ser adicionado.';
  end if;
  -- Ninguém concede a si mesmo acesso aos dados de uma empresa-cliente, e um administrador comum não coloca outro
  -- administrador da plataforma dentro de uma empresa (o vínculo dá acesso por RLS aos dados do tenant): só super_admin.
  if v_user.user_id = public.current_profile_user_id() then
    raise exception 'Você não pode adicionar a si mesmo a uma empresa.';
  end if;
  if v_user.role in ('admin', 'super_admin') and not public.is_super_admin() then
    raise exception 'Somente um super administrador pode adicionar um administrador da plataforma a uma empresa.';
  end if;

  -- mesma chave de lock de create_company_with_owner: evita corrida entre "criar empresa" e "ser adicionado"
  perform pg_advisory_xact_lock(hashtext(v_user.user_id::text));
  perform pg_advisory_xact_lock(hashtext('company_members:' || p_company_id::text));

  if exists (select 1 from public.company_members where user_id = v_user.user_id) then
    raise exception 'Este usuário já pertence a uma empresa.';
  end if;

  select ce.max_additional_users into v_max from public.company_entitlements ce where ce.company_id = p_company_id for update;
  select count(*) into v_current from public.company_members where company_id = p_company_id and role <> 'owner';
  if v_current >= coalesce(v_max, 0) then
    raise exception 'Limite de usuários do plano atingido (% usuário(s) adicional(is) além do proprietário).', coalesce(v_max, 0);
  end if;

  insert into public.company_members (company_id, user_id, role)
  values (p_company_id, v_user.user_id, p_role)
  returning * into v_row;

  perform public.write_platform_audit_log(
    'platform.company.member_added', 'company_member', v_row.id, p_company_id, v_user.user_id,
    jsonb_build_object('reason', v_reason, 'role', p_role)
  );

  v_result := jsonb_build_object('member_id', v_row.id, 'user_id', v_user.user_id, 'role', v_row.role);
  perform public.platform_finish_operation(p_request_key, v_result);
  return v_result || jsonb_build_object('replayed', false);
end;
$function$;
revoke all on function public.admin_add_company_member(uuid, text, public.company_role, text, uuid) from public, anon;
grant execute on function public.admin_add_company_member(uuid, text, public.company_role, text, uuid) to authenticated;

create or replace function public.admin_set_company_member_role(
  p_company_id uuid,
  p_user_id uuid,
  p_role public.company_role,
  p_reason text
)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_reason text;
  v_target public.company_members;
begin
  if not public.is_platform_admin() then
    raise exception 'not authorized';
  end if;
  v_reason := public.platform_clean_reason(p_reason);
  perform public.platform_assert_company(p_company_id);
  if p_role is null or p_role not in ('admin', 'employee') then
    raise exception 'Papel inválido. Para trocar o proprietário use a transferência de propriedade.';
  end if;
  if p_user_id is not distinct from public.current_profile_user_id() then
    raise exception 'Você não pode alterar o seu próprio papel na empresa.';
  end if;

  perform pg_advisory_xact_lock(hashtext('company_members:' || p_company_id::text));
  select * into v_target from public.company_members where company_id = p_company_id and user_id = p_user_id for update;
  if not found then
    raise exception 'Colaborador não encontrado nesta empresa.';
  end if;
  if v_target.role = 'owner' then
    raise exception 'O proprietário não muda de papel aqui. Use a transferência de propriedade.';
  end if;
  if v_target.role = p_role then
    raise exception 'O colaborador já tem este papel.';
  end if;

  update public.company_members set role = p_role where id = v_target.id;

  perform public.write_platform_audit_log(
    'platform.company.member_role_changed', 'company_member', v_target.id, p_company_id, p_user_id,
    jsonb_build_object('reason', v_reason, 'previous_role', v_target.role, 'new_role', p_role)
  );
end;
$function$;
revoke all on function public.admin_set_company_member_role(uuid, uuid, public.company_role, text) from public, anon;
grant execute on function public.admin_set_company_member_role(uuid, uuid, public.company_role, text) to authenticated;

create or replace function public.admin_remove_company_member(
  p_company_id uuid,
  p_user_id uuid,
  p_reason text
)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_reason text;
  v_target public.company_members;
begin
  if not public.is_platform_admin() then
    raise exception 'not authorized';
  end if;
  v_reason := public.platform_clean_reason(p_reason);
  perform public.platform_assert_company(p_company_id);

  perform pg_advisory_xact_lock(hashtext('company_members:' || p_company_id::text));
  select * into v_target from public.company_members where company_id = p_company_id and user_id = p_user_id for update;
  if not found then
    raise exception 'Colaborador não encontrado nesta empresa.';
  end if;
  if v_target.role = 'owner' then
    raise exception 'O proprietário não pode ser removido. Transfira a propriedade antes.';
  end if;

  delete from public.company_members where id = v_target.id;

  perform public.write_platform_audit_log(
    'platform.company.member_removed', 'company_member', v_target.id, p_company_id, p_user_id,
    jsonb_build_object('reason', v_reason, 'role', v_target.role)
  );
end;
$function$;
revoke all on function public.admin_remove_company_member(uuid, uuid, text) from public, anon;
grant execute on function public.admin_remove_company_member(uuid, uuid, text) to authenticated;

create or replace function public.admin_transfer_company_ownership(
  p_company_id uuid,
  p_new_owner_user_id uuid,
  p_reason text,
  p_request_key uuid
)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_reason text;
  v_replay jsonb;
  v_target public.company_members;
  v_profile public.profiles;
  v_prev_owners uuid[];
  v_owner_count integer;
  v_result jsonb;
begin
  if not public.is_super_admin() then
    raise exception 'not authorized';
  end if;
  v_reason := public.platform_clean_reason(p_reason);
  perform public.platform_assert_company(p_company_id);

  v_replay := public.platform_begin_operation(p_request_key, 'ownership_transfer', p_company_id);
  if v_replay is not null then
    return v_replay || jsonb_build_object('replayed', true);
  end if;

  perform pg_advisory_xact_lock(hashtext('company_members:' || p_company_id::text));

  select * into v_target from public.company_members where company_id = p_company_id and user_id = p_new_owner_user_id for update;
  if not found then
    raise exception 'O novo proprietário precisa ser membro da empresa.';
  end if;
  select * into v_profile from public.profiles where user_id = p_new_owner_user_id;
  if v_profile.status <> 'active' then
    raise exception 'O novo proprietário precisa estar com a conta ativa.';
  end if;
  if v_target.role = 'owner' and (select count(*) from public.company_members where company_id = p_company_id and role = 'owner') = 1 then
    raise exception 'Este usuário já é o único proprietário.';
  end if;

  select coalesce(array_agg(user_id), '{}') into v_prev_owners
    from public.company_members where company_id = p_company_id and role = 'owner' and user_id <> p_new_owner_user_id;

  update public.company_members set role = 'admin'
   where company_id = p_company_id and role = 'owner' and user_id <> p_new_owner_user_id;
  update public.company_members set role = 'owner' where id = v_target.id;

  select count(*) into v_owner_count from public.company_members where company_id = p_company_id and role = 'owner';
  if v_owner_count <> 1 then
    raise exception 'Falha de consistência na transferência de propriedade.';
  end if;

  perform public.write_platform_audit_log(
    'platform.company.ownership_transferred', 'company', p_company_id, p_company_id, p_new_owner_user_id,
    jsonb_build_object('reason', v_reason, 'previous_owner_count', coalesce(array_length(v_prev_owners, 1), 0),
                       'previous_role_of_new_owner', v_target.role)
  );

  v_result := jsonb_build_object('company_id', p_company_id, 'new_owner_user_id', p_new_owner_user_id);
  perform public.platform_finish_operation(p_request_key, v_result);
  return v_result || jsonb_build_object('replayed', false);
end;
$function$;
revoke all on function public.admin_transfer_company_ownership(uuid, uuid, text, uuid) from public, anon;
grant execute on function public.admin_transfer_company_ownership(uuid, uuid, text, uuid) to authenticated;

-- ------------------------------------------------------------- reconciliação
create or replace function public.platform_reconcile_candidates(p_limit integer default 25, p_min_age_minutes integer default 10)
 returns table (payment_id uuid, company_id uuid, company_name text, created_at timestamptz, age_minutes integer)
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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
   where sp.provider = 'evopay'
     and sp.status = 'pending'
     and sp.provider_transaction_id is not null
     and sp.created_at < now() - make_interval(mins => v_age)
     and sp.created_at > now() - interval '30 days'
   order by sp.created_at
   limit v_limit;
end;
$function$;
revoke all on function public.platform_reconcile_candidates(integer, integer) from public, anon;
grant execute on function public.platform_reconcile_candidates(integer, integer) to authenticated;

create or replace function public.admin_audit_reconciliation(p_checked integer, p_confirmed integer, p_still_pending integer, p_errors integer)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if not public.is_platform_admin() then
    raise exception 'not authorized';
  end if;
  if p_checked is null or p_checked < 0 or p_checked > 500
     or p_confirmed is null or p_confirmed < 0 or p_still_pending is null or p_still_pending < 0 or p_errors is null or p_errors < 0 then
    raise exception 'Parâmetros inválidos.';
  end if;
  perform public.write_platform_audit_log(
    'platform.payment.reconciled', 'subscription_payment', gen_random_uuid(), null, null,
    jsonb_build_object('checked', p_checked, 'confirmed_paid', p_confirmed, 'still_pending', p_still_pending, 'errors', p_errors)
  );
end;
$function$;
revoke all on function public.admin_audit_reconciliation(integer, integer, integer, integer) from public, anon;
grant execute on function public.admin_audit_reconciliation(integer, integer, integer, integer) to authenticated;
