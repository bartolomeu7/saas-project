-- =============================================================================
-- ROLLBACK de 20261014000000_plans_management_and_usage_limits.sql
--
-- Devolve o schema ao estado anterior à migration (as 6 funções recriadas voltam ao corpo ORIGINAL). Executar uma vez,
-- numa transação. NÃO restaura DADOS:
--   * as colunas comerciais novas de `plans` (tagline, highlight, public_visible, cta_label, contact_url, benefits_title,
--     compare_price, promo_*, show_*) e toda a tabela `plan_benefits` são REMOVIDAS (perdem-se esses textos/valores);
--   * `user_session_slots` e `trial_signup_events` são removidas (contadores antifraude e vagas de sessão);
--   * as linhas de `platform_settings` das 4 chaves novas são apagadas;
--   * o `sort_order` preenchido para os planos do sistema (10/20/30/40/50) e as descrições preenchidas onde estavam vazias
--     NÃO são desfeitos (inofensivos: o código anterior os ignora ou já os lia);
--   * o histórico em `audit_logs` (platform.plan.details_updated, platform.session.*, platform.signup.*) é preservado.
-- Preços, durações, assinaturas, pagamentos, entitlements e vínculos de empresa NÃO são tocados em nenhum momento.
--
-- Efeito no app: código anterior à migration continua funcionando. Código NOVO deixa de funcionar nas partes novas
-- (a home mostra "planos indisponíveis" até o formato antigo ser lido pelo normalizador; o gate de sessões e o antifraude
-- passam a registrar falha e liberam o acesso).
-- =============================================================================
begin;

-- 1. Checkout / onboarding: corpos originais
create or replace function public.claim_subscription_payment(
  p_company_id uuid, p_plan_id uuid, p_amount numeric, p_currency text default 'BRL'::text, p_stale_seconds integer default 120)
returns table(payment_id uuid, created boolean, has_charge boolean, payment_status subscription_payment_status)
language plpgsql security definer set search_path to 'public' as $$
declare
  v_plan public.plans;
  v_existing public.subscription_payments;
  v_sub_id uuid;
  v_id uuid;
begin
  if p_company_id is null or p_plan_id is null or p_amount is null then
    raise exception 'Parâmetros inválidos.';
  end if;
  if not exists (select 1 from public.companies where id = p_company_id) then
    raise exception 'Empresa não encontrada.';
  end if;

  select * into v_plan from public.plans where id = p_plan_id;
  if not found or v_plan.status <> 'active' then
    raise exception 'Plano indisponível.';
  end if;
  if v_plan.price is null or v_plan.access_duration_days is null then
    raise exception 'Plano sem preço ou duração fixa.';
  end if;
  -- o valor vem do plano no banco: o chamador só confirma o que leu
  if round(p_amount, 2) <> round(v_plan.price, 2) then
    raise exception 'O valor informado não corresponde ao preço do plano.';
  end if;
  if coalesce(p_currency, '') <> coalesce(v_plan.currency, 'BRL') then
    raise exception 'Moeda diferente da do plano.';
  end if;

  -- serializa as reservas da mesma intenção (empresa + plano)
  perform pg_advisory_xact_lock(hashtext('billing_claim:' || p_company_id::text || ':' || p_plan_id::text));

  select * into v_existing
    from public.subscription_payments
   where company_id = p_company_id and plan_id = p_plan_id
     and provider = 'evopay' and status = 'pending'
   for update;

  if found then
    if v_existing.provider_transaction_id is not null then
      -- cobrança aberta já criada no provedor: reutiliza (mesma intenção)
      return query select v_existing.id, false, true, v_existing.status;
      return;
    end if;
    if v_existing.created_at > now() - make_interval(secs => greatest(coalesce(p_stale_seconds, 120), 30)) then
      -- outra requisição está criando a cobrança agora
      return query select v_existing.id, false, false, v_existing.status;
      return;
    end if;
    -- reserva abandonada antes de chegar ao provedor: libera a vaga para uma nova tentativa
    update public.subscription_payments
       set status = 'failed',
           notes = coalesce(notes || ' | ', '') || 'Reserva abandonada antes de ser criada no provedor.'
     where id = v_existing.id;
  end if;

  select id into v_sub_id from public.subscriptions where company_id = p_company_id;

  insert into public.subscription_payments (company_id, subscription_id, plan_id, provider, status, amount, currency)
  values (p_company_id, v_sub_id, p_plan_id, 'evopay', 'pending', v_plan.price, v_plan.currency)
  returning id into v_id;

  return query select v_id, true, false, 'pending'::public.subscription_payment_status;
end;
$$;

create or replace function public.create_company_with_owner(p_name text, p_business_type business_type default 'other'::business_type)
returns companies
language plpgsql security definer set search_path to 'public' as $$
declare
  v_user_id uuid := public.current_profile_user_id();
  v_company public.companies;
  v_trial_plan public.plans;
  v_trial_already_used boolean;
  v_expires_at timestamptz;
  v_already_has_company boolean;
begin
  if v_user_id is null then
    raise exception 'Usuário não autenticado.';
  end if;

  -- Serializa chamadas concorrentes desta função para o MESMO usuário.
  -- hashtext() reduz o uuid a um int para o parâmetro bigint do advisory
  -- lock; colisões de hash entre usuários diferentes só fariam duas
  -- transações de usuários DIFERENTES esperarem uma pela outra por um
  -- instante (nunca causariam um resultado incorreto), então são
  -- aceitáveis e não comprometem a correção.
  perform pg_advisory_xact_lock(hashtext(v_user_id::text));

  -- Guard da migration 016 — agora executado com exclusividade garantida
  -- pelo lock acima, o que fecha a janela de corrida (TOCTOU) que existia
  -- antes: a segunda chamada só chega aqui depois que a primeira já
  -- commitou (ou desistiu), então sempre enxerga o estado real e final.
  select exists (
    select 1 from public.company_members where user_id = v_user_id
  ) into v_already_has_company;

  if v_already_has_company then
    raise exception 'Este usuário já pertence a uma empresa.';
  end if;

  if p_name is null or char_length(trim(p_name)) = 0 then
    raise exception 'Nome da empresa é obrigatório.';
  end if;

  insert into public.companies (name, business_type)
  values (trim(p_name), coalesce(p_business_type, 'other'))
  returning * into v_company;

  insert into public.company_members (company_id, user_id, role)
  values (v_company.id, v_user_id, 'owner');

  select exists (
    select 1 from public.subscriptions where trial_claimed_by = v_user_id
  ) into v_trial_already_used;

  if not v_trial_already_used then
    select * into v_trial_plan from public.plans where code = 'FREE_TRIAL';

    if v_trial_plan.id is not null and v_trial_plan.access_duration_days is not null then
      v_expires_at := now() + (v_trial_plan.access_duration_days || ' days')::interval;

      insert into public.subscriptions (
        company_id, plan_id, status, starts_at, expires_at, trial_claimed_by
      ) values (
        v_company.id, v_trial_plan.id, 'trialing', now(), v_expires_at, v_user_id
      );

      insert into public.company_entitlements (
        company_id, plan_id, status, access_starts_at, access_expires_at,
        max_additional_users, support_enabled, tickets_enabled,
        exclusive_groups_enabled, early_access_enabled
      ) values (
        v_company.id, v_trial_plan.id, 'trialing', now(), v_expires_at,
        v_trial_plan.additional_user_limit, v_trial_plan.support_enabled,
        v_trial_plan.tickets_enabled, v_trial_plan.exclusive_groups_enabled,
        v_trial_plan.early_access_enabled
      );
    end if;
  end if;

  return v_company;
end;
$$;

-- 2. Antifraude / sessões / vagas
drop function if exists public.get_my_trial_status();
drop function if exists public.authorize_trial_signup(uuid, text);
drop function if exists public.release_session_slot(uuid, text);
drop function if exists public.register_session_slot(uuid, text, text[]);
drop function if exists public.session_slot_status(text);
drop table if exists public.trial_signup_events;
drop table if exists public.user_session_slots;

drop trigger if exists company_members_seat_limit on public.company_members;
drop function if exists public.enforce_company_seat_limit();
drop function if exists public.get_company_seat_usage();

-- 3. Configurações: volta às 3 chaves originais
delete from public.platform_settings
 where key in ('max_concurrent_sessions', 'trial_signup_ip_limit', 'trial_signup_ip_window_hours', 'trial_signup_retention_days');

create or replace function public.platform_setting_definitions()
returns table(key text, default_value integer, min_value integer, max_value integer, description text)
language sql immutable set search_path to 'public' as $$
  select * from (values
    ('admin_max_free_days', 30, 1, 365,
     'Máximo de dias gratuitos que um ADMIN pode conceder em uma única operação (super_admin pode até 365).'),
    ('presence_online_seconds', 120, 90, 900,
     'Segundos desde o último sinal para um usuário contar como ONLINE (mínimo 90: o heartbeat do app roda a cada 60 s).'),
    ('presence_recent_minutes', 15, 5, 240,
     'Minutos desde o último sinal para um usuário contar como RECENTEMENTE ONLINE.')
  ) as t(key, default_value, min_value, max_value, description);
$$;

create or replace function public.set_platform_setting(p_key text, p_value integer, p_reason text default null::text)
returns void language plpgsql security definer set search_path to 'public' as $$
declare
  v_def record;
  v_old integer;
begin
  if not public.is_super_admin() then
    raise exception 'not authorized';
  end if;

  select * into v_def from public.platform_setting_definitions() d where d.key = p_key;
  if not found then
    raise exception 'Configuração desconhecida.';
  end if;

  if p_value is null or p_value < v_def.min_value or p_value > v_def.max_value then
    raise exception 'Valor fora do intervalo permitido (% a %).', v_def.min_value, v_def.max_value;
  end if;

  if p_key = 'presence_online_seconds' and p_value > public.platform_setting_int('presence_recent_minutes', 15) * 60 then
    raise exception 'O limiar ONLINE não pode ser maior que o de RECENTEMENTE ONLINE.';
  end if;
  if p_key = 'presence_recent_minutes' and p_value * 60 < public.platform_setting_int('presence_online_seconds', 120) then
    raise exception 'O limiar RECENTEMENTE ONLINE não pode ser menor que o de ONLINE.';
  end if;

  v_old := public.platform_setting_int(p_key, v_def.default_value);

  insert into public.platform_settings (key, value, updated_at, updated_by)
  values (p_key, to_jsonb(p_value), now(), public.current_profile_user_id())
  on conflict (key) do update
    set value = excluded.value, updated_at = now(), updated_by = excluded.updated_by;

  perform public.write_platform_audit_log(
    'platform.settings.updated', 'platform_setting', md5('platform_setting:' || p_key)::uuid,
    null, null,
    jsonb_build_object('key', p_key, 'from', v_old, 'to', p_value, 'reason', nullif(trim(coalesce(p_reason, '')), ''))
  );
end;
$$;

-- 4. Catálogo: formatos originais de get_public_plans() e list_platform_plans()
drop function if exists public.admin_save_plan(uuid, jsonb);
drop function if exists public.list_platform_plan_history(uuid, integer);

drop function if exists public.get_public_plans();
create function public.get_public_plans()
returns table(id uuid, code text, name text, description text, price numeric, currency text, access_duration_days integer,
              additional_user_limit integer, trial boolean, support_enabled boolean, tickets_enabled boolean,
              exclusive_groups_enabled boolean, early_access_enabled boolean, status plan_status)
language sql stable security definer set search_path to 'public' as $$
  select id, code, name, description, price, currency, access_duration_days,
         additional_user_limit, trial, support_enabled, tickets_enabled,
         exclusive_groups_enabled, early_access_enabled, status
  from public.plans
  where status = 'active' and not lifetime;
$$;
revoke all on function public.get_public_plans() from public;
grant execute on function public.get_public_plans() to anon, authenticated, service_role;

drop function if exists public.list_platform_plans();
create function public.list_platform_plans()
returns table(plan_id uuid, code text, name text, description text, price numeric, currency text, access_duration_days integer,
              billing_interval billing_interval, additional_user_limit integer, trial boolean, support_enabled boolean,
              tickets_enabled boolean, exclusive_groups_enabled boolean, early_access_enabled boolean, status plan_status,
              sort_order integer, created_at timestamptz, subscriptions_count bigint, active_subscriptions_count bigint,
              payments_count bigint, is_protected boolean, lifetime boolean)
language plpgsql security definer set search_path to 'public' as $$
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
         (select count(*) from public.subscriptions s where s.plan_id = p.id and s.status in ('active', 'trialing') and (s.lifetime or s.expires_at > now())),
         (select count(*) from public.subscription_payments sp where sp.plan_id = p.id),
         p.code in ('FREE_TRIAL', 'MONTHLY', 'QUARTERLY', 'YEARLY', 'CUSTOM'), p.lifetime
  from public.plans p
  order by p.sort_order, p.price nulls last, p.code;
end;
$$;
revoke all on function public.list_platform_plans() from public, anon;
grant execute on function public.list_platform_plans() to authenticated, service_role;

drop function if exists public.plan_discount_percent(numeric, numeric);
drop function if exists public.plan_promo_state(boolean, timestamptz, timestamptz, timestamptz);
drop function if exists public.plan_kind(text, boolean, boolean);

-- 5. Tabela de benefícios e colunas comerciais de plans
drop table if exists public.plan_benefits;

alter table public.plans
  drop constraint if exists plans_highlight_valid,
  drop constraint if exists plans_text_lengths,
  drop constraint if exists plans_contact_url_format,
  drop constraint if exists plans_compare_price_range,
  drop constraint if exists plans_compare_above_price,
  drop constraint if exists plans_promo_window_coherent,
  drop constraint if exists plans_promo_requires_compare,
  drop constraint if exists plans_currency_supported,
  drop constraint if exists plans_custom_has_no_price;

alter table public.plans
  drop column if exists tagline,
  drop column if exists highlight,
  drop column if exists public_visible,
  drop column if exists cta_label,
  drop column if exists contact_url,
  drop column if exists benefits_title,
  drop column if exists compare_price,
  drop column if exists promo_enabled,
  drop column if exists promo_starts_at,
  drop column if exists promo_ends_at,
  drop column if exists show_compare_price,
  drop column if exists show_discount_percent;

commit;
