-- =============================================================================
-- Missão 08 — Acesso VITALÍCIO explícito + operação unificada e idempotente de licença.
--
-- Modelo de Lifetime (sem data fictícia):
--   subscriptions.lifetime = true  <=>  expires_at IS NULL   (CHECK subscriptions_lifetime_coherent)
--   company_entitlements.lifetime espelha a assinatura (access_expires_at NULL quando vitalício)
--   plans.lifetime = true  <=>  o plano concede acesso permanente (sem duração, nunca vendido por Pix: sem preço)
-- Toda leitura de "acesso ativo" passa a ser: status in (trialing, active) AND (lifetime OR expires_at > now()).
-- Quem esquecer o lifetime FALHA FECHADO (NULL > now() é NULL => sem acesso), nunca abre acesso por engano.
--
-- Operações novas/alteradas (todas SECURITY DEFINER, auditadas):
--   admin_grant_license(company, kind, plan, days, reason, request_key)  -- 30 dias | período do plano | dias personalizados | vitalício
--   platform_operation_keys + platform_begin_operation()                  -- idempotência por chave de operação (retry/duplo clique)
--   platform_apply_access(..., p_lifetime)                                -- único escritor, agora lifetime-aware
--   admin_assign_plan / admin_reactivate_subscription / admin_adjust_access_expiry / admin_cancel_subscription /
--   admin_mark_expired_subscriptions / admin_sync_company_entitlements / admin_record_manual_payment /
--   confirm_subscription_payment / platform_extend_access_core            -- tratam lifetime; limites do admin passam a valer também
--                                                                           em atribuição de plano e reativação (fecha o bypass de dias grátis)
--   leituras (listas, detalhes, dashboard, diagnósticos, get_public_plans) -- reconhecem lifetime; lifetime NÃO entra no MRR
--
-- Compatibilidade com o código publicado (3931854): assinaturas/entitlements existentes continuam válidos (lifetime=false);
-- chamadas antigas com os mesmos argumentos nomeados continuam resolvendo (parâmetros novos têm default). Código antigo
-- que lesse um vitalício trataria expires_at nulo como expirado (fecha). Ordem segura: esta migration -> deploy do código.
-- ROLLBACK: supabase/rollback/20261012000000_lifetime_access_and_license_ops.down.sql
-- =============================================================================

-- ------------------------------------------------------------------ 1. esquema
alter table public.plans add column if not exists lifetime boolean not null default false;
alter table public.subscriptions add column if not exists lifetime boolean not null default false;
alter table public.company_entitlements add column if not exists lifetime boolean not null default false;

alter table public.subscriptions alter column expires_at drop not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'subscriptions_lifetime_coherent') then
    alter table public.subscriptions add constraint subscriptions_lifetime_coherent
      check ((lifetime and expires_at is null) or (not lifetime and expires_at is not null));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'company_entitlements_lifetime_coherent') then
    alter table public.company_entitlements add constraint company_entitlements_lifetime_coherent
      check (not lifetime or access_expires_at is null);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'plans_lifetime_has_no_duration') then
    alter table public.plans add constraint plans_lifetime_has_no_duration
      check (not lifetime or (access_duration_days is null and not trial and price is null));
  end if;
end $$;

alter table public.plans drop constraint if exists plans_access_duration_required_unless_custom;
alter table public.plans add constraint plans_access_duration_required_unless_custom
  check (code = 'CUSTOM' or lifetime or access_duration_days is not null);

-- Plano vitalício: sem preço (não é vendido pelo Pix), sem duração. Recursos copiados do plano YEARLY (decisão editável em /admin/plans).
insert into public.plans (code, name, description, price, currency, access_duration_days, billing_interval,
                          additional_user_limit, trial, support_enabled, tickets_enabled,
                          exclusive_groups_enabled, early_access_enabled, status, sort_order, lifetime)
select 'LIFETIME', 'Vitalício', 'Acesso permanente concedido pela equipe do Prime Ges. Não é vendido pelo Pix.',
       null, 'BRL', null, null,
       coalesce(y.additional_user_limit, 0), false, coalesce(y.support_enabled, false), coalesce(y.tickets_enabled, false),
       coalesce(y.exclusive_groups_enabled, false), coalesce(y.early_access_enabled, false), 'active', 90, true
  from (select 1) one
  left join public.plans y on y.code = 'YEARLY'
 where not exists (select 1 from public.plans where code = 'LIFETIME');

-- ----------------------------------------------------------- 2. chaves de operação
create table if not exists public.platform_operation_keys (
  request_key uuid primary key,
  operation text not null,
  company_id uuid references public.companies(id) on delete cascade,
  actor_user_id uuid not null,
  result jsonb,
  created_at timestamptz not null default now()
);
alter table public.platform_operation_keys enable row level security;
revoke all on table public.platform_operation_keys from anon, authenticated;
create index if not exists platform_operation_keys_created_idx on public.platform_operation_keys (created_at);

-- Reserva a chave dentro da transação da operação. Devolve o resultado guardado se a operação já foi concluída
-- (replay: não executa de novo) ou NULL se esta é a primeira execução. Duas chamadas simultâneas com a mesma chave:
-- a segunda espera o INSERT da primeira (PK) e então enxerga o resultado. Se a operação falhar, a transação inteira
-- (inclusive a chave) é desfeita e uma nova tentativa é permitida.
create or replace function public.platform_begin_operation(p_key uuid, p_operation text, p_company_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_actor uuid := public.current_profile_user_id();
  v_row public.platform_operation_keys;
begin
  if p_key is null then
    raise exception 'Chave de operação obrigatória.';
  end if;
  insert into public.platform_operation_keys (request_key, operation, company_id, actor_user_id)
  values (p_key, p_operation, p_company_id, v_actor)
  on conflict (request_key) do nothing;

  select * into v_row from public.platform_operation_keys where request_key = p_key;
  if v_row.actor_user_id is distinct from v_actor or v_row.operation <> p_operation
     or v_row.company_id is distinct from p_company_id then
    raise exception 'Esta chave de operação já foi usada em outra operação.';
  end if;
  return v_row.result;  -- null na primeira execução
end;
$function$;
revoke all on function public.platform_begin_operation(uuid, text, uuid) from public, anon, authenticated;

create or replace function public.platform_finish_operation(p_key uuid, p_result jsonb)
 returns void
 language sql
 security definer
 set search_path to 'public'
as $function$
  update public.platform_operation_keys set result = p_result where request_key = p_key;
$function$;
revoke all on function public.platform_finish_operation(uuid, jsonb) from public, anon, authenticated;

-- Helper único de "acesso ativo" para código novo (as leituras antigas foram reescritas com a mesma regra).
create or replace function public.subscription_access_active(p_status public.subscription_status, p_expires_at timestamptz, p_lifetime boolean)
 returns boolean
 language sql
 stable
 set search_path to 'public'
as $function$
  select p_status in ('trialing', 'active') and (coalesce(p_lifetime, false) or p_expires_at > now());
$function$;
revoke all on function public.subscription_access_active(public.subscription_status, timestamptz, boolean) from public, anon;
grant execute on function public.subscription_access_active(public.subscription_status, timestamptz, boolean) to authenticated;

-- ------------------------------------------------------ 3. platform_apply_access
drop function if exists public.platform_apply_access(uuid, uuid, public.subscription_status, timestamptz, timestamptz, text);

create function public.platform_apply_access(
  p_company_id uuid,
  p_plan_id uuid,
  p_status public.subscription_status,
  p_expires_at timestamptz,
  p_starts_at timestamptz default null,
  p_provider text default 'manual',
  p_lifetime boolean default false
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

  if coalesce(p_lifetime, false) then
    if p_expires_at is not null then
      raise exception 'Acesso vitalício não tem vencimento.';
    end if;
    if p_status not in ('active', 'cancelled') then
      raise exception 'Acesso vitalício só pode estar ativo ou cancelado.';
    end if;
    if not v_plan.lifetime then
      raise exception 'Acesso vitalício exige um plano vitalício.';
    end if;
  else
    if p_expires_at is null then
      raise exception 'Vencimento obrigatório para acesso com prazo.';
    end if;
    if v_plan.lifetime then
      raise exception 'Plano vitalício não pode ter vencimento.';
    end if;
  end if;

  select * into v_sub from public.subscriptions where company_id = p_company_id for update;

  if found then
    update public.subscriptions
       set plan_id = p_plan_id,
           status = p_status,
           expires_at = p_expires_at,
           lifetime = coalesce(p_lifetime, false),
           starts_at = coalesce(p_starts_at, starts_at),
           cancelled_at = case when p_status in ('active', 'trialing') then null else cancelled_at end
     where company_id = p_company_id
     returning * into v_sub;
  else
    insert into public.subscriptions (company_id, plan_id, status, starts_at, expires_at, lifetime, provider)
    values (p_company_id, p_plan_id, p_status, coalesce(p_starts_at, v_now), p_expires_at, coalesce(p_lifetime, false), p_provider)
    returning * into v_sub;
  end if;

  insert into public.company_entitlements (
    company_id, plan_id, status, access_starts_at, access_expires_at, lifetime,
    max_additional_users, support_enabled, tickets_enabled, exclusive_groups_enabled, early_access_enabled
  ) values (
    p_company_id, p_plan_id, p_status, v_sub.starts_at, v_sub.expires_at, v_sub.lifetime,
    v_plan.additional_user_limit, v_plan.support_enabled, v_plan.tickets_enabled,
    v_plan.exclusive_groups_enabled, v_plan.early_access_enabled
  )
  on conflict (company_id) do update set
    plan_id = excluded.plan_id,
    status = excluded.status,
    access_starts_at = excluded.access_starts_at,
    access_expires_at = excluded.access_expires_at,
    lifetime = excluded.lifetime,
    max_additional_users = excluded.max_additional_users,
    support_enabled = excluded.support_enabled,
    tickets_enabled = excluded.tickets_enabled,
    exclusive_groups_enabled = excluded.exclusive_groups_enabled,
    early_access_enabled = excluded.early_access_enabled,
    updated_at = v_now;

  return v_sub;
end;
$function$;
revoke all on function public.platform_apply_access(uuid, uuid, public.subscription_status, timestamptz, timestamptz, text, boolean) from public, anon, authenticated;

-- ------------------------------------------------- 4. platform_extend_access_core
create or replace function public.platform_extend_access_core(
  p_company_id uuid, p_days integer, p_plan_id uuid,
  out o_status public.subscription_status, out o_old_expires timestamptz, out o_new_expires timestamptz,
  out o_old_plan text, out o_plan_code text, out o_plan_id uuid
)
 returns record
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

  perform pg_advisory_xact_lock(hashtext('company_access:' || p_company_id::text));

  select * into v_sub from public.subscriptions where company_id = p_company_id;
  if v_sub.id is not null and v_sub.lifetime then
    raise exception 'A empresa possui acesso vitalício; não há prazo a estender.';
  end if;

  o_plan_id := coalesce(p_plan_id, v_sub.plan_id);
  if o_plan_id is null then
    raise exception 'Informe o plano.';
  end if;

  select * into v_plan from public.plans where id = o_plan_id;
  if not found then
    raise exception 'Plano não encontrado.';
  end if;
  if v_plan.lifetime then
    raise exception 'Plano vitalício: use a concessão de acesso vitalício.';
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

-- ------------------------------------------------------- 5. admin_grant_license
create or replace function public.admin_grant_license(
  p_company_id uuid,
  p_kind text,
  p_plan_id uuid,
  p_days integer,
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
  v_max integer;
  v_super boolean := public.is_super_admin();
  v_replay jsonb;
  v_sub public.subscriptions;
  v_plan public.plans;
  v_new public.subscriptions;
  v_days integer;
  v_audit text;
  v_result jsonb;
  r record;
begin
  if not public.is_platform_admin() then
    raise exception 'not authorized';
  end if;
  if p_kind is null or p_kind not in ('thirty_days', 'plan_period', 'custom_days', 'lifetime') then
    raise exception 'Tipo de concessão inválido.';
  end if;
  if p_kind = 'lifetime' and not v_super then
    raise exception 'not authorized';
  end if;
  v_reason := public.platform_clean_reason(p_reason);
  perform public.platform_assert_company(p_company_id);

  v_replay := public.platform_begin_operation(p_request_key, 'grant_license:' || p_kind, p_company_id);
  if v_replay is not null then
    return v_replay || jsonb_build_object('replayed', true);
  end if;

  perform pg_advisory_xact_lock(hashtext('company_access:' || p_company_id::text));
  select * into v_sub from public.subscriptions where company_id = p_company_id;
  v_max := public.platform_setting_int('admin_max_free_days', 30);

  if p_kind = 'lifetime' then
    select * into v_plan from public.plans
     where lifetime and status = 'active' and (p_plan_id is null or id = p_plan_id)
     order by sort_order, code limit 1;
    if not found then
      raise exception 'Plano vitalício não encontrado ou inativo.';
    end if;
    if v_sub.id is not null and v_sub.lifetime and v_sub.status = 'active' then
      raise exception 'A empresa já possui acesso vitalício ativo.';
    end if;

    v_new := public.platform_apply_access(
      p_company_id, v_plan.id, 'active', null,
      case when v_sub.id is null or v_sub.status not in ('active', 'trialing') or v_sub.lifetime then now() else null end,
      'manual', true
    );
    v_audit := 'platform.access.lifetime_granted';
    v_result := jsonb_build_object('kind', p_kind, 'status', v_new.status, 'plan_code', v_plan.code, 'lifetime', true,
                                   'previous_expires_at', v_sub.expires_at, 'expires_at', null);
    perform public.write_platform_audit_log(
      v_audit, 'company', p_company_id, p_company_id, null,
      jsonb_build_object('kind', p_kind, 'reason', v_reason, 'plan', v_plan.code,
                         'previous_plan', (select code from public.plans where id = v_sub.plan_id),
                         'previous_status', v_sub.status, 'previous_expires_at', v_sub.expires_at,
                         'previous_lifetime', coalesce(v_sub.lifetime, false))
    );
  else
    if p_plan_id is not null then
      select * into v_plan from public.plans where id = p_plan_id;
      if not found then
        raise exception 'Plano não encontrado.';
      end if;
    end if;

    v_days := case p_kind
      when 'thirty_days' then 30
      when 'plan_period' then v_plan.access_duration_days
      else p_days
    end;
    if p_kind = 'plan_period' then
      if v_plan.id is null then
        raise exception 'Informe o plano.';
      end if;
      if v_plan.lifetime or v_days is null then
        raise exception 'Este plano não tem duração fixa.';
      end if;
    end if;
    if v_days is null or v_days < 1 or v_days > 365 then
      raise exception 'A concessão deve ser de 1 a 365 dias.';
    end if;
    -- Concessão sem pagamento: o limite do administrador vale para qualquer tipo; acima dele, só super_admin
    -- ou o registro do pagamento manual (que exige valor recebido).
    if not v_super and v_days > v_max then
      raise exception 'Administradores podem conceder de 1 a % dias sem pagamento. Registre o pagamento manual ou peça a um super administrador.', v_max;
    end if;

    select * into r from public.platform_extend_access_core(p_company_id, v_days, p_plan_id);
    v_audit := 'platform.access.license_granted';
    v_result := jsonb_build_object('kind', p_kind, 'status', r.o_status, 'plan_code', r.o_plan_code, 'lifetime', false,
                                   'days', v_days, 'previous_expires_at', r.o_old_expires, 'expires_at', r.o_new_expires);
    perform public.write_platform_audit_log(
      v_audit, 'company', p_company_id, p_company_id, null,
      jsonb_build_object('kind', p_kind, 'days', v_days, 'reason', v_reason, 'plan', r.o_plan_code,
                         'previous_plan', r.o_old_plan, 'previous_expires_at', r.o_old_expires,
                         'new_expires_at', r.o_new_expires)
    );
  end if;

  perform public.platform_finish_operation(p_request_key, v_result);
  return v_result || jsonb_build_object('replayed', false);
end;
$function$;
revoke all on function public.admin_grant_license(uuid, text, uuid, integer, text, uuid) from public, anon;
grant execute on function public.admin_grant_license(uuid, text, uuid, integer, text, uuid) to authenticated;

-- ---------------------------------------------------------- 6. admin_assign_plan
create or replace function public.admin_assign_plan(
  p_company_id uuid, p_plan_id uuid, p_days integer default null, p_reason text default null
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
  v_super boolean := public.is_super_admin();
  v_max integer;
  v_free_days integer;
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
  if v_plan.lifetime then
    raise exception 'Use a concessão de acesso vitalício para este plano.';
  end if;

  perform pg_advisory_xact_lock(hashtext('company_access:' || p_company_id::text));
  select * into v_sub from public.subscriptions where company_id = p_company_id;
  v_max := public.platform_setting_int('admin_max_free_days', 30);

  if v_sub.id is not null then
    select code into v_old_plan from public.plans where id = v_sub.plan_id;
    if v_sub.lifetime then
      -- Sair do vitalício é revogar um acesso permanente: só super_admin e com novo prazo explícito.
      if not v_super then
        raise exception 'not authorized';
      end if;
      if p_days is null then
        raise exception 'Informe o novo prazo (dias) para substituir o acesso vitalício.';
      end if;
    elsif v_sub.plan_id = v_plan.id and p_days is null then
      raise exception 'A empresa já está neste plano.';
    end if;
  end if;

  if v_sub.id is not null and not v_sub.lifetime and v_sub.status in ('active', 'trialing') and v_sub.expires_at > v_now and p_days is null then
    v_expires := v_sub.expires_at;   -- só troca o plano, preservando o período já concedido/pago
  else
    v_free_days := coalesce(p_days, v_plan.access_duration_days, 0);
    v_expires := v_now + make_interval(days => v_free_days);
    if v_expires <= v_now then
      raise exception 'Informe a quantidade de dias de acesso.';
    end if;
    if coalesce(p_days, 0) > 3660 then
      raise exception 'Quantidade de dias inválida.';
    end if;
    -- novo prazo sem pagamento: limite do administrador (acima disso, super_admin ou pagamento manual)
    if not v_super and v_free_days > v_max then
      raise exception 'Administradores podem conceder de 1 a % dias sem pagamento. Registre o pagamento manual ou peça a um super administrador.', v_max;
    end if;
  end if;

  v_status := case when v_plan.trial then 'trialing'::public.subscription_status else 'active'::public.subscription_status end;
  v_new := public.platform_apply_access(
    p_company_id, v_plan.id, v_status, v_expires,
    case when v_sub.id is null or v_sub.lifetime or v_sub.status not in ('active', 'trialing') or v_sub.expires_at <= v_now then v_now else null end
  );

  perform public.write_platform_audit_log(
    'platform.subscription.plan_changed', 'company', p_company_id, p_company_id, null,
    jsonb_build_object('reason', v_reason, 'from_plan', v_old_plan, 'to_plan', v_plan.code,
                       'previous_expires_at', v_sub.expires_at, 'new_expires_at', v_new.expires_at,
                       'previous_lifetime', coalesce(v_sub.lifetime, false))
  );

  return jsonb_build_object('status', v_new.status, 'plan_code', v_plan.code, 'expires_at', v_new.expires_at, 'lifetime', false);
end;
$function$;

-- --------------------------------------------------- 7. admin_reactivate_subscription
create or replace function public.admin_reactivate_subscription(
  p_company_id uuid, p_days integer default null, p_reason text default null
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
  v_super boolean := public.is_super_admin();
  v_max integer;
  v_free_days integer;
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
  if public.subscription_access_active(v_sub.status, v_sub.expires_at, v_sub.lifetime) then
    raise exception 'A assinatura já está ativa.';
  end if;

  select * into v_plan from public.plans where id = v_sub.plan_id;
  v_max := public.platform_setting_int('admin_max_free_days', 30);

  if v_sub.lifetime then
    -- vitalício cancelado: reativar devolve o acesso permanente (sem prazo novo)
    v_new := public.platform_apply_access(p_company_id, v_plan.id, 'active', null, null, 'manual', true);
  else
    if v_sub.expires_at > v_now and p_days is null then
      v_expires := v_sub.expires_at;     -- ainda dentro do período concedido/pago
    else
      v_free_days := coalesce(p_days, v_plan.access_duration_days, 0);
      v_expires := v_now + make_interval(days => v_free_days);
      if v_expires <= v_now or coalesce(p_days, 0) > 3660 then
        raise exception 'Informe a quantidade de dias de acesso.';
      end if;
      if not v_super and v_free_days > v_max then
        raise exception 'Administradores podem conceder de 1 a % dias sem pagamento. Registre o pagamento manual ou peça a um super administrador.', v_max;
      end if;
    end if;

    v_status := case when v_plan.trial then 'trialing'::public.subscription_status else 'active'::public.subscription_status end;
    v_new := public.platform_apply_access(
      p_company_id, v_plan.id, v_status, v_expires,
      case when v_expires > v_now and v_sub.expires_at > v_now then null else v_now end
    );
  end if;

  perform public.write_platform_audit_log(
    'platform.subscription.reactivated', 'company', p_company_id, p_company_id, null,
    jsonb_build_object('reason', v_reason, 'previous_status', v_sub.status, 'plan', v_plan.code,
                       'previous_expires_at', v_sub.expires_at, 'new_expires_at', v_new.expires_at,
                       'lifetime', v_new.lifetime)
  );

  return jsonb_build_object('status', v_new.status, 'expires_at', v_new.expires_at, 'lifetime', v_new.lifetime);
end;
$function$;

-- ----------------------------------------------------- 8. admin_adjust_access_expiry
create or replace function public.admin_adjust_access_expiry(
  p_company_id uuid, p_expires_at timestamptz, p_reason text default null
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
  if v_sub.lifetime then
    raise exception 'Acesso vitalício não tem vencimento. Para encerrá-lo, atribua um plano com prazo (super administrador) ou cancele a assinatura.';
  end if;
  if p_expires_at <= v_sub.starts_at then
    raise exception 'O vencimento deve ser posterior ao início da assinatura.';
  end if;

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

-- ----------------------------------------------------- 9. admin_cancel_subscription
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

  perform public.platform_apply_access(p_company_id, v_sub.plan_id, 'cancelled', v_sub.expires_at, null, 'manual', v_sub.lifetime);
  update public.subscriptions set cancelled_at = now() where company_id = p_company_id;

  perform public.write_platform_audit_log(
    'platform.subscription.cancelled', 'company', p_company_id, p_company_id, null,
    jsonb_build_object('reason', v_reason, 'previous_status', v_sub.status, 'expires_at', v_sub.expires_at,
                       'lifetime', v_sub.lifetime)
  );
end;
$function$;

-- --------------------------------------------- 10. expirar / sincronizar entitlements
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
     where status in ('active', 'trialing') and not lifetime and expires_at <= now()
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

  perform public.platform_apply_access(p_company_id, v_sub.plan_id, v_sub.status, v_sub.expires_at, null, 'manual', v_sub.lifetime);

  perform public.write_platform_audit_log(
    'platform.admin.entitlements_synced', 'company', p_company_id, p_company_id, null,
    jsonb_build_object('status', v_sub.status, 'expires_at', v_sub.expires_at, 'lifetime', v_sub.lifetime)
  );
end;
$function$;

-- --------------------------------------------------- 11. pagamento manual (+ idempotência)
drop function if exists public.admin_record_manual_payment(uuid, uuid, numeric, text, text, text, timestamptz, boolean);

create function public.admin_record_manual_payment(
  p_company_id uuid,
  p_plan_id uuid,
  p_amount numeric,
  p_method text,
  p_reference text default null,
  p_notes text default null,
  p_paid_at timestamptz default null,
  p_apply_access boolean default true,
  p_request_key uuid default null
)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_actor uuid := public.current_profile_user_id();
  v_plan public.plans;
  v_sub public.subscriptions;
  v_ref text := nullif(trim(coalesce(p_reference, '')), '');
  v_notes text := nullif(trim(coalesce(p_notes, '')), '');
  v_paid_at timestamptz := coalesce(p_paid_at, now());
  v_payment_id uuid;
  v_sub_id uuid;
  v_new_expires timestamptz;
  v_replay jsonb;
  v_result jsonb;
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
  if p_apply_access then
    if v_plan.lifetime then
      raise exception 'Plano vitalício não é vendido: use a concessão de acesso vitalício.';
    end if;
    if v_plan.access_duration_days is null then
      raise exception 'Este plano não tem duração fixa; use "Conceder dias".';
    end if;
    -- Acesso concedido por pagamento exige dinheiro recebido: valor zero é concessão gratuita (use "Conceder acesso").
    if p_amount <= 0 then
      raise exception 'Informe o valor recebido (maior que zero) para liberar acesso por pagamento.';
    end if;
  end if;

  if p_request_key is not null then
    v_replay := public.platform_begin_operation(p_request_key, 'manual_payment', p_company_id);
    if v_replay is not null then
      return v_replay || jsonb_build_object('replayed', true);
    end if;
  end if;

  perform public.platform_assert_not_repeated('platform.payment.manual_recorded', p_company_id);

  if p_apply_access then
    perform pg_advisory_xact_lock(hashtext('company_access:' || p_company_id::text));
    select * into v_sub from public.subscriptions where company_id = p_company_id;
    if v_sub.id is not null and v_sub.lifetime then
      raise exception 'A empresa possui acesso vitalício; registre o pagamento sem liberar acesso.';
    end if;
  end if;

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
                       'plan_price', v_plan.price, 'below_plan_price', (v_plan.price is not null and p_amount < v_plan.price),
                       'access_applied', p_apply_access, 'new_expires_at', v_new_expires)
  );

  v_result := jsonb_build_object('payment_id', v_payment_id, 'access_applied', p_apply_access, 'expires_at', v_new_expires);
  if p_request_key is not null then
    perform public.platform_finish_operation(p_request_key, v_result);
  end if;
  return v_result || jsonb_build_object('replayed', false);
end;
$function$;
revoke all on function public.admin_record_manual_payment(uuid, uuid, numeric, text, text, text, timestamptz, boolean, uuid) from public, anon;
grant execute on function public.admin_record_manual_payment(uuid, uuid, numeric, text, text, text, timestamptz, boolean, uuid) to authenticated;

-- ------------------------------------- 12. confirmação de pagamento: vitalício não é alterado
-- (corpo idêntico ao de 20261011000000; a única mudança está marcada com "LIFETIME")
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
  if v_amount is null and jsonb_typeof(p_event_payload -> 'amount') = 'number' then
    v_amount := (p_event_payload ->> 'amount')::numeric;
  end if;

  select * into v_payment from public.subscription_payments where id = p_payment_id for update;

  if not found then
    return query select false, 'pending'::public.subscription_payment_status, false, true, null::text;
    return;
  end if;

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

  if v_payment.status = 'refunded' then
    if p_provider_status = 'paid' then
      return query select false, v_payment.status, false, false, 'REFUNDED_TERMINAL'::text;
      return;
    end if;
    update public.payment_events set processed = true, processed_at = v_now where id = v_event.id;
    return query select true, v_payment.status, false, false, null::text;
    return;
  end if;

  if p_provider_status = v_payment.status or p_provider_status = 'pending' then
    update public.payment_events set processed = true, processed_at = v_now where id = v_event.id;
    return query select true, v_payment.status, false, false, null::text;
    return;
  end if;

  if p_provider_status = 'paid' then
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

    perform pg_advisory_xact_lock(hashtext('company_access:' || v_payment.company_id::text));

    update public.subscription_payments
       set status = 'paid',
           end_to_end_id = coalesce(p_end_to_end_id, end_to_end_id),
           paid_at = coalesce(paid_at, v_now)
     where id = p_payment_id;

    select * into v_subscription from public.subscriptions where company_id = v_payment.company_id for update;

    if found and v_subscription.lifetime then
      -- LIFETIME: pagamento registrado, acesso permanente NÃO é alterado (nem encurtado nem estendido).
      update public.subscription_payments set subscription_id = coalesce(subscription_id, v_subscription.id) where id = p_payment_id;
    else
      v_base := v_now;
      if found and v_subscription.status in ('active', 'trialing') and v_subscription.expires_at > v_now then
        v_base := v_subscription.expires_at;
      end if;
      v_new_expires := v_base + make_interval(days => v_plan.access_duration_days);

      perform public.platform_apply_access(v_payment.company_id, v_plan.id, 'active'::public.subscription_status, v_new_expires, null, 'evopay');
      update public.subscriptions set provider = 'evopay' where company_id = v_payment.company_id;
      select id into v_sub_id from public.subscriptions where company_id = v_payment.company_id;
      update public.subscription_payments set subscription_id = coalesce(subscription_id, v_sub_id) where id = p_payment_id;
    end if;
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

-- --------------------------------------------- 13. catálogo público sem plano vitalício
create or replace function public.get_public_plans()
 returns table (id uuid, code text, name text, description text, price numeric, currency text, access_duration_days integer,
                additional_user_limit integer, trial boolean, support_enabled boolean, tickets_enabled boolean,
                exclusive_groups_enabled boolean, early_access_enabled boolean, status public.plan_status)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select id, code, name, description, price, currency, access_duration_days,
         additional_user_limit, trial, support_enabled, tickets_enabled,
         exclusive_groups_enabled, early_access_enabled, status
  from public.plans
  where status = 'active' and not lifetime;
$function$;

-- ----------------------------------- 14. leituras: reescrita guiada com contagem exata
-- Cada padrão precisa aparecer EXATAMENTE o número esperado de vezes, senão a migration aborta (nada é aplicado pela metade).
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

-- detalhes de usuário e empresa
select pg_temp.rewrite_fn('public.get_platform_user_detail(uuid)',
  array[
    $$'expires_at', s.expires_at,$$,
    $$s.status in ('trialing', 'active') and s.expires_at > now(),$$,
    $$'days_left', greatest(0, ceil(extract(epoch from (s.expires_at - now())) / 86400.0))::int,$$,
    $$'access_duration_days', pl.access_duration_days, 'trial', pl.trial)$$
  ],
  array[
    $$'expires_at', s.expires_at, 'lifetime', s.lifetime,$$,
    $$s.status in ('trialing', 'active') and (s.lifetime or s.expires_at > now()),$$,
    $$'days_left', case when s.lifetime then null else greatest(0, ceil(extract(epoch from (s.expires_at - now())) / 86400.0))::int end,$$,
    $$'access_duration_days', pl.access_duration_days, 'trial', pl.trial, 'lifetime', pl.lifetime)$$
  ],
  array[1, 1, 1, 1]);

select pg_temp.rewrite_fn('public.get_platform_company_detail(uuid)',
  array[
    $$'expires_at', s.expires_at,$$,
    $$s.status in ('trialing', 'active') and s.expires_at > now(),$$,
    $$'days_left', greatest(0, ceil(extract(epoch from (s.expires_at - now())) / 86400.0))::int,$$,
    $$'access_duration_days', pl.access_duration_days, 'trial', pl.trial)$$
  ],
  array[
    $$'expires_at', s.expires_at, 'lifetime', s.lifetime,$$,
    $$s.status in ('trialing', 'active') and (s.lifetime or s.expires_at > now()),$$,
    $$'days_left', case when s.lifetime then null else greatest(0, ceil(extract(epoch from (s.expires_at - now())) / 86400.0))::int end,$$,
    $$'access_duration_days', pl.access_duration_days, 'trial', pl.trial, 'lifetime', pl.lifetime)$$
  ],
  array[1, 1, 1, 1]);

-- listas de usuários, empresas e planos; visão geral
select pg_temp.rewrite_fn('public.list_platform_admin_users(text,public.user_status,public.user_role,text,text,text,text,integer,integer)',
  array[$$s.expires_at > now()$$], array[$$(s.lifetime or s.expires_at > now())$$], array[2]);
select pg_temp.rewrite_fn('public.list_platform_admin_companies(text,public.company_status,text,text,text,integer,integer)',
  array[$$s.expires_at > now()$$], array[$$(s.lifetime or s.expires_at > now())$$], array[2]);
select pg_temp.rewrite_fn('public.list_platform_plans()',
  array[$$s.expires_at > now()$$], array[$$(s.lifetime or s.expires_at > now())$$], array[1]);
select pg_temp.rewrite_fn('public.get_platform_admin_overview()',
  array[$$s.expires_at > now()$$, $$s.expires_at <= now()$$],
  array[$$(s.lifetime or s.expires_at > now())$$, $$(not s.lifetime and s.expires_at <= now())$$],
  array[2, 1]);

-- dashboard
select pg_temp.rewrite_fn('public.get_platform_dashboard()',
  array[
    $$'active', count(*) filter (where status = 'active' and expires_at > now()),$$,
    $$'trialing', count(*) filter (where status = 'trialing' and expires_at > now()),$$,
    $$'expired', count(*) filter (where status in ('active', 'trialing') and expires_at <= now()) + count(*) filter (where status = 'expired'),$$,
    $$'pending', count(*) filter (where status = 'pending'),$$,
    $$where s.status = 'active' and s.expires_at > now() and not pl.trial and pl.price > 0$$,
    $$where s.status in ('active', 'trialing') and s.expires_at > now() group by pl.code, pl.name$$,
    $$'manual_30d', coalesce(sum(amount) filter (where status = 'paid' and provider = 'manual' and coalesce(paid_at, created_at) >= now() - interval '30 days'), 0)$$
  ],
  array[
    $$'active', count(*) filter (where status = 'active' and (lifetime or expires_at > now())),$$,
    $$'trialing', count(*) filter (where status = 'trialing' and (lifetime or expires_at > now())),$$,
    $$'expired', count(*) filter (where status in ('active', 'trialing') and not lifetime and expires_at <= now()) + count(*) filter (where status = 'expired'),$$,
    $$'pending', count(*) filter (where status = 'pending'),
        'lifetime', count(*) filter (where lifetime and status = 'active'),$$,
    $$where s.status = 'active' and not s.lifetime and s.expires_at > now() and not pl.trial and pl.price > 0$$,
    $$where s.status in ('active', 'trialing') and (s.lifetime or s.expires_at > now()) group by pl.code, pl.name$$,
    $$'manual_30d', coalesce(sum(amount) filter (where status = 'paid' and provider = 'manual' and coalesce(paid_at, created_at) >= now() - interval '30 days'), 0),
        'evopay_30d', coalesce(sum(amount) filter (where status = 'paid' and provider = 'evopay' and coalesce(paid_at, created_at) >= now() - interval '30 days'), 0),
        'refunded_total', coalesce(sum(amount) filter (where status = 'refunded'), 0)$$
  ],
  array[1, 1, 1, 1, 1, 1, 1]);

-- lista de assinaturas: nova coluna `lifetime` (muda o tipo de retorno => a definição é capturada, o objeto antigo é dropado e o novo criado)
select pg_temp.rewrite_fn('public.list_platform_subscriptions(text,text,text,text,integer,text,integer,integer)',
  array[
    $$expires_at timestamp with time zone, days_left integer,$$,
    $$when s.status in ('trialing', 'active') and s.expires_at > now() then s.status::text$$,
    $$greatest(0, ceil(extract(epoch from (s.expires_at - now())) / 86400.0))::integer as b_days,$$,
    $$b.b_starts, b.b_expires, b.b_days, b.b_provider,$$
  ],
  array[
    $$expires_at timestamp with time zone, lifetime boolean, days_left integer,$$,
    $$when s.status in ('trialing', 'active') and (s.lifetime or s.expires_at > now()) then s.status::text$$,
    $$case when s.lifetime then null else greatest(0, ceil(extract(epoch from (s.expires_at - now())) / 86400.0))::integer end as b_days,
      s.lifetime as b_lifetime,$$,
    $$b.b_starts, b.b_expires, b.b_lifetime, b.b_days, b.b_provider,$$
  ],
  array[1, 1, 1, 1], true);
revoke all on function public.list_platform_subscriptions(text, text, text, text, integer, text, integer, integer) from public, anon;
grant execute on function public.list_platform_subscriptions(text, text, text, text, integer, text, integer, integer) to authenticated;

-- ------------------------------------------------------------ 15. diagnósticos (14 verificações)
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
             where e.plan_id <> s.plan_id or e.status <> s.status
                or e.access_expires_at is distinct from s.expires_at or e.lifetime <> s.lifetime),
           'Use "Sincronizar entitlements" na empresa.'
    union all
    select 'subscriptions_stale_status', 'Assinaturas vencidas ainda marcadas como ativas', 'warn',
           (select count(*) from public.subscriptions where status in ('active', 'trialing') and not lifetime and expires_at <= now()),
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
           'Reverifique o pagamento em Pagamentos (consulta o EvoPay) ou use "Reconciliar pendentes".'
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
             where c.status = 'inactive' and s.status in ('active', 'trialing') and (s.lifetime or s.expires_at > now())),
           'Revise o status da empresa.'
    union all
    select 'refunded_with_access', 'Pagamentos estornados com acesso ainda ativo', 'warn',
           (select count(distinct sp.id) from public.subscription_payments sp join public.subscriptions s on s.company_id = sp.company_id
             where sp.status = 'refunded' and s.status in ('active', 'trialing') and (s.lifetime or s.expires_at > now())),
           'O estorno não revoga o acesso automaticamente: revise a empresa e, se for o caso, ajuste o vencimento ou cancele a assinatura.'
    union all
    select 'payment_events_unprocessed', 'Eventos de pagamento não processados há mais de 1 hora', 'warn',
           (select count(*) from public.payment_events where not processed and created_at < now() - interval '1 hour'),
           'Confirmação rejeitada (valor divergente/ausente) ou falha: reverifique o pagamento e compare com o valor esperado.'
    union all
    select 'manual_payment_below_price', 'Pagamentos manuais com acesso e valor abaixo do preço do plano (90 dias)', 'warn',
           (select count(*) from public.subscription_payments sp join public.plans pl on pl.id = sp.plan_id
             where sp.provider = 'manual' and sp.status = 'paid' and sp.subscription_id is not null
               and pl.price is not null and sp.amount < pl.price and sp.created_at >= now() - interval '90 days'),
           'Confira se o desconto foi combinado com o cliente (campo Observação do pagamento).'
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
