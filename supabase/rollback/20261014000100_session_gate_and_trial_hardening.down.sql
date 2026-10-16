-- =============================================================================
-- ROLLBACK de 20261014000100_session_gate_and_trial_hardening.sql (EXPANSÃO 2)
-- Devolve register_session_slot() à assinatura de 3 argumentos e authorize_trial_signup() ao corpo da migration
-- 20261014000000, e remove as funções novas (concessão interna, pedido de teste, prazo/validação da autorização).
-- Executar DEPOIS de 20261014000200 (contração) e ANTES de 20261014000000. Nenhum dado é alterado; o índice único
-- subscriptions_one_trial_per_user_idx é anterior à missão e permanece.
-- =============================================================================
begin;

drop function if exists public.claim_free_trial();
drop function if exists public.grant_free_trial_internal(uuid, uuid);
drop function if exists public.has_trial_authorization(uuid);

drop function if exists public.register_session_slot(uuid, text, text[], boolean);
create function public.register_session_slot(p_user_id uuid, p_session_id text, p_active_session_ids text[])
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

  -- sessões que já não estão ativas no Clerk (expiradas/revogadas) liberam a vaga
  delete from public.user_session_slots where user_id = p_user_id and not (session_id = any (v_active));
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
revoke all on function public.register_session_slot(uuid, text, text[]) from public, anon, authenticated;
grant execute on function public.register_session_slot(uuid, text, text[]) to service_role;

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

  select * into v_prev from public.trial_signup_events
   where user_id = p_user_id and consumed_at is null order by created_at desc limit 1;
  if v_prev.id is not null then
    return jsonb_build_object('allowed', v_prev.outcome in ('allowed', 'ip_unknown'), 'reason',
                              case when v_prev.outcome = 'denied_ip_limit' then 'ip_limit' else 'ok' end,
                              'replayed', true, 'limit', v_limit, 'window_hours', v_window);
  end if;

  if p_ip_hash is null then
    -- sem como identificar a conexão: não pune quem pode ser legítimo; fica registrado
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

drop function if exists public.trial_authorization_ttl();

commit;
