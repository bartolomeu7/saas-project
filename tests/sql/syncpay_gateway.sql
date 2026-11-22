-- =============================================================================
-- Bateria SQL do gateway SyncPay (migration 20261121220000_syncpay_gateway.sql).
-- Cobre claim_gateway_payment (Pix e cartão, idempotência), confirm_subscription_payment com provedor 'syncpay',
-- coluna/índice novos, funções do painel e permissões. Uma transação que termina em erro proposital (RESULT: ...):
-- nada persiste. Sem dinheiro e sem provedor: simula o que o webhook entrega.
-- =============================================================================
begin;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

create temp table r (n serial, grp text, label text, expect text, got text, ok boolean);
grant all on r to authenticated, anon;
grant all on sequence r_n_seq to authenticated, anon;
create or replace function pg_temp.chk(g text, l text, q text, e text) returns void language plpgsql as $$
declare v text; got text; pass boolean;
begin
  begin execute q into v; got := 'OK=' || coalesce(v, 'null');
  exception when others then got := 'ERR=' || sqlerrm; end;
  pass := case when e like 'OK=%' then got = e
               when e like 'ERR=%' then got like 'ERR=%' and position(substr(e, 5) in got) > 0
               when e = 'DENIED_OR_EMPTY' then got = 'OK=0' or got like 'ERR=%'
               else false end;
  insert into r(grp, label, expect, got, ok) values (g, l, e, left(got, 200), pass);
end $$;
grant execute on function pg_temp.chk(text, text, text, text) to authenticated, anon;

create or replace function pg_temp.cf(p uuid, st public.subscription_payment_status, ev text, amt numeric default null)
 returns text language sql as $$
  select (c.ok::text || ',' || c.new_status::text || ',' || c.already_processed::text || ',' || c.not_found::text || ',' || coalesce(c.rejection, '-'))
    from public.confirm_subscription_payment(p, st, null, ev, 'transaction.updated', '{}'::jsonb, amt) c $$;
create or replace function pg_temp.cl(co uuid, pl uuid, amt numeric, m text default 'pix')
 returns text language sql as $$
  select (c.created::text || ',' || c.has_charge::text || ',' || c.payment_status::text) from public.claim_gateway_payment(co, pl, amt, 'BRL', m) c $$;
create or replace function pg_temp.clid(co uuid, pl uuid, amt numeric, m text default 'pix')
 returns uuid language sql as $$ select c.payment_id from public.claim_gateway_payment(co, pl, amt, 'BRL', m) c $$;

create temp table ctx as select
  (select id from public.plans where code = 'MONTHLY') monthly,
  (select id from public.plans where code = 'YEARLY') yearly,
  (select id from public.plans where code = 'CUSTOM') custom,
  gen_random_uuid() c1, gen_random_uuid() c2, gen_random_uuid() c3;
grant select on ctx to authenticated, anon;
insert into public.companies (id, name, business_type, status)
  select x.id, x.n, 'other', 'active' from (select c1 id, '[SYNCTEST] c1' n from ctx union all select c2, '[SYNCTEST] c2' from ctx union all select c3, '[SYNCTEST] c3' from ctx) x;

-- ============================================================ A) ESTRUTURA
select pg_temp.chk('estrutura', 'colunas novas existem', $q$select count(*)::text from information_schema.columns where table_name = 'subscription_payments' and column_name in ('charge_method','card_brand','card_last4','card_submitted_at','card_attempts','status_checks')$q$, 'OK=6');
select pg_temp.chk('estrutura', 'charge_method só aceita pix/card', $q$insert into public.subscription_payments(company_id, plan_id, provider, status, amount, charge_method) values ((select c1 from ctx), (select monthly from ctx), 'syncpay', 'pending', 89, 'boleto') returning 'x'$q$, 'ERR=subscription_payments_charge_method_check');
select pg_temp.chk('estrutura', 'pagamentos antigos (EvoPay) continuam com charge_method nulo', $q$select (count(*) filter (where provider = 'evopay' and charge_method is not null))::text from public.subscription_payments$q$, 'OK=0');

-- ============================================================ B) RESERVA PIX
select pg_temp.chk('pix', 'primeira reserva cria (sem cobrança no provedor ainda)', $q$select pg_temp.cl((select c1 from ctx), (select monthly from ctx), 89)$q$, 'OK=true,false,pending');
create temp table p1 as select id from public.subscription_payments where company_id = (select c1 from ctx);
select pg_temp.chk('pix', 'grava valor do PLANO, provedor syncpay e forma pix', $q$select (amount::text || ',' || currency || ',' || provider || ',' || charge_method || ',' || status::text) from public.subscription_payments where id = (select id from p1)$q$, 'OK=89.00,BRL,syncpay,pix,pending');
select pg_temp.chk('pix', 'repetição em voo devolve a mesma, sem criar outra', $q$select pg_temp.cl((select c1 from ctx), (select monthly from ctx), 89)$q$, 'OK=false,false,pending');
update public.subscription_payments set provider_transaction_id = 'sp_tx_1' where id = (select id from p1);
select pg_temp.chk('pix', 'com cobrança criada no provedor: reutiliza (has_charge=true)', $q$select pg_temp.cl((select c1 from ctx), (select monthly from ctx), 89)$q$, 'OK=false,true,pending');
select pg_temp.chk('pix', 'outro plano = nova compra', $q$select pg_temp.cl((select c1 from ctx), (select yearly from ctx), 899)$q$, 'OK=true,false,pending');
select pg_temp.chk('pix', 'valor diferente do preço do plano é recusado', $q$select pg_temp.cl((select c3 from ctx), (select monthly from ctx), 1)$q$, 'ERR=não corresponde ao preço do plano');
select pg_temp.chk('pix', 'plano sob consulta é recusado', $q$select pg_temp.cl((select c3 from ctx), (select custom from ctx), 0)$q$, 'ERR=Plano sem preço');
select pg_temp.chk('pix', 'forma inválida é recusada', $q$select pg_temp.cl((select c3 from ctx), (select monthly from ctx), 89, 'boleto')$q$, 'ERR=Forma de pagamento inválida');
select pg_temp.chk('pix', 'índice: INSERT direto de 2ª cobrança Pix aberta é barrado', $q$insert into public.subscription_payments(company_id, plan_id, provider, status, amount, charge_method) values ((select c1 from ctx), (select monthly from ctx), 'syncpay', 'pending', 89, 'pix') returning 'x'$q$, 'ERR=subscription_payments_one_open_syncpay_charge_idx');
update public.subscription_payments set created_at = now() - interval '10 minutes', provider_transaction_id = null where id = (select id from p1);
select pg_temp.chk('pix', 'reserva Pix abandonada há 10 min: libera e cria nova', $q$select pg_temp.cl((select c1 from ctx), (select monthly from ctx), 89)$q$, 'OK=true,false,pending');
select pg_temp.chk('pix', 'a abandonada virou failed', $q$select status::text from public.subscription_payments where id = (select id from p1)$q$, 'OK=failed');

-- ============================================================ C) RESERVA CARTÃO
select pg_temp.chk('cartao', 'reserva de cartão cria (has_charge=true: não há cobrança a criar no provedor)', $q$select pg_temp.cl((select c2 from ctx), (select monthly from ctx), 89, 'card')$q$, 'OK=true,true,pending');
create temp table pc as select id from public.subscription_payments where company_id = (select c2 from ctx) and charge_method = 'card';
select pg_temp.chk('cartao', 'repetição devolve a mesma reserva', $q$select (pg_temp.clid((select c2 from ctx), (select monthly from ctx), 89, 'card') = (select id from pc))::text$q$, 'OK=true');
select pg_temp.chk('cartao', 'Pix e cartão do mesmo plano convivem (formas diferentes)', $q$select pg_temp.cl((select c2 from ctx), (select monthly from ctx), 89, 'pix')$q$, 'OK=true,false,pending');
select pg_temp.chk('cartao', 'índice: 2ª reserva de cartão aberta por INSERT é barrada', $q$insert into public.subscription_payments(company_id, plan_id, provider, status, amount, charge_method) values ((select c2 from ctx), (select monthly from ctx), 'syncpay', 'pending', 89, 'card') returning 'x'$q$, 'ERR=subscription_payments_one_open_syncpay_charge_idx');
update public.subscription_payments set card_submitted_at = now() - interval '5 minutes' where id = (select id from pc);
select pg_temp.chk('cartao', 'cobrança enviada há 5 min: aguarda o webhook, não abre outra', $q$select pg_temp.cl((select c2 from ctx), (select monthly from ctx), 89, 'card')$q$, 'OK=false,true,pending');
update public.subscription_payments set card_submitted_at = now() - interval '40 minutes' where id = (select id from pc);
select pg_temp.chk('cartao', 'enviada há 40 min sem confirmação: encerra (failed) e cria nova reserva', $q$select pg_temp.cl((select c2 from ctx), (select monthly from ctx), 89, 'card')$q$, 'OK=true,true,pending');
select pg_temp.chk('cartao', 'a antiga virou failed', $q$select status::text from public.subscription_payments where id = (select id from pc)$q$, 'OK=failed');
create temp table pc2 as select id from public.subscription_payments where company_id = (select c2 from ctx) and charge_method = 'card' and status = 'pending';
update public.subscription_payments set created_at = now() - interval '2 hours' where id = (select id from pc2);
select pg_temp.chk('cartao', 'reserva sem envio há 2 h: expira e cria nova', $q$select pg_temp.cl((select c2 from ctx), (select monthly from ctx), 89, 'card')$q$, 'OK=true,true,pending');
select pg_temp.chk('cartao', 'a sem envio virou expired', $q$select status::text from public.subscription_payments where id = (select id from pc2)$q$, 'OK=expired');

-- ============================================================ D) CONFIRMAÇÃO COM PROVEDOR syncpay
create temp table pp as select id from public.subscription_payments where company_id = (select c1 from ctx) and plan_id = (select yearly from ctx);
update public.subscription_payments set provider_transaction_id = 'sp_tx_2' where id = (select id from pp);
select pg_temp.chk('confirm', 'paid sem valor: rejeitado', $q$select pg_temp.cf((select id from pp), 'paid', 'ev_1')$q$, 'OK=false,pending,false,false,AMOUNT_MISSING');
select pg_temp.chk('confirm', 'paid com valor divergente: rejeitado', $q$select pg_temp.cf((select id from pp), 'paid', 'ev_1', 1.00)$q$, 'OK=false,pending,false,false,AMOUNT_MISMATCH');
select pg_temp.chk('confirm', 'paid com valor igual: concede', $q$select pg_temp.cf((select id from pp), 'paid', 'ev_2', 899.00)$q$, 'OK=true,paid,false,false,-');
select pg_temp.chk('confirm', 'evento gravado com o provedor do pagamento (syncpay), não evopay', $q$select provider from public.payment_events where event_id = 'ev_2'$q$, 'OK=syncpay');
select pg_temp.chk('confirm', 'assinatura marcada com provider syncpay', $q$select provider from public.subscriptions where company_id = (select c1 from ctx)$q$, 'OK=syncpay');
select pg_temp.chk('confirm', 'evento repetido (mesmo event_id) não concede em dobro', $q$select pg_temp.cf((select id from pp), 'paid', 'ev_2', 899.00)$q$, 'OK=true,paid,true,false,-');
select pg_temp.chk('confirm', 'o mesmo event_id apontando para OUTRO pagamento é recusado', $q$select pg_temp.cf((select id from pc2), 'paid', 'ev_2', 89.00)$q$, 'OK=false,expired,false,false,EVENT_PAYMENT_MISMATCH');
select pg_temp.chk('confirm', 'estorno (refunded) depois de pago marca refunded', $q$select pg_temp.cf((select id from pp), 'refunded', 'ev_3')$q$, 'OK=true,refunded,false,false,-');
select pg_temp.chk('confirm', 'refunded é terminal: paid depois é recusado', $q$select pg_temp.cf((select id from pp), 'paid', 'ev_4', 899.00)$q$, 'OK=false,refunded,false,false,REFUNDED_TERMINAL');
-- cartão: failed e depois paid (webhook fora de ordem) ainda concede
create temp table pk as select claim.payment_id id from public.claim_gateway_payment((select c3 from ctx), (select monthly from ctx), 89, 'BRL', 'card') claim;
update public.subscription_payments set provider_transaction_id = 'sp_tx_3', card_submitted_at = now() where id = (select id from pk);
select pg_temp.chk('confirm', 'cartão: failed', $q$select pg_temp.cf((select id from pk), 'failed', 'ev_5')$q$, 'OK=true,failed,false,false,-');
select pg_temp.chk('confirm', 'cartão: paid depois de failed (fora de ordem) concede', $q$select pg_temp.cf((select id from pk), 'paid', 'ev_6', 89.00)$q$, 'OK=true,paid,false,false,-');
select pg_temp.chk('confirm', 'sem cobrança no provedor (provider_transaction_id nulo): paid recusado', $q$select pg_temp.cf((select id from pc2), 'paid', 'ev_7', 89.00)$q$, 'OK=false,expired,false,false,NO_PROVIDER_CHARGE');

-- ============================================================ E) PAINEL ENXERGA O syncpay
update public.profiles set clerk_user_id = 'sync_super' where user_id = (select user_id from public.profiles where role = 'super_admin' and status = 'active' order by created_at limit 1);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"sync_super","role":"authenticated"}', true);
select pg_temp.chk('painel', 'platform_integrations_status traz a chave syncpay', $q$select (platform_integrations_status() ? 'syncpay')::text$q$, 'OK=true');
select pg_temp.chk('painel', 'syncpay.pending_payments conta os pagamentos syncpay pendentes', $q$select ((platform_integrations_status() -> 'syncpay' ->> 'pending_payments')::int >= 1)::text$q$, 'OK=true');
select pg_temp.chk('painel', 'a chave evopay continua existindo (compatibilidade)', $q$select (platform_integrations_status() ? 'evopay')::text$q$, 'OK=true');
select pg_temp.chk('painel', 'resumo traz gateway_30d somando os dois provedores', $q$select (get_platform_dashboard() -> 'revenue' ? 'gateway_30d')::text$q$, 'OK=true');
select pg_temp.chk('painel', 'platform_diagnostics segue com as mesmas verificações (14)', $q$select count(*)::text from public.platform_diagnostics()$q$, 'OK=14');
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- ============================================================ F) PERMISSÕES
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"x_sync","role":"authenticated"}', true);
select pg_temp.chk('perms', 'authenticated NÃO executa claim_gateway_payment', $q$select count(*)::text from public.claim_gateway_payment((select c1 from ctx), (select monthly from ctx), 89)$q$, 'ERR=permission denied');
select pg_temp.chk('perms', 'authenticated NÃO confirma pagamento', $q$select count(*)::text from public.confirm_subscription_payment((select id from pp), 'paid', null, 'ev_hack', 'x', '{}'::jsonb, 899)$q$, 'ERR=permission denied');
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select pg_temp.chk('perms', 'anon NÃO executa claim_gateway_payment', $q$select count(*)::text from public.claim_gateway_payment((select c1 from ctx), (select monthly from ctx), 89)$q$, 'ERR=permission denied');
reset role;

do $result$
declare v jsonb;
begin
  select jsonb_build_object('total', count(*), 'pass', count(*) filter (where ok), 'fail', count(*) filter (where not ok),
    'falhas', coalesce((select jsonb_agg(jsonb_build_object('grupo', grp, 'teste', label, 'esperado', expect, 'obtido', got) order by n) from r where not ok), '[]'::jsonb)) into v from r;
  raise exception 'RESULT: %', v::text;
end $result$;
