-- =============================================================================
-- Compatibilidade CÓDIGO ANTIGO (publicado em Production, 3931854) x BANCO NOVO (migration 20261011000000).
-- Roda SOMENTE no projeto TEST, em transação que termina em erro proposital (RESULT: ...): nada persiste.
-- O código antigo chama confirm_subscription_payment com 6 argumentos nomeados (como o PostgREST faz) e cria cobrança
-- com INSERT direto em subscription_payments. Esperado (uma linha por caso):
--   C1  paid + payload com amount numérico correto  => true/paid/-
--   C2  paid + amount divergente                    => false/pending/AMOUNT_MISMATCH
--   C3  paid + sem amount                           => false/pending/AMOUNT_MISSING
--   C4  paid + amount como TEXTO                    => false/pending/AMOUNT_MISSING
--   C5  expired                                     => true/expired/-
--   C8  chamada nova: p_provider_amount prevalece   => true/paid/-
--   C6  INSERT antigo duplicado                     => unique_violation
--   C7  plano diferente na mesma empresa            => permitido
-- =============================================================================
begin;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
create temp table r (n serial, label text, got text);

do $t$
declare
  v_price numeric; v_plan uuid; v_yearly uuid;
  co1 uuid := gen_random_uuid(); co2 uuid := gen_random_uuid(); co3 uuid := gen_random_uuid(); co4 uuid := gen_random_uuid();
  co5 uuid := gen_random_uuid(); co6 uuid := gen_random_uuid();
  p1 uuid; p2 uuid; p3 uuid; p4 uuid; p5 uuid; p6 uuid;
  rr record; got text;
begin
  select id, price into v_plan, v_price from public.plans where code = 'MONTHLY';
  select id into v_yearly from public.plans where code = 'YEARLY';
  insert into public.companies (id, name, business_type, status)
    select x, '[SQLTEST] compat ' || x, 'other', 'active' from unnest(array[co1,co2,co3,co4,co5,co6]) x;
  insert into public.subscription_payments (company_id, plan_id, provider, status, amount, currency, provider_transaction_id) values (co1, v_plan, 'evopay', 'pending', v_price, 'BRL', 'tx_c1') returning id into p1;
  insert into public.subscription_payments (company_id, plan_id, provider, status, amount, currency, provider_transaction_id) values (co2, v_plan, 'evopay', 'pending', v_price, 'BRL', 'tx_c2') returning id into p2;
  insert into public.subscription_payments (company_id, plan_id, provider, status, amount, currency, provider_transaction_id) values (co3, v_plan, 'evopay', 'pending', v_price, 'BRL', 'tx_c3') returning id into p3;
  insert into public.subscription_payments (company_id, plan_id, provider, status, amount, currency, provider_transaction_id) values (co4, v_plan, 'evopay', 'pending', v_price, 'BRL', 'tx_c4') returning id into p4;
  insert into public.subscription_payments (company_id, plan_id, provider, status, amount, currency, provider_transaction_id) values (co5, v_plan, 'evopay', 'pending', v_price, 'BRL', 'tx_c5') returning id into p5;
  insert into public.subscription_payments (company_id, plan_id, provider, status, amount, currency, provider_transaction_id) values (co6, v_plan, 'evopay', 'pending', v_price, 'BRL', 'tx_c6') returning id into p6;

  select * into rr from public.confirm_subscription_payment(p_payment_id := p1, p_provider_status := 'paid', p_end_to_end_id := 'E2E1', p_event_id := 'compat:c1:COMPLETED', p_event_type := 'pix.status_check', p_event_payload := jsonb_build_object('id','tx_c1','status','COMPLETED','amount', v_price));
  insert into r(label, got) values ('C1 antigo+payload amount correto => paid', rr.ok::text || '/' || rr.new_status::text || '/' || coalesce(rr.rejection,'-'));
  select count(*)::text into got from public.subscriptions where company_id = co1 and status = 'active';
  insert into r(label, got) values ('C1b assinatura criada (esperado 1)', got);
  select * into rr from public.confirm_subscription_payment(p_payment_id := p2, p_provider_status := 'paid', p_end_to_end_id := 'E2E2', p_event_id := 'compat:c2:COMPLETED', p_event_type := 'pix.status_check', p_event_payload := jsonb_build_object('id','tx_c2','status','COMPLETED','amount', 1));
  insert into r(label, got) values ('C2 antigo+amount divergente => rejeita', rr.ok::text || '/' || rr.new_status::text || '/' || coalesce(rr.rejection,'-'));
  select * into rr from public.confirm_subscription_payment(p_payment_id := p3, p_provider_status := 'paid', p_end_to_end_id := 'E2E3', p_event_id := 'compat:c3:COMPLETED', p_event_type := 'pix.status_check', p_event_payload := jsonb_build_object('id','tx_c3','status','COMPLETED'));
  insert into r(label, got) values ('C3 antigo sem amount => rejeita', rr.ok::text || '/' || rr.new_status::text || '/' || coalesce(rr.rejection,'-'));
  select * into rr from public.confirm_subscription_payment(p_payment_id := p4, p_provider_status := 'paid', p_end_to_end_id := 'E2E4', p_event_id := 'compat:c4:COMPLETED', p_event_type := 'pix.status_check', p_event_payload := jsonb_build_object('id','tx_c4','status','COMPLETED','amount', v_price::text));
  insert into r(label, got) values ('C4 antigo amount texto => rejeita', rr.ok::text || '/' || rr.new_status::text || '/' || coalesce(rr.rejection,'-'));
  select * into rr from public.confirm_subscription_payment(p_payment_id := p5, p_provider_status := 'expired', p_end_to_end_id := null, p_event_id := 'compat:c5:EXPIRED', p_event_type := 'pix.status_check', p_event_payload := jsonb_build_object('id','tx_c5','status','EXPIRED'));
  insert into r(label, got) values ('C5 antigo expired => ok', rr.ok::text || '/' || rr.new_status::text || '/' || coalesce(rr.rejection,'-'));
  select * into rr from public.confirm_subscription_payment(p_payment_id := p6, p_provider_status := 'paid', p_end_to_end_id := 'E2E6', p_event_id := 'compat:c6:COMPLETED', p_event_type := 'pix.status_check', p_event_payload := jsonb_build_object('amount', 1), p_provider_amount := v_price);
  insert into r(label, got) values ('C8 novo: p_provider_amount prevalece => paid', rr.ok::text || '/' || rr.new_status::text || '/' || coalesce(rr.rejection,'-'));
  begin
    insert into public.subscription_payments (company_id, plan_id, provider, status, amount, currency) values (co2, v_plan, 'evopay', 'pending', v_price, 'BRL');
    insert into r(label, got) values ('C6 INSERT antigo duplicado', 'PERMITIDO (falha)');
  exception when unique_violation then
    insert into r(label, got) values ('C6 INSERT antigo duplicado', 'unique_violation');
  end;
  begin
    insert into public.subscription_payments (company_id, plan_id, provider, status, amount, currency) values (co2, v_yearly, 'evopay', 'pending', 1, 'BRL');
    insert into r(label, got) values ('C7 plano diferente mesma empresa', 'permitido');
  exception when others then
    insert into r(label, got) values ('C7 plano diferente mesma empresa', 'ERRO ' || sqlerrm);
  end;
end $t$;

do $result$ declare v text; begin select string_agg(label || ' => ' || got, E'\n' order by n) into v from r; raise exception E'RESULT:\n%', v; end $result$;
