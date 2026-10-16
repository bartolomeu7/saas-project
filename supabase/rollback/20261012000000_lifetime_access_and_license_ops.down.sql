-- ROLLBACK de 20261012000000_lifetime_access_and_license_ops.sql (gerado por build-down-20261012.mjs).
-- Volta ao estado ANTERIOR a esta migration (o de 20261011*). RECUSA rodar se existir acesso vitalício: converta-o antes
-- (admin_assign_plan por super_admin, com prazo) — senão a coluna expires_at não pode voltar a ser NOT NULL.
-- Executar como postgres, depois de 20261012000200 e 20261012000100.
begin;

do $guard$
begin
  if exists (select 1 from public.subscriptions where lifetime) then
    raise exception 'Existem assinaturas vitalícias. Converta-as para um plano com prazo antes do rollback.';
  end if;
end $guard$;

drop function if exists public.admin_grant_license(uuid, text, uuid, integer, text, uuid);
drop function if exists public.admin_record_manual_payment(uuid, uuid, numeric, text, text, text, timestamptz, boolean, uuid);
drop function if exists public.platform_apply_access(uuid, uuid, public.subscription_status, timestamptz, timestamptz, text, boolean);

-- ---- platform_apply_access (definição anterior, de 20261009000000_admin_platform_core.sql)
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

-- ---- platform_extend_access_core (definição anterior, de 20261009020000_admin_billing_ops.sql)
create or replace function public.platform_extend_access_core(
  p_company_id uuid,
  p_days integer,
  p_plan_id uuid,
  out o_status public.subscription_status,
  out o_old_expires timestamptz,
  out o_new_expires timestamptz,
  out o_old_plan text,
  out o_plan_code text,
  out o_plan_id uuid
)
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_now timestamptz := now();
  v_sub public.subscriptions;
  v_plan public.plans;
  v_base timestamptz;
  v_status public.subscription_status;
begin
  if p_days is null or p_days < 1 or p_days > 3660 then
    raise exception 'Quantidade de dias inválida.';
  end if;

  -- serializa operações administrativas sobre a mesma empresa
  perform pg_advisory_xact_lock(hashtext('company_access:' || p_company_id::text));

  select * into v_sub from public.subscriptions where company_id = p_company_id;

  o_plan_id := coalesce(p_plan_id, v_sub.plan_id);
  if o_plan_id is null then
    raise exception 'Informe o plano.';
  end if;

  select * into v_plan from public.plans where id = o_plan_id;
  if not found then
    raise exception 'Plano não encontrado.';
  end if;
  if v_plan.status <> 'active' and v_plan.id is distinct from v_sub.plan_id then
    raise exception 'O plano selecionado está inativo.';
  end if;

  v_base := v_now;
  if v_sub.id is not null and v_sub.status in ('active', 'trialing') and v_sub.expires_at > v_now then
    v_base := v_sub.expires_at;
  end if;

  o_old_expires := v_sub.expires_at;
  o_new_expires := v_base + make_interval(days => p_days);
  v_status := case when v_plan.trial then 'trialing'::public.subscription_status else 'active'::public.subscription_status end;

  perform public.platform_apply_access(
    p_company_id, v_plan.id, v_status, o_new_expires,
    case when v_base = v_now then v_now else null end
  );

  o_status := v_status;
  o_plan_code := v_plan.code;
  o_old_plan := (select code from public.plans where id = v_sub.plan_id);
end;
$function$;
revoke all on function public.platform_extend_access_core(uuid, integer, uuid) from public, anon, authenticated;

-- ---- admin_assign_plan (definição anterior, de 20261009020000_admin_billing_ops.sql)
create or replace function public.admin_assign_plan(
  p_company_id uuid,
  p_plan_id uuid,
  p_days integer default null,
  p_reason text default null
)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_reason text;
  v_plan public.plans;
  v_sub public.subscriptions;
  v_old_plan text;
  v_expires timestamptz;
  v_status public.subscription_status;
  v_new public.subscriptions;
  v_now timestamptz := now();
begin
  if not public.is_platform_admin() then
    raise exception 'not authorized';
  end if;
  v_reason := public.platform_clean_reason(p_reason);
  perform public.platform_assert_company(p_company_id);
  perform public.platform_assert_not_repeated('platform.subscription.plan_changed', p_company_id);

  select * into v_plan from public.plans where id = p_plan_id;
  if not found then
    raise exception 'Plano não encontrado.';
  end if;
  if v_plan.status <> 'active' then
    raise exception 'O plano selecionado está inativo.';
  end if;

  perform pg_advisory_xact_lock(hashtext('company_access:' || p_company_id::text));
  select * into v_sub from public.subscriptions where company_id = p_company_id;

  if v_sub.id is not null then
    select code into v_old_plan from public.plans where id = v_sub.plan_id;
    if v_sub.plan_id = v_plan.id and p_days is null then
      raise exception 'A empresa já está neste plano.';
    end if;
  end if;

  if v_sub.id is not null and v_sub.status in ('active', 'trialing') and v_sub.expires_at > v_now and p_days is null then
    v_expires := v_sub.expires_at;           -- troca de plano preservando o vencimento
  else
    v_expires := v_now + make_interval(days => coalesce(p_days, v_plan.access_duration_days, 0));
    if v_expires <= v_now then
      raise exception 'Informe a quantidade de dias de acesso.';
    end if;
    if coalesce(p_days, 0) > 3660 then
      raise exception 'Quantidade de dias inválida.';
    end if;
  end if;

  v_status := case when v_plan.trial then 'trialing'::public.subscription_status else 'active'::public.subscription_status end;
  v_new := public.platform_apply_access(
    p_company_id, v_plan.id, v_status, v_expires,
    case when v_sub.id is null or v_sub.status not in ('active', 'trialing') or v_sub.expires_at <= v_now then v_now else null end
  );

  perform public.write_platform_audit_log(
    'platform.subscription.plan_changed', 'company', p_company_id, p_company_id, null,
    jsonb_build_object('reason', v_reason, 'from_plan', v_old_plan, 'to_plan', v_plan.code,
                       'previous_expires_at', v_sub.expires_at, 'new_expires_at', v_new.expires_at)
  );

  return jsonb_build_object('status', v_new.status, 'plan_code', v_plan.code, 'expires_at', v_new.expires_at);
end;
$function$;
revoke all on function public.admin_assign_plan(uuid, uuid, integer, text) from public, anon;
grant execute on function public.admin_assign_plan(uuid, uuid, integer, text) to authenticated;

-- ---- admin_reactivate_subscription (definição anterior, de 20261009020000_admin_billing_ops.sql)
create or replace function public.admin_reactivate_subscription(
  p_company_id uuid,
  p_days integer default null,
  p_reason text default null
)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_reason text;
  v_sub public.subscriptions;
  v_plan public.plans;
  v_expires timestamptz;
  v_status public.subscription_status;
  v_new public.subscriptions;
  v_now timestamptz := now();
begin
  if not public.is_platform_admin() then
    raise exception 'not authorized';
  end if;
  v_reason := public.platform_clean_reason(p_reason);
  perform public.platform_assert_company(p_company_id);
  perform public.platform_assert_not_repeated('platform.subscription.reactivated', p_company_id);

  perform pg_advisory_xact_lock(hashtext('company_access:' || p_company_id::text));
  select * into v_sub from public.subscriptions where company_id = p_company_id;
  if not found then
    raise exception 'A empresa não possui assinatura.';
  end if;
  if v_sub.status in ('active', 'trialing') and v_sub.expires_at > v_now then
    raise exception 'A assinatura já está ativa.';
  end if;

  select * into v_plan from public.plans where id = v_sub.plan_id;

  if v_sub.expires_at > v_now and p_days is null then
    v_expires := v_sub.expires_at;           -- ainda dentro do período pago: apenas reativa
  else
    v_expires := v_now + make_interval(days => coalesce(p_days, v_plan.access_duration_days, 0));
    if v_expires <= v_now or coalesce(p_days, 0) > 3660 then
      raise exception 'Informe a quantidade de dias de acesso.';
    end if;
  end if;

  v_status := case when v_plan.trial then 'trialing'::public.subscription_status else 'active'::public.subscription_status end;
  v_new := public.platform_apply_access(
    p_company_id, v_plan.id, v_status, v_expires,
    case when v_expires > v_now and v_sub.expires_at > v_now then null else v_now end
  );

  perform public.write_platform_audit_log(
    'platform.subscription.reactivated', 'company', p_company_id, p_company_id, null,
    jsonb_build_object('reason', v_reason, 'previous_status', v_sub.status, 'plan', v_plan.code,
                       'previous_expires_at', v_sub.expires_at, 'new_expires_at', v_new.expires_at)
  );

  return jsonb_build_object('status', v_new.status, 'expires_at', v_new.expires_at);
end;
$function$;
revoke all on function public.admin_reactivate_subscription(uuid, integer, text) from public, anon;
grant execute on function public.admin_reactivate_subscription(uuid, integer, text) to authenticated;

-- ---- admin_adjust_access_expiry (definição anterior, de 20261009020000_admin_billing_ops.sql)
create or replace function public.admin_adjust_access_expiry(
  p_company_id uuid,
  p_expires_at timestamptz,
  p_reason text default null
)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_reason text;
  v_sub public.subscriptions;
  v_status public.subscription_status;
  v_new public.subscriptions;
begin
  if not public.is_super_admin() then
    raise exception 'not authorized';
  end if;
  v_reason := public.platform_clean_reason(p_reason);
  perform public.platform_assert_company(p_company_id);
  perform public.platform_assert_not_repeated('platform.access.expiry_adjusted', p_company_id);

  if p_expires_at is null or p_expires_at > now() + interval '3660 days' then
    raise exception 'Data de vencimento inválida.';
  end if;

  perform pg_advisory_xact_lock(hashtext('company_access:' || p_company_id::text));
  select * into v_sub from public.subscriptions where company_id = p_company_id;
  if not found then
    raise exception 'A empresa não possui assinatura para ajustar.';
  end if;
  if p_expires_at <= v_sub.starts_at then
    raise exception 'O vencimento deve ser posterior ao início da assinatura.';
  end if;

  -- cancelada permanece cancelada; senão ativa/trial conforme o plano, expirada se a data já passou
  v_status := (case
    when v_sub.status = 'cancelled' then 'cancelled'
    when p_expires_at <= now() then 'expired'
    when (select trial from public.plans where id = v_sub.plan_id) then 'trialing'
    else 'active'
  end)::public.subscription_status;

  v_new := public.platform_apply_access(p_company_id, v_sub.plan_id, v_status, p_expires_at);

  perform public.write_platform_audit_log(
    'platform.access.expiry_adjusted', 'company', p_company_id, p_company_id, null,
    jsonb_build_object('reason', v_reason, 'previous_expires_at', v_sub.expires_at,
                       'new_expires_at', v_new.expires_at, 'previous_status', v_sub.status, 'new_status', v_new.status)
  );

  return jsonb_build_object('status', v_new.status, 'previous_expires_at', v_sub.expires_at, 'expires_at', v_new.expires_at);
end;
$function$;
revoke all on function public.admin_adjust_access_expiry(uuid, timestamptz, text) from public, anon;
grant execute on function public.admin_adjust_access_expiry(uuid, timestamptz, text) to authenticated;

-- ---- admin_cancel_subscription (definição anterior, de 20261009020000_admin_billing_ops.sql)
create or replace function public.admin_cancel_subscription(p_company_id uuid, p_reason text default null)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_reason text;
  v_sub public.subscriptions;
begin
  if not public.is_super_admin() then
    raise exception 'not authorized';
  end if;
  v_reason := public.platform_clean_reason(p_reason);
  perform public.platform_assert_company(p_company_id);

  perform pg_advisory_xact_lock(hashtext('company_access:' || p_company_id::text));
  select * into v_sub from public.subscriptions where company_id = p_company_id;
  if not found then
    raise exception 'A empresa não possui assinatura.';
  end if;
  if v_sub.status = 'cancelled' then
    raise exception 'A assinatura já está cancelada.';
  end if;

  perform public.platform_apply_access(p_company_id, v_sub.plan_id, 'cancelled', v_sub.expires_at);
  update public.subscriptions set cancelled_at = now() where company_id = p_company_id;

  perform public.write_platform_audit_log(
    'platform.subscription.cancelled', 'company', p_company_id, p_company_id, null,
    jsonb_build_object('reason', v_reason, 'previous_status', v_sub.status, 'expires_at', v_sub.expires_at)
  );
end;
$function$;
revoke all on function public.admin_cancel_subscription(uuid, text) from public, anon;
grant execute on function public.admin_cancel_subscription(uuid, text) to authenticated;

-- ---- admin_mark_expired_subscriptions (definição anterior, de 20261009030000_admin_insights_tools.sql)
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

-- ---- admin_sync_company_entitlements (definição anterior, de 20261009030000_admin_insights_tools.sql)
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

-- ---- admin_record_manual_payment (definição anterior, de 20261009020000_admin_billing_ops.sql)
create or replace function public.admin_record_manual_payment(
  p_company_id uuid,
  p_plan_id uuid,
  p_amount numeric,
  p_method text,
  p_reference text default null,
  p_notes text default null,
  p_paid_at timestamptz default null,
  p_apply_access boolean default true
)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_actor uuid := public.current_profile_user_id();
  v_plan public.plans;
  v_ref text := nullif(trim(coalesce(p_reference, '')), '');
  v_notes text := nullif(trim(coalesce(p_notes, '')), '');
  v_paid_at timestamptz := coalesce(p_paid_at, now());
  v_payment_id uuid;
  v_sub_id uuid;
  v_new_expires timestamptz;
  r record;
begin
  if not public.is_platform_admin() then
    raise exception 'not authorized';
  end if;
  perform public.platform_assert_company(p_company_id);

  select * into v_plan from public.plans where id = p_plan_id;
  if not found then
    raise exception 'Plano não encontrado.';
  end if;
  if v_plan.status <> 'active' then
    raise exception 'O plano selecionado está inativo.';
  end if;
  if p_amount is null or p_amount < 0 or p_amount > 1000000 then
    raise exception 'Valor inválido.';
  end if;
  if p_method is null or p_method not in ('pix', 'transfer', 'cash', 'card_external', 'other') then
    raise exception 'Forma de pagamento inválida.';
  end if;
  if v_ref is not null and char_length(v_ref) > 120 then
    raise exception 'Referência muito longa (máximo 120 caracteres).';
  end if;
  if v_notes is not null and char_length(v_notes) > 1000 then
    raise exception 'Observação muito longa (máximo 1000 caracteres).';
  end if;
  if v_paid_at > now() + interval '1 day' or v_paid_at < now() - interval '400 days' then
    raise exception 'Data do pagamento fora do intervalo permitido.';
  end if;
  if p_apply_access and v_plan.access_duration_days is null then
    raise exception 'Este plano não tem duração fixa; use "Conceder dias".';
  end if;

  perform public.platform_assert_not_repeated('platform.payment.manual_recorded', p_company_id);

  begin
    insert into public.subscription_payments (
      company_id, plan_id, provider, method, status, amount, amount_with_tax, currency,
      external_reference, notes, paid_at, recorded_by
    ) values (
      p_company_id, v_plan.id, 'manual', p_method, 'paid', p_amount, p_amount, v_plan.currency,
      v_ref, v_notes, v_paid_at, v_actor
    ) returning id into v_payment_id;
  exception when unique_violation then
    raise exception 'Já existe um pagamento manual com esta referência para a empresa.';
  end;

  if p_apply_access then
    select * into r from public.platform_extend_access_core(p_company_id, v_plan.access_duration_days, v_plan.id);
    v_new_expires := r.o_new_expires;
    select id into v_sub_id from public.subscriptions where company_id = p_company_id;
    update public.subscription_payments set subscription_id = v_sub_id where id = v_payment_id;
  end if;

  perform public.write_platform_audit_log(
    'platform.payment.manual_recorded', 'subscription_payment', v_payment_id, p_company_id, null,
    jsonb_build_object('amount', p_amount, 'method', p_method, 'plan', v_plan.code, 'reference', v_ref,
                       'access_applied', p_apply_access, 'new_expires_at', v_new_expires)
  );

  return jsonb_build_object('payment_id', v_payment_id, 'access_applied', p_apply_access,
                            'expires_at', v_new_expires);
end;
$function$;
revoke all on function public.admin_record_manual_payment(uuid, uuid, numeric, text, text, text, timestamptz, boolean) from public, anon;
grant execute on function public.admin_record_manual_payment(uuid, uuid, numeric, text, text, text, timestamptz, boolean) to authenticated;

-- ---- get_public_plans (definição anterior, de 009_billing_subscriptions.sql)
create or replace function public.get_public_plans()
returns table (
  id uuid,
  code text,
  name text,
  description text,
  price numeric(10, 2),
  currency text,
  access_duration_days integer,
  additional_user_limit integer,
  trial boolean,
  support_enabled boolean,
  tickets_enabled boolean,
  exclusive_groups_enabled boolean,
  early_access_enabled boolean,
  status public.plan_status
)
language sql
security definer
set search_path = public
stable
as $$
  select id, code, name, description, price, currency, access_duration_days,
         additional_user_limit, trial, support_enabled, tickets_enabled,
         exclusive_groups_enabled, early_access_enabled, status
  from public.plans
  where status = 'active';
$$;
revoke execute on function public.get_public_plans() from public;
grant execute on function public.get_public_plans() to anon, authenticated;

-- ---- get_platform_company_detail (definição anterior, de 20261009010000_admin_users_companies.sql)
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

-- ---- get_platform_dashboard (definição anterior, de 20261009030000_admin_insights_tools.sql)
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

-- ---- confirm_subscription_payment (definição anterior, de 20261011000000_billing_hardening.sql)
create or replace function public.confirm_subscription_payment(
  p_payment_id uuid,
  p_provider_status public.subscription_payment_status,
  p_end_to_end_id text,
  p_event_id text,
  p_event_type text,
  p_event_payload jsonb,
  p_provider_amount numeric default null
)
 returns table (
  ok boolean,
  new_status public.subscription_payment_status,
  already_processed boolean,
  not_found boolean,
  rejection text
 )
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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
  -- COMPATIBILIDADE com o código publicado antes desta migration, que chama a função com 6 argumentos nomeados
  -- (sem p_provider_amount) mas já envia no payload a resposta do GET /pix?id= do provedor. O PostgREST resolve a
  -- chamada antiga para esta função (o 7º argumento tem default). O valor só é lido do payload quando for um
  -- JSON number (nunca texto), e continua sujeito às mesmas regras abaixo: ausente/divergente => rejeita.
  if v_amount is null and jsonb_typeof(p_event_payload -> 'amount') = 'number' then
    v_amount := (p_event_payload ->> 'amount')::numeric;
  end if;

  select * into v_payment from public.subscription_payments where id = p_payment_id for update;

  if not found then
    return query select false, 'pending'::public.subscription_payment_status, false, true, null::text;
    return;
  end if;

  -- idempotência por (provedor, event_id); um event_id nunca pode apontar para outro pagamento
  select * into v_event from public.payment_events where provider = 'evopay' and event_id = p_event_id;
  if found then
    if v_event.subscription_payment_id is distinct from p_payment_id then
      return query select false, v_payment.status, false, false, 'EVENT_PAYMENT_MISMATCH'::text;
      return;
    end if;
  else
    insert into public.payment_events (provider, event_id, event_type, payload, subscription_payment_id, processed)
    values ('evopay', p_event_id, p_event_type, p_event_payload, p_payment_id, false)
    returning * into v_event;
  end if;

  if v_event.processed then
    return query select true, v_payment.status, true, false, null::text;
    return;
  end if;

  -- pagamento já pago: nunca concede de novo; só aceita o estorno confirmado pelo provedor
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

  -- estornado é terminal: um "paid" depois do estorno é ambíguo e NUNCA reconcede acesso
  if v_payment.status = 'refunded' then
    if p_provider_status = 'paid' then
      return query select false, v_payment.status, false, false, 'REFUNDED_TERMINAL'::text;
      return;
    end if;
    update public.payment_events set processed = true, processed_at = v_now where id = v_event.id;
    return query select true, v_payment.status, false, false, null::text;
    return;
  end if;

  -- mesmo estado, ou "pending" tardio (fora de ordem): não muda nada nem rebaixa um estado final
  if p_provider_status = v_payment.status or p_provider_status = 'pending' then
    update public.payment_events set processed = true, processed_at = v_now where id = v_event.id;
    return query select true, v_payment.status, false, false, null::text;
    return;
  end if;

  if p_provider_status = 'paid' then
    -- só concede acesso para cobrança que existe no provedor, com valor igual ao esperado e plano faturável
    if v_payment.provider <> 'evopay' or v_payment.provider_transaction_id is null then
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

    -- serializa as concessões da MESMA empresa (mesma convenção das funções do Admin): dois pagamentos
    -- diferentes de uma empresa ainda sem assinatura não disputam o INSERT único em subscriptions.
    perform pg_advisory_xact_lock(hashtext('company_access:' || v_payment.company_id::text));

    update public.subscription_payments
       set status = 'paid',
           end_to_end_id = coalesce(p_end_to_end_id, end_to_end_id),
           paid_at = coalesce(paid_at, v_now)
     where id = p_payment_id;

    select * into v_subscription from public.subscriptions where company_id = v_payment.company_id for update;
    v_base := v_now;
    if found and v_subscription.status in ('active', 'trialing') and v_subscription.expires_at > v_now then
      v_base := v_subscription.expires_at;
    end if;
    v_new_expires := v_base + make_interval(days => v_plan.access_duration_days);

    -- único escritor de assinatura + entitlements (mantém os dois coerentes)
    perform public.platform_apply_access(v_payment.company_id, v_plan.id, 'active'::public.subscription_status, v_new_expires, null, 'evopay');
    update public.subscriptions set provider = 'evopay' where company_id = v_payment.company_id;
    select id into v_sub_id from public.subscriptions where company_id = v_payment.company_id;
    update public.subscription_payments set subscription_id = coalesce(subscription_id, v_sub_id) where id = p_payment_id;
  else
    update public.subscription_payments
       set status = p_provider_status,
           end_to_end_id = coalesce(p_end_to_end_id, end_to_end_id)
     where id = p_payment_id;
  end if;

  update public.payment_events set processed = true, processed_at = v_now where id = v_event.id;
  return query select true, p_provider_status, false, false, null::text;
end;
$function$;
revoke all on function public.confirm_subscription_payment(uuid, public.subscription_payment_status, text, text, text, jsonb, numeric) from public, anon, authenticated;
grant execute on function public.confirm_subscription_payment(uuid, public.subscription_payment_status, text, text, text, jsonb, numeric) to service_role;

-- ---- platform_diagnostics (definição anterior, de 20261011000000_billing_hardening.sql)
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
    select 'refunded_with_access', 'Pagamentos estornados com acesso ainda ativo', 'warn',
           (select count(distinct sp.id) from public.subscription_payments sp join public.subscriptions s on s.company_id = sp.company_id
             where sp.status = 'refunded' and s.status in ('active', 'trialing') and s.expires_at > now()),
           'O estorno não revoga o acesso automaticamente: revise a empresa e, se for o caso, ajuste o vencimento ou cancele a assinatura.'
    union all
    select 'payment_events_unprocessed', 'Eventos de pagamento não processados há mais de 1 hora', 'warn',
           (select count(*) from public.payment_events where not processed and created_at < now() - interval '1 hour'),
           'Confirmação rejeitada (valor divergente/ausente) ou falha: reverifique o pagamento e compare com o valor esperado.'
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

create or replace function pg_temp.rewrite_fn(p_sig text, p_from text[], p_to text[], p_expected int[], p_drop boolean default false)
 returns void
 language plpgsql
as $rw$
declare
  v_def text;
  v_cnt int;
  i int;
begin
  v_def := pg_get_functiondef(p_sig::regprocedure);
  for i in 1 .. array_length(p_from, 1) loop
    v_cnt := (length(v_def) - length(replace(v_def, p_from[i], ''))) / length(p_from[i]);
    if v_cnt <> p_expected[i] then
      raise exception 'rewrite %: padrão #% esperado % vez(es), encontrado %', p_sig, i, p_expected[i], v_cnt;
    end if;
    v_def := replace(v_def, p_from[i], p_to[i]);
  end loop;
  if p_drop then
    execute 'drop function ' || p_sig;
  end if;
  execute v_def;
end;
$rw$;

-- ---- leituras: desfaz a reescrita guiada (padrões invertidos, com a mesma contagem exata); company_detail e dashboard são restaurados do texto versionado
select pg_temp.rewrite_fn('public.get_platform_user_detail(uuid)',
  array[$$'expires_at', s.expires_at, 'lifetime', s.lifetime,$$, $$s.status in ('trialing', 'active') and (s.lifetime or s.expires_at > now()),$$, $$'days_left', case when s.lifetime then null else greatest(0, ceil(extract(epoch from (s.expires_at - now())) / 86400.0))::int end,$$, $$'access_duration_days', pl.access_duration_days, 'trial', pl.trial, 'lifetime', pl.lifetime)$$],
  array[$$'expires_at', s.expires_at,$$, $$s.status in ('trialing', 'active') and s.expires_at > now(),$$, $$'days_left', greatest(0, ceil(extract(epoch from (s.expires_at - now())) / 86400.0))::int,$$, $$'access_duration_days', pl.access_duration_days, 'trial', pl.trial)$$],
  array[1, 1, 1, 1]);
select pg_temp.rewrite_fn('public.list_platform_admin_users(text,public.user_status,public.user_role,text,text,text,text,integer,integer)',
  array[$$(s.lifetime or s.expires_at > now())$$], array[$$s.expires_at > now()$$], array[2]);
select pg_temp.rewrite_fn('public.list_platform_admin_companies(text,public.company_status,text,text,text,integer,integer)',
  array[$$(s.lifetime or s.expires_at > now())$$], array[$$s.expires_at > now()$$], array[2]);
select pg_temp.rewrite_fn('public.list_platform_plans()',
  array[$$(s.lifetime or s.expires_at > now())$$], array[$$s.expires_at > now()$$], array[1]);
select pg_temp.rewrite_fn('public.get_platform_admin_overview()',
  array[$$(s.lifetime or s.expires_at > now())$$, $$(not s.lifetime and s.expires_at <= now())$$],
  array[$$s.expires_at > now()$$, $$s.expires_at <= now()$$], array[2, 1]);
select pg_temp.rewrite_fn('public.list_platform_subscriptions(text,text,text,text,integer,text,integer,integer)',
  array[
    $$expires_at timestamp with time zone, lifetime boolean, days_left integer,$$,
    $$when s.status in ('trialing', 'active') and (s.lifetime or s.expires_at > now()) then s.status::text$$,
    $$case when s.lifetime then null else greatest(0, ceil(extract(epoch from (s.expires_at - now())) / 86400.0))::integer end as b_days,
      s.lifetime as b_lifetime,$$,
    $$b.b_starts, b.b_expires, b.b_lifetime, b.b_days, b.b_provider,$$
  ],
  array[
    $$expires_at timestamp with time zone, days_left integer,$$,
    $$when s.status in ('trialing', 'active') and s.expires_at > now() then s.status::text$$,
    $$greatest(0, ceil(extract(epoch from (s.expires_at - now())) / 86400.0))::integer as b_days,$$,
    $$b.b_starts, b.b_expires, b.b_days, b.b_provider,$$
  ],
  array[1, 1, 1, 1], true);
revoke all on function public.list_platform_subscriptions(text, text, text, text, integer, text, integer, integer) from public, anon;
grant execute on function public.list_platform_subscriptions(text, text, text, text, integer, text, integer, integer) to authenticated;

-- ---- esquema
drop function if exists public.platform_begin_operation(uuid, text, uuid);
drop function if exists public.platform_finish_operation(uuid, jsonb);
drop function if exists public.subscription_access_active(public.subscription_status, timestamptz, boolean);
drop table if exists public.platform_operation_keys;

alter table public.subscriptions drop constraint if exists subscriptions_lifetime_coherent;
alter table public.subscriptions alter column expires_at set not null;
alter table public.subscriptions drop column if exists lifetime;
alter table public.company_entitlements drop constraint if exists company_entitlements_lifetime_coherent;
alter table public.company_entitlements drop column if exists lifetime;

delete from public.plans p where p.lifetime and not exists (select 1 from public.subscriptions s where s.plan_id = p.id)
  and not exists (select 1 from public.subscription_payments sp where sp.plan_id = p.id);
alter table public.plans drop constraint if exists plans_lifetime_has_no_duration;
alter table public.plans drop constraint if exists plans_access_duration_required_unless_custom;
alter table public.plans add constraint plans_access_duration_required_unless_custom
  check (code = 'CUSTOM' or access_duration_days is not null);
alter table public.plans drop column if exists lifetime;

commit;
