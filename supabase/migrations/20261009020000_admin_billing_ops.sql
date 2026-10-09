-- =============================================================================
-- Admin Control Center — OPERAÇÕES DE COBRANÇA (somente TEST nesta fase)
--
-- Acesso/dias grátis, 30 dias manual, pagamento manual, troca de plano, cancelar/
-- reativar, ajuste de vencimento, listas de assinaturas/pagamentos e CRUD de planos.
--
-- Regras:
--  * Tudo SECURITY DEFINER; autorização dentro da função (is_platform_admin / is_super_admin).
--  * Toda mudança de acesso passa por platform_apply_access() (subscriptions + entitlements
--    coerentes) e grava auditoria via write_platform_audit_log().
--  * Dinheiro nunca é apagado: pagamento manual só pode ser ANULADO (status), por super_admin.
--  * ADMIN pode: conceder dias (limite configurável), liberar 30 dias, registrar pagamento manual,
--    trocar plano, reativar. SUPER_ADMIN apenas: cancelar assinatura, ajustar vencimento,
--    anular pagamento manual, criar/editar/ativar/desativar planos.
-- =============================================================================

-- ---------------------------------------------------------- núcleo de extensão
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

-- Anti clique-duplo: a mesma ação do mesmo ator na mesma empresa em <10s é recusada.
-- O advisory lock por empresa é tomado ANTES da checagem: duas chamadas simultâneas
-- se serializam e a segunda enxerga a auditoria já confirmada da primeira.
create or replace function public.platform_assert_not_repeated(p_action text, p_company_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  perform pg_advisory_xact_lock(hashtext('company_access:' || p_company_id::text));
  if exists (
    select 1 from public.audit_logs a
    where a.action = p_action
      and a.company_id = p_company_id
      and a.actor_user_id = public.current_profile_user_id()
      and a.created_at > now() - interval '10 seconds'
  ) then
    raise exception 'Operação repetida em menos de 10 segundos. Aguarde e confira o resultado.';
  end if;
end;
$function$;
revoke all on function public.platform_assert_not_repeated(text, uuid) from public, anon, authenticated;

create or replace function public.platform_clean_reason(p_reason text)
 returns text
 language plpgsql
 immutable
 set search_path to 'public'
as $function$
declare
  v text := nullif(trim(coalesce(p_reason, '')), '');
begin
  if v is null or char_length(v) < 3 then
    raise exception 'Informe o motivo (mínimo 3 caracteres).';
  end if;
  if char_length(v) > 500 then
    raise exception 'Motivo muito longo (máximo 500 caracteres).';
  end if;
  return v;
end;
$function$;
revoke all on function public.platform_clean_reason(text) from public, anon, authenticated;

create or replace function public.platform_assert_company(p_company_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if p_company_id is null or not exists (select 1 from public.companies where id = p_company_id) then
    raise exception 'Empresa não encontrada.';
  end if;
end;
$function$;
revoke all on function public.platform_assert_company(uuid) from public, anon, authenticated;

-- ----------------------------------------------------------- admin_grant_access_days
create or replace function public.admin_grant_access_days(
  p_company_id uuid,
  p_days integer,
  p_plan_id uuid default null,
  p_reason text default null
)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_reason text;
  v_max integer;
  r record;
begin
  if not public.is_platform_admin() then
    raise exception 'not authorized';
  end if;
  v_reason := public.platform_clean_reason(p_reason);
  perform public.platform_assert_company(p_company_id);

  v_max := public.platform_setting_int('admin_max_free_days', 30);
  if not public.is_super_admin() and (p_days is null or p_days < 1 or p_days > v_max) then
    raise exception 'Administradores podem conceder de 1 a % dias por operação.', v_max;
  end if;
  if p_days is null or p_days < 1 or p_days > 365 then
    raise exception 'A concessão deve ser de 1 a 365 dias.';
  end if;

  perform public.platform_assert_not_repeated('platform.access.days_granted', p_company_id);

  select * into r from public.platform_extend_access_core(p_company_id, p_days, p_plan_id);

  perform public.write_platform_audit_log(
    'platform.access.days_granted', 'company', p_company_id, p_company_id, null,
    jsonb_build_object('days', p_days, 'reason', v_reason, 'plan', r.o_plan_code,
                       'previous_plan', r.o_old_plan, 'previous_expires_at', r.o_old_expires,
                       'new_expires_at', r.o_new_expires)
  );

  return jsonb_build_object('status', r.o_status, 'plan_code', r.o_plan_code,
                            'previous_expires_at', r.o_old_expires, 'expires_at', r.o_new_expires);
end;
$function$;
revoke all on function public.admin_grant_access_days(uuid, integer, uuid, text) from public, anon;
grant execute on function public.admin_grant_access_days(uuid, integer, uuid, text) to authenticated;

-- ------------------------------------------------------- admin_release_30_days
create or replace function public.admin_release_30_days(
  p_company_id uuid,
  p_plan_id uuid default null,
  p_reason text default null
)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_reason text;
  r record;
begin
  if not public.is_platform_admin() then
    raise exception 'not authorized';
  end if;
  v_reason := public.platform_clean_reason(p_reason);
  perform public.platform_assert_company(p_company_id);
  perform public.platform_assert_not_repeated('platform.access.thirty_days_released', p_company_id);

  select * into r from public.platform_extend_access_core(p_company_id, 30, p_plan_id);

  perform public.write_platform_audit_log(
    'platform.access.thirty_days_released', 'company', p_company_id, p_company_id, null,
    jsonb_build_object('days', 30, 'reason', v_reason, 'plan', r.o_plan_code,
                       'previous_plan', r.o_old_plan, 'previous_expires_at', r.o_old_expires,
                       'new_expires_at', r.o_new_expires)
  );

  return jsonb_build_object('status', r.o_status, 'plan_code', r.o_plan_code,
                            'previous_expires_at', r.o_old_expires, 'expires_at', r.o_new_expires);
end;
$function$;
revoke all on function public.admin_release_30_days(uuid, uuid, text) from public, anon;
grant execute on function public.admin_release_30_days(uuid, uuid, text) to authenticated;

-- ------------------------------------------------------ admin_adjust_access_expiry
-- SUPER_ADMIN: corrige o vencimento (inclusive para reduzir/encerrar acesso concedido por engano).
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

-- ---------------------------------------------------- admin_record_manual_payment
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

-- ------------------------------------------------------ admin_void_manual_payment
-- SUPER_ADMIN: anula (status=cancelled) um pagamento MANUAL. Não apaga a linha e NÃO
-- reverte o acesso automaticamente (use admin_adjust_access_expiry se necessário).
create or replace function public.admin_void_manual_payment(p_payment_id uuid, p_reason text default null)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_reason text;
  v_pay public.subscription_payments;
begin
  if not public.is_super_admin() then
    raise exception 'not authorized';
  end if;
  v_reason := public.platform_clean_reason(p_reason);

  select * into v_pay from public.subscription_payments where id = p_payment_id for update;
  if not found then
    raise exception 'Pagamento não encontrado.';
  end if;
  if v_pay.provider <> 'manual' then
    raise exception 'Somente pagamentos manuais podem ser anulados aqui.';
  end if;
  if v_pay.status <> 'paid' then
    raise exception 'Somente pagamentos manuais pagos podem ser anulados.';
  end if;

  update public.subscription_payments set status = 'cancelled' where id = p_payment_id;

  perform public.write_platform_audit_log(
    'platform.payment.manual_voided', 'subscription_payment', p_payment_id, v_pay.company_id, null,
    jsonb_build_object('reason', v_reason, 'amount', v_pay.amount, 'access_reverted', false)
  );
end;
$function$;
revoke all on function public.admin_void_manual_payment(uuid, text) from public, anon;
grant execute on function public.admin_void_manual_payment(uuid, text) to authenticated;

-- ------------------------------------------------------------ admin_assign_plan
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

-- ------------------------------------------------- admin_cancel_subscription (super)
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

-- ---------------------------------------------------- admin_reactivate_subscription
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

-- ------------------------------------------------------ list_platform_subscriptions
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
  with base as (
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

-- ---------------------------------------------------------- list_platform_payments
create or replace function public.list_platform_payments(
  p_search text default null,
  p_status public.subscription_payment_status default null,
  p_provider text default null,
  p_method text default null,
  p_plan_code text default null,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_sort text default 'created_desc',  -- created_desc | created_asc | amount_desc
  p_limit integer default 25,
  p_offset integer default 0
)
 returns table (
  payment_id uuid,
  company_id uuid,
  company_name text,
  plan_code text,
  plan_name text,
  provider text,
  method text,
  status public.subscription_payment_status,
  amount numeric,
  currency text,
  external_reference text,
  paid_at timestamptz,
  created_at timestamptz,
  recorded_by_email text,
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
  if nullif(trim(coalesce(p_search, '')), '') is not null then
    v_pattern := '%' || replace(replace(replace(trim(p_search), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;

  return query
  select sp.id, sp.company_id, c.name, pl.code, pl.name, sp.provider, sp.method, sp.status, sp.amount, sp.currency,
         sp.external_reference, sp.paid_at, sp.created_at, rp.email, count(*) over ()
  from public.subscription_payments sp
  join public.companies c on c.id = sp.company_id
  join public.plans pl on pl.id = sp.plan_id
  left join public.profiles rp on rp.user_id = sp.recorded_by
  where (p_status is null or sp.status = p_status)
    and (p_provider is null or sp.provider = p_provider)
    and (p_method is null or sp.method = p_method)
    and (p_plan_code is null or pl.code = p_plan_code)
    and (p_from is null or sp.created_at >= p_from)
    and (p_to is null or sp.created_at < p_to)
    and (v_pattern is null or c.name ilike v_pattern escape '\' or sp.external_reference ilike v_pattern escape '\')
  order by
    case when p_sort = 'amount_desc' then sp.amount end desc,
    case when p_sort = 'created_asc' then sp.created_at end asc,
    sp.created_at desc, sp.id
  limit v_limit offset v_offset;
end;
$function$;
revoke all on function public.list_platform_payments(text, public.subscription_payment_status, text, text, text, timestamptz, timestamptz, text, integer, integer) from public, anon;
grant execute on function public.list_platform_payments(text, public.subscription_payment_status, text, text, text, timestamptz, timestamptz, text, integer, integer) to authenticated;

-- -------------------------------------------------------- platform_payments_summary
create or replace function public.platform_payments_summary(p_from timestamptz default null, p_to timestamptz default null)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if not public.is_platform_admin() then
    raise exception 'not authorized';
  end if;

  return (
    select jsonb_build_object(
      'currency', 'BRL',
      'paid_total', coalesce(sum(amount) filter (where status = 'paid'), 0),
      'paid_count', count(*) filter (where status = 'paid'),
      'pending_total', coalesce(sum(amount) filter (where status = 'pending'), 0),
      'pending_count', count(*) filter (where status = 'pending'),
      'failed_count', count(*) filter (where status in ('failed', 'expired', 'cancelled')),
      'refunded_total', coalesce(sum(amount) filter (where status = 'refunded'), 0),
      'by_provider', coalesce((
        select jsonb_agg(jsonb_build_object('provider', g.provider, 'total', g.total, 'count', g.cnt) order by g.total desc)
        from (select provider, sum(amount) total, count(*) cnt from public.subscription_payments
              where status = 'paid' and (p_from is null or created_at >= p_from) and (p_to is null or created_at < p_to)
              group by provider) g), '[]'::jsonb),
      'by_method', coalesce((
        select jsonb_agg(jsonb_build_object('method', g.method, 'total', g.total, 'count', g.cnt) order by g.total desc)
        from (select coalesce(method, 'pix') as method, sum(amount) total, count(*) cnt from public.subscription_payments
              where status = 'paid' and (p_from is null or created_at >= p_from) and (p_to is null or created_at < p_to)
              group by coalesce(method, 'pix')) g), '[]'::jsonb)
    )
    from public.subscription_payments
    where (p_from is null or created_at >= p_from) and (p_to is null or created_at < p_to)
  );
end;
$function$;
revoke all on function public.platform_payments_summary(timestamptz, timestamptz) from public, anon;
grant execute on function public.platform_payments_summary(timestamptz, timestamptz) to authenticated;

-- ------------------------------------------------------ get_platform_payment_detail
create or replace function public.get_platform_payment_detail(p_payment_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_actor uuid := public.current_profile_user_id();
  v_is_super boolean := public.is_super_admin();
  v_p public.subscription_payments;
begin
  if not public.is_platform_admin() then
    raise exception 'not authorized';
  end if;

  select * into v_p from public.subscription_payments where id = p_payment_id;
  if not found then
    raise exception 'Pagamento não encontrado.';
  end if;

  return jsonb_build_object(
    'payment', jsonb_build_object(
      'id', v_p.id, 'company_id', v_p.company_id,
      'company_name', (select name from public.companies where id = v_p.company_id),
      'plan_code', (select code from public.plans where id = v_p.plan_id),
      'plan_name', (select name from public.plans where id = v_p.plan_id),
      'provider', v_p.provider, 'method', v_p.method, 'status', v_p.status,
      'amount', v_p.amount, 'amount_with_tax', v_p.amount_with_tax, 'currency', v_p.currency,
      'external_reference', v_p.external_reference, 'notes', v_p.notes,
      'provider_transaction_id', v_p.provider_transaction_id, 'end_to_end_id', v_p.end_to_end_id,
      'payer_name', v_p.payer_name,
      'payer_document_masked', case when v_p.payer_document is null then null
                                    else '***' || right(regexp_replace(v_p.payer_document, '\D', '', 'g'), 4) end,
      'due_at', v_p.due_at, 'paid_at', v_p.paid_at, 'created_at', v_p.created_at, 'updated_at', v_p.updated_at,
      'recorded_by_email', (select email from public.profiles where user_id = v_p.recorded_by)
    ),
    'events', coalesce((
      select jsonb_agg(jsonb_build_object('event_id', e.event_id, 'event_type', e.event_type,
                                          'processed', e.processed, 'processed_at', e.processed_at, 'created_at', e.created_at)
                       order by e.created_at desc)
      from public.payment_events e where e.subscription_payment_id = v_p.id
    ), '[]'::jsonb),
    'deliveries', coalesce((
      select jsonb_agg(jsonb_build_object('provider', d.provider, 'outcome', d.outcome, 'detail', d.detail, 'received_at', d.received_at)
                       order by d.received_at desc)
      from public.webhook_deliveries d where d.payment_id = v_p.id
    ), '[]'::jsonb),
    'audit', coalesce((
      select jsonb_agg(y order by y.created_at desc) from (
        select a.id, a.action, public.platform_audit_category(a.action) as category, a.created_at,
               ap.email as actor_email, public.platform_safe_metadata(a.metadata) as metadata
        from public.audit_logs a left join public.profiles ap on ap.user_id = a.actor_user_id
        where a.entity_type = 'subscription_payment' and a.entity_id = v_p.id
          and (v_is_super or a.actor_user_id = v_actor)
        order by a.created_at desc limit 20
      ) y
    ), '[]'::jsonb)
  );
end;
$function$;
revoke all on function public.get_platform_payment_detail(uuid) from public, anon;
grant execute on function public.get_platform_payment_detail(uuid) to authenticated;

-- ------------------------------------------------------------------ PLANOS (CRUD)
create or replace function public.list_platform_plans()
 returns table (
  plan_id uuid, code text, name text, description text, price numeric, currency text,
  access_duration_days integer, billing_interval public.billing_interval, additional_user_limit integer,
  trial boolean, support_enabled boolean, tickets_enabled boolean, exclusive_groups_enabled boolean,
  early_access_enabled boolean, status public.plan_status, sort_order integer, created_at timestamptz,
  subscriptions_count bigint, active_subscriptions_count bigint, payments_count bigint, is_protected boolean
 )
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
#variable_conflict use_column
begin
  if not public.is_platform_admin() then
    raise exception 'not authorized';
  end if;

  return query
  select p.id, p.code, p.name, p.description, p.price, p.currency, p.access_duration_days, p.billing_interval,
         p.additional_user_limit, p.trial, p.support_enabled, p.tickets_enabled, p.exclusive_groups_enabled,
         p.early_access_enabled, p.status, p.sort_order, p.created_at,
         (select count(*) from public.subscriptions s where s.plan_id = p.id),
         (select count(*) from public.subscriptions s where s.plan_id = p.id and s.status in ('active', 'trialing') and s.expires_at > now()),
         (select count(*) from public.subscription_payments sp where sp.plan_id = p.id),
         p.code in ('FREE_TRIAL', 'MONTHLY', 'QUARTERLY', 'YEARLY', 'CUSTOM')
  from public.plans p
  order by p.sort_order, p.price nulls last, p.code;
end;
$function$;
revoke all on function public.list_platform_plans() from public, anon;
grant execute on function public.list_platform_plans() to authenticated;

create or replace function public.platform_validate_plan_fields(
  p_name text, p_price numeric, p_days integer, p_users integer, p_sort integer, p_code text
)
 returns void
 language plpgsql
 immutable
 set search_path to 'public'
as $function$
begin
  if nullif(trim(coalesce(p_name, '')), '') is null or char_length(trim(p_name)) > 80 then
    raise exception 'Nome do plano inválido (1 a 80 caracteres).';
  end if;
  if p_price is not null and (p_price < 0 or p_price > 100000) then
    raise exception 'Preço inválido.';
  end if;
  if p_days is not null and (p_days < 1 or p_days > 3660) then
    raise exception 'Duração de acesso inválida (1 a 3660 dias).';
  end if;
  if p_days is null and p_code <> 'CUSTOM' then
    raise exception 'Duração de acesso obrigatória.';
  end if;
  if p_users is null or p_users < 0 or p_users > 1000 then
    raise exception 'Limite de usuários adicionais inválido (0 a 1000).';
  end if;
  if p_sort is null or p_sort < 0 or p_sort > 10000 then
    raise exception 'Ordem inválida.';
  end if;
end;
$function$;
revoke all on function public.platform_validate_plan_fields(text, numeric, integer, integer, integer, text) from public, anon, authenticated;

create or replace function public.create_platform_plan(
  p_code text,
  p_name text,
  p_description text default null,
  p_price numeric default 0,
  p_access_duration_days integer default 30,
  p_billing_interval public.billing_interval default null,
  p_additional_user_limit integer default 0,
  p_trial boolean default false,
  p_support_enabled boolean default false,
  p_tickets_enabled boolean default false,
  p_exclusive_groups_enabled boolean default false,
  p_early_access_enabled boolean default false,
  p_sort_order integer default 0
)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_code text := upper(trim(coalesce(p_code, '')));
  v_id uuid;
begin
  if not public.is_super_admin() then
    raise exception 'not authorized';
  end if;
  if v_code !~ '^[A-Z][A-Z0-9_]{1,31}$' then
    raise exception 'Código inválido (use A-Z, 0-9 e _, de 2 a 32 caracteres, começando por letra).';
  end if;
  perform public.platform_validate_plan_fields(p_name, p_price, p_access_duration_days, p_additional_user_limit, p_sort_order, v_code);

  begin
    insert into public.plans (
      code, name, description, price, currency, access_duration_days, billing_interval, additional_user_limit,
      trial, support_enabled, tickets_enabled, exclusive_groups_enabled, early_access_enabled, status, sort_order
    ) values (
      v_code, trim(p_name), nullif(trim(coalesce(p_description, '')), ''), p_price, 'BRL', p_access_duration_days,
      p_billing_interval, p_additional_user_limit, p_trial, p_support_enabled, p_tickets_enabled,
      p_exclusive_groups_enabled, p_early_access_enabled, 'active', p_sort_order
    ) returning id into v_id;
  exception when unique_violation then
    raise exception 'Já existe um plano com este código.';
  end;

  perform public.write_platform_audit_log(
    'platform.plan.created', 'plan', v_id, null, null,
    jsonb_build_object('code', v_code, 'name', trim(p_name), 'price', p_price, 'access_duration_days', p_access_duration_days)
  );
  return v_id;
end;
$function$;
revoke all on function public.create_platform_plan(text, text, text, numeric, integer, public.billing_interval, integer, boolean, boolean, boolean, boolean, boolean, integer) from public, anon;
grant execute on function public.create_platform_plan(text, text, text, numeric, integer, public.billing_interval, integer, boolean, boolean, boolean, boolean, boolean, integer) to authenticated;

create or replace function public.update_platform_plan(
  p_plan_id uuid,
  p_name text,
  p_description text,
  p_price numeric,
  p_access_duration_days integer,
  p_billing_interval public.billing_interval,
  p_additional_user_limit integer,
  p_trial boolean,
  p_support_enabled boolean,
  p_tickets_enabled boolean,
  p_exclusive_groups_enabled boolean,
  p_early_access_enabled boolean,
  p_sort_order integer
)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_old public.plans;
  v_used boolean;
begin
  if not public.is_super_admin() then
    raise exception 'not authorized';
  end if;

  select * into v_old from public.plans where id = p_plan_id for update;
  if not found then
    raise exception 'Plano não encontrado.';
  end if;
  perform public.platform_validate_plan_fields(p_name, p_price, p_access_duration_days, p_additional_user_limit, p_sort_order, v_old.code);

  select exists (select 1 from public.subscriptions where plan_id = p_plan_id)
      or exists (select 1 from public.subscription_payments where plan_id = p_plan_id) into v_used;
  if v_used and p_trial is distinct from v_old.trial then
    raise exception 'Não é possível alterar o tipo (trial) de um plano já utilizado.';
  end if;

  update public.plans set
    name = trim(p_name),
    description = nullif(trim(coalesce(p_description, '')), ''),
    price = p_price,
    access_duration_days = p_access_duration_days,
    billing_interval = p_billing_interval,
    additional_user_limit = p_additional_user_limit,
    trial = p_trial,
    support_enabled = p_support_enabled,
    tickets_enabled = p_tickets_enabled,
    exclusive_groups_enabled = p_exclusive_groups_enabled,
    early_access_enabled = p_early_access_enabled,
    sort_order = p_sort_order
  where id = p_plan_id;

  perform public.write_platform_audit_log(
    'platform.plan.updated', 'plan', p_plan_id, null, null,
    jsonb_build_object('code', v_old.code,
      'from', jsonb_build_object('name', v_old.name, 'price', v_old.price, 'access_duration_days', v_old.access_duration_days,
                                 'additional_user_limit', v_old.additional_user_limit, 'sort_order', v_old.sort_order),
      'to', jsonb_build_object('name', trim(p_name), 'price', p_price, 'access_duration_days', p_access_duration_days,
                               'additional_user_limit', p_additional_user_limit, 'sort_order', p_sort_order))
  );
end;
$function$;
revoke all on function public.update_platform_plan(uuid, text, text, numeric, integer, public.billing_interval, integer, boolean, boolean, boolean, boolean, boolean, integer) from public, anon;
grant execute on function public.update_platform_plan(uuid, text, text, numeric, integer, public.billing_interval, integer, boolean, boolean, boolean, boolean, boolean, integer) to authenticated;

create or replace function public.set_platform_plan_status(p_plan_id uuid, p_status public.plan_status)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_old public.plans;
begin
  if not public.is_super_admin() then
    raise exception 'not authorized';
  end if;

  select * into v_old from public.plans where id = p_plan_id for update;
  if not found then
    raise exception 'Plano não encontrado.';
  end if;
  if v_old.status = p_status then
    raise exception 'O plano já está neste status.';
  end if;
  if p_status = 'inactive' and v_old.code in ('FREE_TRIAL', 'MONTHLY', 'QUARTERLY', 'YEARLY') then
    raise exception 'Planos do sistema não podem ser desativados.';
  end if;

  update public.plans set status = p_status where id = p_plan_id;

  perform public.write_platform_audit_log(
    'platform.plan.status_changed', 'plan', p_plan_id, null, null,
    jsonb_build_object('code', v_old.code, 'from', v_old.status, 'to', p_status)
  );
end;
$function$;
revoke all on function public.set_platform_plan_status(uuid, public.plan_status) from public, anon;
grant execute on function public.set_platform_plan_status(uuid, public.plan_status) to authenticated;
