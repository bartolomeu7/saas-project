-- =============================================================================
-- Missão 09 — EXPANSÃO (compatível com o código anterior): fortalece o gate de sessões e o teste grátis.
-- Aplicada SOMENTE em TEST. Depende de 20261014000000_plans_management_and_usage_limits.sql.
--
-- Esta migration só ADICIONA ou torna mais rígido o que é de uso exclusivo do código novo. Ela NÃO muda o
-- comportamento de create_company_with_owner (isso é a "contração", 20261014000200): por isso pode ser aplicada ANTES
-- do deploy do código sem negar teste a ninguém.
--
-- 1. register_session_slot(): +p_list_complete e proteção de vagas recentes contra poda por lista de sessões "velha"
--    (corrida entre a leitura da lista no Clerk e o registro: uma sessão aceita há < 60 s nunca é podada por outra).
-- 2. authorize_trial_signup(): a autorização expira (1 h), conexão desconhecida tem teto próprio (não é "livre").
-- 3. trial_authorization_ttl() / has_trial_authorization() / grant_free_trial_internal(): concessão ÚNICA, idempotente
--    e serializada; claim_free_trial(): quem foi negado (ou não teve autorização) pode pedir o teste depois, sem
--    recriar empresa — a mesma regra de IP vale.
-- (O índice único parcial subscriptions_one_trial_per_user_idx — um teste por usuário — JÁ existia e continua sendo a
--  garantia no banco contra concessão duplicada; esta migration não cria outro.)
--
-- Rollback: supabase/rollback/20261014000100_session_gate_and_trial_hardening.down.sql
-- =============================================================================
begin;

-- ---------------------------------------------------------------------------------------------------------------
-- 1. Sessões simultâneas
-- ---------------------------------------------------------------------------------------------------------------
drop function if exists public.register_session_slot(uuid, text, text[]);
create function public.register_session_slot(
  p_user_id uuid, p_session_id text, p_active_session_ids text[], p_list_complete boolean default true)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_limit integer;
  v_cur public.user_session_slots;
  v_count integer;
  v_active text[] := coalesce(p_active_session_ids, '{}');
begin
  if p_user_id is null or nullif(btrim(coalesce(p_session_id, '')), '') is null or char_length(p_session_id) > 200 then
    raise exception 'Parâmetros inválidos.';
  end if;
  if not exists (select 1 from public.profiles where user_id = p_user_id) then
    raise exception 'Usuário não encontrado.';
  end if;

  perform pg_advisory_xact_lock(hashtext('session_slots:' || p_user_id::text));
  v_limit := public.platform_setting_int('max_concurrent_sessions', 3);

  -- Sessões que o Clerk já não lista (expiradas/revogadas) liberam a vaga — MAS só se a lista for completa e a vaga
  -- não for recente: a lista foi lida ANTES deste registro, então uma sessão aceita há menos de 60 s por outra
  -- requisição pode não constar nela e não pode ser derrubada por isso.
  if p_list_complete then
    delete from public.user_session_slots
     where user_id = p_user_id and not (session_id = any (v_active)) and verified_at < now() - interval '60 seconds';
  end if;
  delete from public.user_session_slots where last_seen_at < now() - interval '30 days';

  if not (p_session_id = any (v_active)) then
    return jsonb_build_object('state', 'invalid', 'limit', v_limit);
  end if;

  select * into v_cur from public.user_session_slots where session_id = p_session_id;
  if v_cur.session_id is not null and v_cur.user_id <> p_user_id then
    raise exception 'Sessão inválida.';
  end if;

  select count(*) into v_count from public.user_session_slots
   where user_id = p_user_id and state = 'allowed' and session_id <> p_session_id;

  if v_cur.session_id is not null and v_cur.state = 'allowed' then
    update public.user_session_slots set last_seen_at = now(), verified_at = now() where session_id = p_session_id;
    return jsonb_build_object('state', 'allowed', 'limit', v_limit, 'active', v_count + 1);
  end if;

  if v_count < v_limit then
    insert into public.user_session_slots (session_id, user_id, state)
    values (p_session_id, p_user_id, 'allowed')
    on conflict (session_id) do update set state = 'allowed', last_seen_at = now(), verified_at = now();
    return jsonb_build_object('state', 'allowed', 'limit', v_limit, 'active', v_count + 1);
  end if;

  insert into public.user_session_slots (session_id, user_id, state)
  values (p_session_id, p_user_id, 'blocked')
  on conflict (session_id) do update set state = 'blocked', last_seen_at = now(), verified_at = now();
  if v_cur.session_id is null or v_cur.state <> 'blocked' then
    insert into public.audit_logs (company_id, actor_user_id, target_user_id, entity_type, entity_id, action, metadata)
    values (null, p_user_id, p_user_id, 'user_session', gen_random_uuid(), 'platform.session.limit_blocked',
            jsonb_build_object('limit', v_limit, 'active', v_count, '_origin', 'system'));
  end if;
  return jsonb_build_object('state', 'blocked', 'limit', v_limit, 'active', v_count);
end;
$$;
revoke all on function public.register_session_slot(uuid, text, text[], boolean) from public, anon, authenticated;
grant execute on function public.register_session_slot(uuid, text, text[], boolean) to service_role;

-- ---------------------------------------------------------------------------------------------------------------
-- 2. Teste grátis: autorização com prazo, teto para conexão desconhecida
-- ---------------------------------------------------------------------------------------------------------------
create or replace function public.trial_authorization_ttl()
returns interval language sql immutable set search_path = public as $$ select interval '1 hour' $$;
revoke all on function public.trial_authorization_ttl() from public, anon, authenticated;

-- Existe autorização VÁLIDA (não consumida, dentro do prazo, permitida) para o usuário? Uso interno.
create or replace function public.has_trial_authorization(p_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.trial_signup_events e
     where e.user_id = p_user_id and e.consumed_at is null and e.outcome in ('allowed', 'ip_unknown')
       and e.created_at > now() - public.trial_authorization_ttl());
$$;
revoke all on function public.has_trial_authorization(uuid) from public, anon, authenticated;

create or replace function public.authorize_trial_signup(p_user_id uuid, p_ip_hash text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_limit integer := public.platform_setting_int('trial_signup_ip_limit', 3);
  v_window integer := public.platform_setting_int('trial_signup_ip_window_hours', 24);
  v_retention integer := greatest(public.platform_setting_int('trial_signup_retention_days', 30), 1);
  v_prev public.trial_signup_events;
  v_count integer;
begin
  if p_user_id is null or not exists (select 1 from public.profiles where user_id = p_user_id) then
    raise exception 'Usuário não encontrado.';
  end if;
  if p_ip_hash is not null and (char_length(p_ip_hash) < 16 or char_length(p_ip_hash) > 64) then
    raise exception 'Parâmetros inválidos.';
  end if;

  -- locks sempre na mesma ordem (conexão -> usuário): contagem atômica entre cadastros simultâneos
  perform pg_advisory_xact_lock(hashtext('trial_ip:' || coalesce(p_ip_hash, 'unknown')));
  perform pg_advisory_xact_lock(hashtext('trial_user:' || p_user_id::text));

  delete from public.trial_signup_events where created_at < now() - make_interval(days => greatest(v_retention, ceil(v_window / 24.0)::integer));

  if exists (select 1 from public.subscriptions where trial_claimed_by = p_user_id) then
    return jsonb_build_object('allowed', false, 'reason', 'trial_already_used');
  end if;

  -- mesma decisão para repetições DENTRO do prazo da autorização (idempotente); depois disso reavalia
  select * into v_prev from public.trial_signup_events
   where user_id = p_user_id and consumed_at is null and created_at > now() - public.trial_authorization_ttl()
   order by created_at desc limit 1;
  if v_prev.id is not null then
    return jsonb_build_object('allowed', v_prev.outcome in ('allowed', 'ip_unknown'), 'reason',
                              case when v_prev.outcome = 'denied_ip_limit' then 'ip_limit' else 'ok' end,
                              'replayed', true, 'limit', v_limit, 'window_hours', v_window);
  end if;

  if p_ip_hash is null then
    -- Conexão não identificável (configuração de proxy ausente/incorreta): não pune quem pode ser legítimo, mas NÃO é
    -- ilimitado — todas as conexões desconhecidas dividem um teto de 10x o limite por conexão na janela.
    select count(distinct e.user_id) into v_count from public.trial_signup_events e
     where e.outcome = 'ip_unknown' and e.user_id <> p_user_id and e.created_at > now() - make_interval(hours => v_window);
    if v_count >= v_limit * 10 then
      insert into public.trial_signup_events (user_id, ip_hash, outcome) values (p_user_id, repeat('0', 16), 'denied_ip_limit');
      insert into public.audit_logs (company_id, actor_user_id, target_user_id, entity_type, entity_id, action, metadata)
      values (null, null, p_user_id, 'trial_signup', gen_random_uuid(), 'platform.signup.trial_denied',
              jsonb_build_object('limit', v_limit * 10, 'window_hours', v_window, 'ip_ref', 'unknown', '_origin', 'system'));
      return jsonb_build_object('allowed', false, 'reason', 'ip_limit', 'limit', v_limit, 'window_hours', v_window);
    end if;
    insert into public.trial_signup_events (user_id, ip_hash, outcome) values (p_user_id, repeat('0', 16), 'ip_unknown');
    return jsonb_build_object('allowed', true, 'reason', 'ip_unknown', 'limit', v_limit, 'window_hours', v_window);
  end if;

  select count(distinct e.user_id) into v_count from public.trial_signup_events e
   where e.ip_hash = p_ip_hash and e.outcome = 'allowed' and e.user_id <> p_user_id
     and e.created_at > now() - make_interval(hours => v_window);

  if v_count >= v_limit then
    insert into public.trial_signup_events (user_id, ip_hash, outcome) values (p_user_id, p_ip_hash, 'denied_ip_limit');
    insert into public.audit_logs (company_id, actor_user_id, target_user_id, entity_type, entity_id, action, metadata)
    values (null, null, p_user_id, 'trial_signup', gen_random_uuid(), 'platform.signup.trial_denied',
            jsonb_build_object('limit', v_limit, 'window_hours', v_window, 'ip_ref', left(p_ip_hash, 8), '_origin', 'system'));
    return jsonb_build_object('allowed', false, 'reason', 'ip_limit', 'limit', v_limit, 'window_hours', v_window);
  end if;

  insert into public.trial_signup_events (user_id, ip_hash, outcome) values (p_user_id, p_ip_hash, 'allowed');
  return jsonb_build_object('allowed', true, 'reason', 'ok', 'limit', v_limit, 'window_hours', v_window);
end;
$$;
revoke all on function public.authorize_trial_signup(uuid, text) from public, anon, authenticated;
grant execute on function public.authorize_trial_signup(uuid, text) to service_role;

-- ---------------------------------------------------------------------------------------------------------------
-- 3. Concessão única do teste (usada por create_company_with_owner e por claim_free_trial)
-- ---------------------------------------------------------------------------------------------------------------
create or replace function public.grant_free_trial_internal(p_user_id uuid, p_company_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_plan public.plans;
  v_expires_at timestamptz;
begin
  if p_user_id is null or p_company_id is null then
    raise exception 'Parâmetros inválidos.';
  end if;
  -- serializa concessões do mesmo usuário e da mesma empresa
  perform pg_advisory_xact_lock(hashtext('trial_grant_user:' || p_user_id::text));
  perform pg_advisory_xact_lock(hashtext('trial_grant_company:' || p_company_id::text));

  if exists (select 1 from public.subscriptions where trial_claimed_by = p_user_id) then return false; end if;
  if exists (select 1 from public.subscriptions where company_id = p_company_id) then return false; end if;
  if not public.has_trial_authorization(p_user_id) then return false; end if;

  select * into v_plan from public.plans where code = 'FREE_TRIAL';
  if v_plan.id is null or v_plan.access_duration_days is null then return false; end if;
  v_expires_at := now() + (v_plan.access_duration_days || ' days')::interval;

  insert into public.subscriptions (company_id, plan_id, status, starts_at, expires_at, trial_claimed_by)
  values (p_company_id, v_plan.id, 'trialing', now(), v_expires_at, p_user_id);

  insert into public.company_entitlements (
    company_id, plan_id, status, access_starts_at, access_expires_at, max_additional_users,
    support_enabled, tickets_enabled, exclusive_groups_enabled, early_access_enabled)
  values (
    p_company_id, v_plan.id, 'trialing', now(), v_expires_at, v_plan.additional_user_limit,
    v_plan.support_enabled, v_plan.tickets_enabled, v_plan.exclusive_groups_enabled, v_plan.early_access_enabled)
  on conflict (company_id) do update
    set plan_id = excluded.plan_id, status = excluded.status, access_starts_at = excluded.access_starts_at,
        access_expires_at = excluded.access_expires_at, max_additional_users = excluded.max_additional_users,
        support_enabled = excluded.support_enabled, tickets_enabled = excluded.tickets_enabled,
        exclusive_groups_enabled = excluded.exclusive_groups_enabled, early_access_enabled = excluded.early_access_enabled;

  update public.trial_signup_events set consumed_at = now()
   where user_id = p_user_id and consumed_at is null and outcome in ('allowed', 'ip_unknown');
  return true;
end;
$$;
revoke all on function public.grant_free_trial_internal(uuid, uuid) from public, anon, authenticated, service_role;

-- Pedido de teste por quem já tem empresa mas ainda não recebeu o teste (negado antes, ou autorização indisponível).
-- Exige autorização válida registrada pelo SERVIDOR (authorize_trial_signup); sem ela nada é concedido.
create or replace function public.claim_free_trial()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := public.current_profile_user_id();
  v_company uuid;
begin
  if v_user is null then
    raise exception 'Usuário não autenticado.';
  end if;
  perform pg_advisory_xact_lock(hashtext(v_user::text));   -- mesma chave de create_company_with_owner

  select cm.company_id into v_company from public.company_members cm
   where cm.user_id = v_user and cm.role = 'owner' order by cm.created_at asc limit 1;
  if v_company is null then
    return jsonb_build_object('granted', false, 'reason', 'no_company');
  end if;
  if exists (select 1 from public.subscriptions where trial_claimed_by = v_user) then
    return jsonb_build_object('granted', false, 'reason', 'already_used');
  end if;
  if exists (select 1 from public.subscriptions where company_id = v_company) then
    return jsonb_build_object('granted', false, 'reason', 'has_subscription');
  end if;
  if not public.has_trial_authorization(v_user) then
    return jsonb_build_object('granted', false, 'reason', 'not_authorized');
  end if;
  if public.grant_free_trial_internal(v_user, v_company) then
    return jsonb_build_object('granted', true, 'reason', 'ok');
  end if;
  return jsonb_build_object('granted', false, 'reason', 'not_granted');
end;
$$;
revoke all on function public.claim_free_trial() from public, anon;
grant execute on function public.claim_free_trial() to authenticated, service_role;

commit;
