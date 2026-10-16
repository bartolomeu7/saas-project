-- =============================================================================
-- Billing hardening (Missão 07) — aplicada SOMENTE em TEST nesta missão. Production exige autorização própria.
--
-- 1. Idempotência da criação de cobrança: no máximo UMA cobrança evopay "pending" por (empresa, plano)
--    (índice parcial) + claim_subscription_payment(): reserva atômica (advisory lock por empresa+plano) que
--    reutiliza a cobrança aberta, recusa duplicidade em voo e recicla reservas abandonadas.
-- 2. Confirmação de pagamento (confirm_subscription_payment) agora:
--      * recebe o valor confirmado pelo provedor e só concede acesso se for IGUAL ao valor esperado
--        (gravado no servidor a partir do preço do plano); ausente/divergente => rejeita, sem conceder;
--      * recusa conceder sem cobrança criada no provedor ou para plano sem duração fixa;
--      * "pending" tardio nunca rebaixa um estado final;
--      * estorno confirmado pelo provedor marca o pagamento como 'refunded' (sem revogar acesso
--        automaticamente: a decisão é do admin; ver diagnóstico novo);
--      * usa platform_apply_access() (único escritor de assinatura + entitlements, já testado).
-- 3. platform_diagnostics: + estornos com acesso ainda ativo + eventos de pagamento não processados.
--
-- COMPATIBILIDADE DE VERSÕES (provada em TEST, ver docs/qa/mission-07-1-release-readiness.md):
--   * código ANTIGO + banco NOVO: a confirmação de 6 argumentos continua funcionando (o valor vem do payload) e
--     continua recusando valor divergente/ausente; a criação de cobrança antiga (INSERT direto) passa a falhar de
--     forma segura se já houver cobrança aberta da mesma empresa+plano (índice único) — nunca duplica.
--   * código NOVO + banco ANTIGO: create-payment falha (claim inexistente) e a confirmação falha (assinatura nova
--     inexistente): fecha sem cobrar. Por isso a ORDEM SEGURA é: migrations em Production -> deploy do código.
--
-- ROLLBACK: supabase/rollback/20261011000000_billing_hardening.down.sql (testado em TEST, em transação).
-- =============================================================================

-- ------------------------------------------------------------------ 0. saneamento
-- Mantém só a cobrança pendente MAIS RECENTE por (empresa, plano); as anteriores viram 'cancelled'.
-- Sem efeito em Production (0 pagamentos); em TEST normaliza duplicatas de testes antigos.
update public.subscription_payments p
   set status = 'cancelled',
       notes = coalesce(p.notes || ' | ', '') || 'Cancelada pela migration billing_hardening: cobrança pendente duplicada.'
 where p.provider = 'evopay'
   and p.status = 'pending'
   and exists (
     select 1 from public.subscription_payments n
      where n.provider = 'evopay' and n.status = 'pending'
        and n.company_id = p.company_id and n.plan_id = p.plan_id
        and (n.created_at, n.id) > (p.created_at, p.id)
   );

create unique index if not exists subscription_payments_one_open_evopay_charge_idx
  on public.subscription_payments (company_id, plan_id)
  where provider = 'evopay' and status = 'pending';

-- ------------------------------------------------------------------ 1. claim
create or replace function public.claim_subscription_payment(
  p_company_id uuid,
  p_plan_id uuid,
  p_amount numeric,
  p_currency text default 'BRL',
  p_stale_seconds integer default 120
)
 returns table (
  payment_id uuid,
  created boolean,
  has_charge boolean,
  payment_status public.subscription_payment_status
 )
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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
$function$;
revoke all on function public.claim_subscription_payment(uuid, uuid, numeric, text, integer) from public, anon, authenticated;
grant execute on function public.claim_subscription_payment(uuid, uuid, numeric, text, integer) to service_role;

-- ------------------------------------------------------------------ 2. confirmação
drop function if exists public.confirm_subscription_payment(uuid, public.subscription_payment_status, text, text, text, jsonb);

create function public.confirm_subscription_payment(
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

-- ------------------------------------------------------------------ 3. diagnósticos
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
