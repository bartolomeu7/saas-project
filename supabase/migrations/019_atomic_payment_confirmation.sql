-- Corrige a corrida (race condition) na confirmação de pagamento Pix
-- (EvoPay) — o achado mais grave da auditoria: duas confirmações
-- concorrentes do MESMO pagamento (webhook duplicado, botão "Já paguei"
-- clicado ao mesmo tempo em que o webhook chega, ou reenvio de webhook)
-- podiam conceder o dobro da duração de acesso paga.
--
-- Causa raiz (em src/lib/billing/confirm-payment.ts, TypeScript): a leitura
-- do pagamento, a checagem de idempotência via payment_events, o UPDATE de
-- subscription_payments e a renovação da assinatura (activateOrRenewSubscription)
-- eram operações separadas, sem nenhum lock (`FOR UPDATE`) — diferente de
-- TODAS as funções de dinheiro/pontos do módulo de Fidelidade
-- (redeem_loyalty_points, adjust_loyalty_points etc.), que sempre travam a
-- linha antes de ler+decidir+escrever. Além disso, o erro do INSERT em
-- payment_events nunca era verificado, então a constraint
-- UNIQUE(provider, event_id) existia mas não funcionava como trava real.
--
-- Correção: toda a seção crítica (idempotência + status do pagamento +
-- renovação da assinatura) passa a rodar dentro de uma única função
-- SECURITY DEFINER que trava a linha do pagamento com `FOR UPDATE` logo no
-- início — isso serializa QUALQUER chamada concorrente para o MESMO
-- paymentId, exatamente como o restante do sistema já faz para dinheiro.
-- A chamada HTTP à EvoPay (GET /pix?id=) continua em TypeScript (não dá,
-- nem deveria, ser feita a partir do Postgres) — só a parte que decide e
-- grava o novo status é que se torna atômica.
--
-- *** MIGRATION CRIADA, MAS NÃO APLICADA EM PRODUÇÃO NESTA SESSÃO ***
-- Não foi possível testar esta função com concorrência real dentro do
-- tempo desta sessão sem aplicá-la à (única) base de produção existente,
-- o que o ticket desta auditoria explicitamente proíbe sem autorização.
-- A correção foi validada por revisão lógica cuidadosa (rastreamento
-- manual de cada cenário de intercalação possível sob FOR UPDATE) e seu
-- design espelha, statement a statement, o padrão já testado e em
-- produção em redeem_loyalty_points/adjust_loyalty_points. Ver relatório
-- final para o plano de teste a executar assim que for autorizada.

create or replace function public.confirm_subscription_payment(
  p_payment_id uuid,
  p_provider_status public.subscription_payment_status,
  p_end_to_end_id text,
  p_event_id text,
  p_event_type text,
  p_event_payload jsonb
)
returns table (
  ok boolean,
  new_status public.subscription_payment_status,
  already_processed boolean,
  not_found boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.subscription_payments;
  v_event_processed boolean;
  v_event_exists boolean;
  v_plan public.plans;
  v_subscription public.subscriptions;
  v_now timestamptz := now();
  v_base_date timestamptz;
  v_new_expires_at timestamptz;
begin
  -- Trava a linha do pagamento: serializa TODAS as chamadas concorrentes
  -- de confirmação para este paymentId específico. A segunda chamada só
  -- prossegue depois que a primeira já commitou (ou desistiu) — nunca lê
  -- um estado "no meio do caminho".
  select * into v_payment from public.subscription_payments where id = p_payment_id for update;

  if not found then
    return query select false, 'pending'::public.subscription_payment_status, false, true;
    return;
  end if;

  -- Idempotência via payment_events, agora DENTRO do lock da linha do
  -- pagamento (antes, o INSERT concorrente na mesma unique constraint
  -- falhava silenciosamente sem que o código verificasse o erro).
  select exists(
    select 1 from public.payment_events where provider = 'evopay' and event_id = p_event_id
  ) into v_event_exists;

  if v_event_exists then
    select processed into v_event_processed
      from public.payment_events where provider = 'evopay' and event_id = p_event_id;
  else
    insert into public.payment_events (provider, event_id, event_type, payload, subscription_payment_id, processed)
    values ('evopay', p_event_id, p_event_type, p_event_payload, p_payment_id, false);
    v_event_processed := false;
  end if;

  if v_event_processed then
    return query select true, v_payment.status, true, false;
    return;
  end if;

  -- Já estava pago antes desta chamada: nunca reprocessa a renovação —
  -- é exatamente isso que impede conceder o período em dobro.
  if v_payment.status = 'paid' then
    update public.payment_events set processed = true, processed_at = v_now
      where provider = 'evopay' and event_id = p_event_id;
    return query select true, v_payment.status, false, false;
    return;
  end if;

  if p_provider_status = v_payment.status then
    update public.payment_events set processed = true, processed_at = v_now
      where provider = 'evopay' and event_id = p_event_id;
    return query select true, p_provider_status, false, false;
    return;
  end if;

  update public.subscription_payments
    set status = p_provider_status,
        end_to_end_id = coalesce(p_end_to_end_id, end_to_end_id),
        paid_at = case when p_provider_status = 'paid' and paid_at is null then v_now else paid_at end
    where id = p_payment_id;

  if p_provider_status = 'paid' then
    -- Trava a subscription da empresa (protege contra dois PAGAMENTOS
    -- DIFERENTES da mesma empresa renovando ao mesmo tempo — cenário mais
    -- raro que o principal, mas a mesma classe de corrida).
    select * into v_subscription from public.subscriptions where company_id = v_payment.company_id for update;
    select * into v_plan from public.plans where id = v_payment.plan_id;

    if v_plan.id is not null and v_plan.access_duration_days is not null then
      v_base_date := v_now;
      if v_subscription.id is not null
         and v_subscription.status in ('active', 'trialing')
         and v_subscription.expires_at > v_now then
        v_base_date := v_subscription.expires_at;
      end if;

      v_new_expires_at := v_base_date + (v_plan.access_duration_days || ' days')::interval;

      if v_subscription.id is not null then
        update public.subscriptions
          set plan_id = v_plan.id, status = 'active', expires_at = v_new_expires_at, provider = 'evopay'
          where company_id = v_payment.company_id;
      else
        insert into public.subscriptions (company_id, plan_id, status, starts_at, expires_at, provider)
        values (v_payment.company_id, v_plan.id, 'active', v_now, v_new_expires_at, 'evopay');
      end if;

      insert into public.company_entitlements (
        company_id, plan_id, status, access_starts_at, access_expires_at,
        max_additional_users, support_enabled, tickets_enabled,
        exclusive_groups_enabled, early_access_enabled
      ) values (
        v_payment.company_id, v_plan.id, 'active',
        coalesce(v_subscription.starts_at, v_now), v_new_expires_at,
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
    end if;
  end if;

  update public.payment_events set processed = true, processed_at = v_now
    where provider = 'evopay' and event_id = p_event_id;

  return query select true, p_provider_status, false, false;
end;
$$;

comment on function public.confirm_subscription_payment(uuid, public.subscription_payment_status, text, text, text, jsonb) is
  'Único ponto de escrita atômico para confirmação de pagamento Pix (EvoPay) + renovação de assinatura. Trava subscription_payments (e, se for pagamento confirmado, subscriptions) com FOR UPDATE antes de decidir e escrever — corrige a corrida em que duas confirmações concorrentes do mesmo pagamento podiam conceder o dobro do período pago. Chamado por src/lib/billing/confirm-payment.ts (createAdminClient), nunca pelo client.';

-- SECURITY DEFINER com privilégios amplos sobre dados de billing: só o
-- backend (service_role, via createAdminClient) pode chamar.
revoke all on function public.confirm_subscription_payment(uuid, public.subscription_payment_status, text, text, text, jsonb) from public;
revoke all on function public.confirm_subscription_payment(uuid, public.subscription_payment_status, text, text, text, jsonb) from anon;
revoke all on function public.confirm_subscription_payment(uuid, public.subscription_payment_status, text, text, text, jsonb) from authenticated;
grant execute on function public.confirm_subscription_payment(uuid, public.subscription_payment_status, text, text, text, jsonb) to service_role;
