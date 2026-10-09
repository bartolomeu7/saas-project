-- =============================================================================
-- Bateria SQL da confirmação de pagamento (confirm_subscription_payment) — roda SOMENTE no projeto TEST.
-- Transação única que termina em erro proposital (RESULT: ...): nada persiste. Sem dinheiro e sem provedor:
-- simula o que o webhook/"Já paguei" entregam ao banco (status do provedor + event_id).
-- A EvoPay não tem sandbox (ver src/lib/evopay/client.ts): cobrança e webhook REAIS não são testáveis aqui.
-- =============================================================================
begin;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

create temp table r (n serial, label text, expect text, got text, ok boolean);
grant all on r to authenticated, anon;
grant all on sequence r_n_seq to authenticated, anon;
-- chk(rótulo, consulta que devolve 1 valor, esperado): 'OK=valor' exato | 'ERR=trecho' | 'ANYERR' (qualquer erro ou 0 linhas)
create or replace function pg_temp.chk(l text, q text, e text) returns void language plpgsql as $$
declare v text; got text; pass boolean;
begin
  begin execute q into v; got := 'OK=' || coalesce(v, 'null');
  exception when others then got := 'ERR=' || sqlerrm; end;
  pass := case when e like 'OK=%' then got = e
               when e like 'ERR=%' then got like 'ERR=%' and position(substr(e, 5) in got) > 0
               when e = 'DENIED_OR_EMPTY' then got = 'OK=0' or got like 'ERR=%'
               else false end;
  insert into r(label, expect, got, ok) values (l, e, left(got, 200), pass);
end $$;
grant execute on function pg_temp.chk(text, text, text) to authenticated, anon;

create temp table ctx as select (select id from public.plans where code = 'MONTHLY') monthly, gen_random_uuid() co1, gen_random_uuid() co2;
grant select on ctx to authenticated, anon;
insert into public.companies (id, name, business_type, status)
  select x.id, x.n, 'other', 'active' from (select co1 id, '[BILLTEST] c1' n from ctx union all select co2, '[BILLTEST] c2' from ctx) x;
create temp table pay as
  with a as (insert into public.subscription_payments (company_id, plan_id, provider, status, amount, provider_transaction_id) select co1, monthly, 'evopay', 'pending', 89, 'tx_bill_1' from ctx returning id),
       b as (insert into public.subscription_payments (company_id, plan_id, provider, status, amount, provider_transaction_id) select co1, monthly, 'evopay', 'pending', 89, 'tx_bill_2' from ctx returning id),
       c as (insert into public.subscription_payments (company_id, plan_id, provider, status, amount, provider_transaction_id) select co2, monthly, 'evopay', 'pending', 89, 'tx_bill_3' from ctx returning id)
  select (select id from a) p1, (select id from b) p2, (select id from c) p3;
grant select on pay to authenticated, anon;

-- pendente -> nada muda
select pg_temp.chk('provedor pendente: ok, sem alteração, sem assinatura', $q$select (c.ok::text || ',' || c.new_status::text || ',' || c.already_processed::text || ',' || c.not_found::text) || ',' || (select count(*) from public.subscriptions where company_id = (select co1 from ctx)) from public.confirm_subscription_payment((select p1 from pay), 'pending', null, 'tx_bill_1:PENDING', 'pix.status_check', '{}'::jsonb) c$q$, 'OK=true,pending,false,false,0');
-- pago: concede
select pg_temp.chk('pago: paid + assinatura active + entitlements', $q$select (c.ok::text || ',' || c.new_status::text || ',' || c.already_processed::text) from public.confirm_subscription_payment((select p1 from pay), 'paid', 'E2E1', 'tx_bill_1:COMPLETED', 'pix.status_check', '{}'::jsonb) c$q$, 'OK=true,paid,false');
select pg_temp.chk('assinatura ativa ~31 dias, provider evopay', $q$select (s.status::text || ',' || (extract(epoch from (s.expires_at - now())) / 86400 between 30.9 and 31.1)::text || ',' || s.provider) from public.subscriptions s where company_id = (select co1 from ctx)$q$, 'OK=active,true,evopay');
select pg_temp.chk('entitlements coerentes com a assinatura', $q$select count(*)::text from public.subscriptions s join public.company_entitlements e on e.company_id = s.company_id where s.company_id = (select co1 from ctx) and e.plan_id = s.plan_id and e.status = s.status and e.access_expires_at = s.expires_at$q$, 'OK=1');
create temp table exp1 as select expires_at e from public.subscriptions where company_id = (select co1 from ctx);
-- idempotência
select pg_temp.chk('webhook duplicado (mesmo event_id): already_processed', $q$select (c.ok::text || ',' || c.already_processed::text) from public.confirm_subscription_payment((select p1 from pay), 'paid', 'E2E1', 'tx_bill_1:COMPLETED', 'pix.status_check', '{}'::jsonb) c$q$, 'OK=true,true');
select pg_temp.chk('duplicado NÃO estende o acesso', $q$select (s.expires_at = (select e from exp1))::text from public.subscriptions s where company_id = (select co1 from ctx)$q$, 'OK=true');
select pg_temp.chk('novo event_id p/ pagamento já pago: sem dupla concessão', $q$select (c.ok::text || ',' || c.new_status::text) from public.confirm_subscription_payment((select p1 from pay), 'paid', 'E2E1', 'tx_bill_1:COMPLETED#2', 'pix.status_check', '{}'::jsonb) c$q$, 'OK=true,paid');
select pg_temp.chk('mesmo vencimento depois da reentrega', $q$select (s.expires_at = (select e from exp1))::text from public.subscriptions s where company_id = (select co1 from ctx)$q$, 'OK=true');
-- fora de ordem / LIMITAÇÃO documentada: depois de paid, nada reverte
select pg_temp.chk('pending após paid: continua paid', $q$select c.new_status::text from public.confirm_subscription_payment((select p1 from pay), 'pending', null, 'tx_bill_1:PENDING#late', 'pix.status_check', '{}'::jsonb) c$q$, 'OK=paid');
select pg_temp.chk('LIMITAÇÃO: expired após paid continua paid', $q$select c.new_status::text from public.confirm_subscription_payment((select p1 from pay), 'expired', null, 'tx_bill_1:EXPIRED#late', 'pix.status_check', '{}'::jsonb) c$q$, 'OK=paid');
select pg_temp.chk('LIMITAÇÃO: refunded após paid continua paid (estorno não reverte acesso)', $q$select c.new_status::text from public.confirm_subscription_payment((select p1 from pay), 'refunded', null, 'tx_bill_1:REFUNDED#late', 'pix.status_check', '{}'::jsonb) c$q$, 'OK=paid');
-- renovação empilhada (statements separados: a função altera a tabela que a consulta lê)
select * from public.confirm_subscription_payment((select p2 from pay), 'paid', 'E2E2', 'tx_bill_2:COMPLETED', 'pix.status_check', '{}'::jsonb);
select pg_temp.chk('renovação empilha sobre o vencimento atual (~62 dias)', $q$select round((extract(epoch from (s.expires_at - now())) / 86400)::numeric, 0)::text from public.subscriptions s where s.company_id = (select co1 from ctx)$q$, 'OK=62');
-- expirada não concede; depois paga pelo provedor concede
select * from public.confirm_subscription_payment((select p3 from pay), 'expired', null, 'tx_bill_3:EXPIRED', 'pix.status_check', '{}'::jsonb);
select pg_temp.chk('cobrança expirada não cria assinatura', $q$select count(*)::text from public.subscriptions where company_id = (select co2 from ctx)$q$, 'OK=0');
select * from public.confirm_subscription_payment((select p3 from pay), 'paid', 'E2E3', 'tx_bill_3:COMPLETED', 'pix.status_check', '{}'::jsonb);
select pg_temp.chk('expirada e depois paga pelo provedor: concede (o provedor é a fonte de verdade)', $q$select count(*)::text from public.subscriptions where company_id = (select co2 from ctx)$q$, 'OK=1');
select pg_temp.chk('pagamento inexistente: not_found, nada gravado', $q$select (c.not_found::text || ',' || c.ok::text) from public.confirm_subscription_payment(gen_random_uuid(), 'paid', null, 'tx_x:COMPLETED', 'pix.status_check', '{}'::jsonb) c$q$, 'OK=true,false');
select pg_temp.chk('payment_events: 1 linha por event_id', $q$select (count(*) = count(distinct event_id))::text from public.payment_events where event_id like 'tx_bill_%'$q$, 'OK=true');
select pg_temp.chk('todos os eventos processados', $q$select count(*)::text from public.payment_events where event_id like 'tx_bill_%' and not processed$q$, 'OK=0');

-- permissões
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"x_bill","role":"authenticated"}', true);
select pg_temp.chk('authenticated NÃO executa confirm_subscription_payment', $q$select count(*)::text from public.confirm_subscription_payment((select p1 from pay), 'paid', null, 'tx_hack', 'x', '{}'::jsonb)$q$, 'ERR=permission denied');
select pg_temp.chk('authenticated NÃO insere pagamento', $q$insert into public.subscription_payments(company_id, plan_id, provider, status, amount) values ((select co1 from ctx), (select monthly from ctx), 'evopay', 'paid', 1) returning 'x'$q$, 'DENIED_OR_EMPTY');
select pg_temp.chk('authenticated NÃO altera pagamento', $q$with u as (update public.subscription_payments set status = 'paid' returning 1) select count(*)::text from u$q$, 'DENIED_OR_EMPTY');
select pg_temp.chk('authenticated NÃO lê payment_events', $q$select count(*)::text from public.payment_events$q$, 'DENIED_OR_EMPTY');
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select pg_temp.chk('anon NÃO executa confirm_subscription_payment', $q$select count(*)::text from public.confirm_subscription_payment((select p1 from pay), 'paid', null, 'tx_hack2', 'x', '{}'::jsonb)$q$, 'ERR=permission denied');
select pg_temp.chk('anon NÃO vê pagamentos (RLS)', $q$select count(*)::text from public.subscription_payments$q$, 'DENIED_OR_EMPTY');
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
update public.subscriptions set starts_at = now() - interval '40 days', expires_at = now() - interval '1 minute' where company_id = (select co1 from ctx);
select pg_temp.chk('assinatura vencida por data = sem acesso mesmo com status active', $q$select (status in ('trialing', 'active') and expires_at > now())::text from public.subscriptions where company_id = (select co1 from ctx)$q$, 'OK=false');

do $result$
declare v jsonb;
begin
  select jsonb_build_object('total', count(*), 'pass', count(*) filter (where ok), 'fail', count(*) filter (where not ok),
    'falhas', coalesce((select jsonb_agg(jsonb_build_object('teste', label, 'esperado', expect, 'obtido', got) order by n) from r where not ok), '[]'::jsonb)) into v from r;
  raise exception 'RESULT: %', v::text;
end $result$;
