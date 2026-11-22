-- =============================================================================
-- Bateria SQL do gateway MisticPay (migration 20261122100000_misticpay_gateway.sql).
-- Cobre claim_gateway_payment com p_provider (idempotência por empresa+plano+gateway), confirm_subscription_payment com
-- provedor 'misticpay', escolha do gateway ativo (platform_settings), funções do painel e permissões.
-- Uma transação que termina em erro proposital (RESULT: ...): nada persiste. Sem dinheiro e sem provedor.
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
               else false end;
  insert into r(grp, label, expect, got, ok) values (g, l, e, left(got, 200), pass);
end $$;
grant execute on function pg_temp.chk(text, text, text, text) to authenticated, anon;

create or replace function pg_temp.cf(p uuid, st public.subscription_payment_status, ev text, amt numeric default null)
 returns text language sql as $$
  select (c.ok::text || ',' || c.new_status::text || ',' || c.already_processed::text || ',' || c.not_found::text || ',' || coalesce(c.rejection, '-'))
    from public.confirm_subscription_payment(p, st, null, ev, 'transaction.status_check', '{}'::jsonb, amt) c $$;
create or replace function pg_temp.cl(co uuid, pl uuid, amt numeric, m text, prov text)
 returns text language sql as $$
  select (c.created::text || ',' || c.has_charge::text || ',' || c.payment_status::text) from public.claim_gateway_payment(co, pl, amt, 'BRL', m, 120, prov) c $$;
create or replace function pg_temp.clid(co uuid, pl uuid, amt numeric, m text, prov text)
 returns uuid language sql as $$ select c.payment_id from public.claim_gateway_payment(co, pl, amt, 'BRL', m, 120, prov) c $$;

create temp table ctx as select
  (select id from public.plans where code = 'MONTHLY') monthly,
  (select id from public.plans where code = 'YEARLY') yearly,
  gen_random_uuid() c1, gen_random_uuid() c2;
grant select on ctx to authenticated, anon;
insert into public.companies (id, name, business_type, status)
  select x.id, x.n, 'other', 'active' from (select c1 id, '[MISTTEST] c1' n from ctx union all select c2, '[MISTTEST] c2' from ctx) x;

-- ============================================================ A) ESTRUTURA
select pg_temp.chk('estrutura', 'índice único novo existe e o antigo saiu', $q$select (select count(*) from pg_indexes where indexname = 'subscription_payments_one_open_charge_idx')::text || ',' || (select count(*) from pg_indexes where indexname = 'subscription_payments_one_open_syncpay_charge_idx')::text$q$, 'OK=1,0');
select pg_temp.chk('estrutura', 'só existe UMA versão de claim_gateway_payment (sem ambiguidade no PostgREST)', $q$select count(*)::text from pg_proc where proname = 'claim_gateway_payment'$q$, 'OK=1');
select pg_temp.chk('estrutura', 'chamada sem p_provider continua valendo (código anterior)', $q$select pg_temp.cl((select c1 from ctx), (select monthly from ctx), 89, 'pix', null)$q$, 'OK=true,false,pending');
select pg_temp.chk('estrutura', '... e grava o provedor syncpay', $q$select provider from public.subscription_payments where company_id = (select c1 from ctx)$q$, 'OK=syncpay');

-- ============================================================ B) RESERVA PIX POR GATEWAY
select pg_temp.chk('pix', 'MisticPay: primeira reserva cria', $q$select pg_temp.cl((select c1 from ctx), (select monthly from ctx), 89, 'pix', 'misticpay')$q$, 'OK=true,false,pending');
create temp table pm as select id from public.subscription_payments where company_id = (select c1 from ctx) and provider = 'misticpay';
select pg_temp.chk('pix', 'grava provedor misticpay, valor do PLANO e forma pix', $q$select (provider || ',' || amount::text || ',' || charge_method || ',' || status::text) from public.subscription_payments where id = (select id from pm)$q$, 'OK=misticpay,89.00,pix,pending');
select pg_temp.chk('pix', 'repetição em voo devolve a mesma, sem criar outra', $q$select pg_temp.cl((select c1 from ctx), (select monthly from ctx), 89, 'pix', 'misticpay')$q$, 'OK=false,false,pending');
update public.subscription_payments set provider_transaction_id = 'mp_tx_1' where id = (select id from pm);
select pg_temp.chk('pix', 'com cobrança criada no gateway: reutiliza (has_charge=true)', $q$select pg_temp.cl((select c1 from ctx), (select monthly from ctx), 89, 'pix', 'misticpay')$q$, 'OK=false,true,pending');
select pg_temp.chk('pix', 'a reserva da SyncPay (mesma empresa/plano) é outra intenção: convive com a da MisticPay', $q$select (select count(*) from public.subscription_payments where company_id = (select c1 from ctx) and plan_id = (select monthly from ctx) and status = 'pending')::text$q$, 'OK=2');
select pg_temp.chk('pix', 'gateway desconhecido é recusado', $q$select pg_temp.cl((select c2 from ctx), (select monthly from ctx), 89, 'pix', 'evopay')$q$, 'ERR=Gateway inválido');
select pg_temp.chk('pix', 'MisticPay não aceita cartão', $q$select pg_temp.cl((select c2 from ctx), (select monthly from ctx), 89, 'card', 'misticpay')$q$, 'ERR=apenas Pix');
select pg_temp.chk('pix', 'valor diferente do preço do plano é recusado', $q$select pg_temp.cl((select c2 from ctx), (select monthly from ctx), 1, 'pix', 'misticpay')$q$, 'ERR=não corresponde ao preço do plano');
select pg_temp.chk('pix', 'índice: INSERT direto de 2ª cobrança aberta do mesmo gateway é barrado', $q$insert into public.subscription_payments(company_id, plan_id, provider, status, amount, charge_method) values ((select c1 from ctx), (select monthly from ctx), 'misticpay', 'pending', 89, 'pix') returning 'x'$q$, 'ERR=subscription_payments_one_open_charge_idx');
update public.subscription_payments set created_at = now() - interval '10 minutes', provider_transaction_id = null where id = (select id from pm);
select pg_temp.chk('pix', 'reserva abandonada há 10 min: libera e cria nova', $q$select pg_temp.cl((select c1 from ctx), (select monthly from ctx), 89, 'pix', 'misticpay')$q$, 'OK=true,false,pending');
select pg_temp.chk('pix', 'a abandonada virou failed', $q$select status::text from public.subscription_payments where id = (select id from pm)$q$, 'OK=failed');

-- ============================================================ C) CONFIRMAÇÃO COM PROVEDOR misticpay
create temp table pn as select id from public.subscription_payments where company_id = (select c1 from ctx) and provider = 'misticpay' and status = 'pending';
update public.subscription_payments set provider_transaction_id = 'mp_tx_2' where id = (select id from pn);
select pg_temp.chk('confirm', 'paid sem valor: rejeitado', $q$select pg_temp.cf((select id from pn), 'paid', 'mp_ev_1')$q$, 'OK=false,pending,false,false,AMOUNT_MISSING');
select pg_temp.chk('confirm', 'paid com valor divergente (centavos no lugar de reais): rejeitado', $q$select pg_temp.cf((select id from pn), 'paid', 'mp_ev_1', 8900)$q$, 'OK=false,pending,false,false,AMOUNT_MISMATCH');
select pg_temp.chk('confirm', 'paid com valor igual: concede', $q$select pg_temp.cf((select id from pn), 'paid', 'mp_ev_2', 89.00)$q$, 'OK=true,paid,false,false,-');
select pg_temp.chk('confirm', 'evento gravado com o provedor do pagamento (misticpay)', $q$select provider from public.payment_events where event_id = 'mp_ev_2'$q$, 'OK=misticpay');
select pg_temp.chk('confirm', 'assinatura marcada com provider misticpay', $q$select provider from public.subscriptions where company_id = (select c1 from ctx)$q$, 'OK=misticpay');
select pg_temp.chk('confirm', 'o mesmo evento repetido não concede em dobro', $q$select pg_temp.cf((select id from pn), 'paid', 'mp_ev_2', 89.00)$q$, 'OK=true,paid,true,false,-');
select pg_temp.chk('confirm', 'estorno depois de pago marca refunded', $q$select pg_temp.cf((select id from pn), 'refunded', 'mp_ev_3')$q$, 'OK=true,refunded,false,false,-');
select pg_temp.chk('confirm', 'refunded é terminal: paid depois é recusado', $q$select pg_temp.cf((select id from pn), 'paid', 'mp_ev_4', 89.00)$q$, 'OK=false,refunded,false,false,REFUNDED_TERMINAL');
select pg_temp.chk('confirm', 'sem cobrança no gateway (provider_transaction_id nulo): paid recusado', $q$select pg_temp.cf((select id from pm), 'paid', 'mp_ev_5', 89.00)$q$, 'OK=false,failed,false,false,NO_PROVIDER_CHARGE');

-- ============================================================ D) GATEWAY ATIVO
select pg_temp.chk('gateway', 'padrão (nada configurado): misticpay', $q$select public.get_active_payment_gateway()$q$, 'OK=misticpay');
insert into public.platform_settings (key, value) values ('payment_gateway', to_jsonb('syncpay'::text));
select pg_temp.chk('gateway', 'lê o valor gravado', $q$select public.get_active_payment_gateway()$q$, 'OK=syncpay');
update public.platform_settings set value = to_jsonb('qualquer'::text) where key = 'payment_gateway';
select pg_temp.chk('gateway', 'valor inválido gravado cai no padrão (nunca em gateway desconhecido)', $q$select public.get_active_payment_gateway()$q$, 'OK=misticpay');
delete from public.platform_settings where key = 'payment_gateway';

update public.profiles set clerk_user_id = 'mist_super' where user_id = (select user_id from public.profiles where role = 'super_admin' and status = 'active' order by created_at limit 1);
update public.profiles set clerk_user_id = 'mist_admin' where user_id = (select user_id from public.profiles where role = 'admin' and status = 'active' order by created_at limit 1);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"mist_super","role":"authenticated"}', true);
select pg_temp.chk('gateway', 'super_admin troca para syncpay', $q$select public.set_active_payment_gateway('syncpay', 'teste')::text$q$, 'OK=');
select pg_temp.chk('gateway', '... e o gateway ativo passa a ser syncpay', $q$select public.get_active_payment_gateway()$q$, 'OK=syncpay');
select pg_temp.chk('gateway', 'gateway inválido é recusado', $q$select public.set_active_payment_gateway('evopay')::text$q$, 'ERR=Gateway inválido');
select pg_temp.chk('gateway', 'a troca fica na auditoria da plataforma', $q$select count(*)::text from public.audit_logs where action = 'platform.settings.updated' and metadata ->> 'key' = 'payment_gateway' and metadata ->> 'to' = 'syncpay'$q$, 'OK=1');
select pg_temp.chk('gateway', 'painel: integrações traz a chave misticpay', $q$select (platform_integrations_status() ? 'misticpay')::text$q$, 'OK=true');
select pg_temp.chk('gateway', 'painel: a chave syncpay continua', $q$select (platform_integrations_status() ? 'syncpay')::text$q$, 'OK=true');
select pg_temp.chk('gateway', 'painel: pendentes da misticpay contados', $q$select ((platform_integrations_status() -> 'misticpay' ->> 'pending_payments')::int >= 0)::text$q$, 'OK=true');
select pg_temp.chk('gateway', 'painel: resumo traz gateway_30d', $q$select (get_platform_dashboard() -> 'revenue' ? 'gateway_30d')::text$q$, 'OK=true');
select pg_temp.chk('gateway', 'painel: diagnóstico segue com 14 verificações', $q$select count(*)::text from public.platform_diagnostics()$q$, 'OK=14');
select pg_temp.chk('gateway', 'reconciliação aceita candidatos da misticpay (sem erro)', $q$select count(*) >= 0 from public.platform_reconcile_candidates(25, 1)$q$, 'OK=true');
select set_config('request.jwt.claims', '{"sub":"mist_admin","role":"authenticated"}', true);
select pg_temp.chk('gateway', 'admin comum NÃO troca o gateway', $q$select public.set_active_payment_gateway('misticpay')::text$q$, 'ERR=not authorized');
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- ============================================================ E) PERMISSÕES
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"x_mist","role":"authenticated"}', true);
select pg_temp.chk('perms', 'authenticated NÃO executa claim_gateway_payment', $q$select count(*)::text from public.claim_gateway_payment((select c1 from ctx), (select monthly from ctx), 89, 'BRL', 'pix', 120, 'misticpay')$q$, 'ERR=permission denied');
select pg_temp.chk('perms', 'authenticated NÃO confirma pagamento', $q$select count(*)::text from public.confirm_subscription_payment((select id from pn), 'paid', null, 'mp_hack', 'x', '{}'::jsonb, 89)$q$, 'ERR=permission denied');
select pg_temp.chk('perms', 'authenticated comum NÃO troca o gateway', $q$select public.set_active_payment_gateway('syncpay')::text$q$, 'ERR=not authorized');
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select pg_temp.chk('perms', 'anon NÃO executa claim_gateway_payment', $q$select count(*)::text from public.claim_gateway_payment((select c1 from ctx), (select monthly from ctx), 89, 'BRL', 'pix', 120, 'misticpay')$q$, 'ERR=permission denied');
select pg_temp.chk('perms', 'anon NÃO lê o gateway ativo', $q$select public.get_active_payment_gateway()$q$, 'ERR=permission denied');
select pg_temp.chk('perms', 'anon NÃO troca o gateway', $q$select public.set_active_payment_gateway('syncpay')::text$q$, 'ERR=permission denied');
reset role;

do $result$
declare v jsonb;
begin
  select jsonb_build_object('total', count(*), 'pass', count(*) filter (where ok), 'fail', count(*) filter (where not ok),
    'falhas', coalesce((select jsonb_agg(jsonb_build_object('grupo', grp, 'teste', label, 'esperado', expect, 'obtido', got) order by n) from r where not ok), '[]'::jsonb)) into v from r;
  raise exception 'RESULT: %', v::text;
end $result$;
