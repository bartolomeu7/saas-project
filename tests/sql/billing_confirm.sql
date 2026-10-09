-- =============================================================================
-- Bateria SQL do billing endurecido (Missão 07) — roda SOMENTE no projeto TEST.
-- Cobre claim_subscription_payment (idempotência da criação de cobrança) e confirm_subscription_payment
-- (valor, duplicidade, fora de ordem, estorno, atomicidade, permissões). Uma transação que termina em erro
-- proposital (RESULT: ...): nada persiste. Sem dinheiro e sem provedor: simula o que o webhook/"Já paguei" entregam.
-- A EvoPay não tem sandbox: cobrança/webhook REAIS não são testáveis aqui.
-- Requer a migration 20261011000000_billing_hardening.sql aplicada.
-- =============================================================================
begin;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

create temp table r (n serial, grp text, label text, expect text, got text, ok boolean);
grant all on r to authenticated, anon;
grant all on sequence r_n_seq to authenticated, anon;
-- chk(grupo, rótulo, consulta que devolve 1 valor, esperado): 'OK=valor' | 'ERR=trecho' | 'DENIED_OR_EMPTY'
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

-- confirma como o servidor faz: devolve "ok,new_status,already_processed,not_found,rejection"
create or replace function pg_temp.cf(p uuid, st public.subscription_payment_status, ev text, amt numeric default null, e2e text default null)
 returns text language sql as $$
  select (c.ok::text || ',' || c.new_status::text || ',' || c.already_processed::text || ',' || c.not_found::text || ',' || coalesce(c.rejection, '-'))
    from public.confirm_subscription_payment(p, st, e2e, ev, 'pix.status_check', '{}'::jsonb, amt) c $$;
-- reserva como o servidor faz: devolve "created,has_charge,status"
create or replace function pg_temp.cl(co uuid, pl uuid, amt numeric, stale integer default 120)
 returns text language sql as $$
  select (c.created::text || ',' || c.has_charge::text || ',' || c.payment_status::text) from public.claim_subscription_payment(co, pl, amt, 'BRL', stale) c $$;
create or replace function pg_temp.clid(co uuid, pl uuid, amt numeric, stale integer default 120)
 returns uuid language sql as $$ select c.payment_id from public.claim_subscription_payment(co, pl, amt, 'BRL', stale) c $$;

create temp table ctx as select
  (select id from public.plans where code = 'MONTHLY') monthly,
  (select id from public.plans where code = 'YEARLY') yearly,
  (select id from public.plans where code = 'CUSTOM') custom,
  (select id from public.plans where code = 'TEST_R1') inactive_plan,
  gen_random_uuid() c1, gen_random_uuid() c2, gen_random_uuid() c3, gen_random_uuid() c4;
grant select on ctx to authenticated, anon;
insert into public.companies (id, name, business_type, status)
  select x.id, x.n, 'other', 'active' from (select c1 id, '[BILLTEST] c1' n from ctx union all select c2, '[BILLTEST] c2' from ctx
     union all select c3, '[BILLTEST] c3' from ctx union all select c4, '[BILLTEST] c4' from ctx) x;

-- ============================================================ A) RESERVA / IDEMPOTÊNCIA DA CRIAÇÃO
select pg_temp.chk('claim', 'primeira reserva cria (created=true, sem cobrança no provedor ainda)', $q$select pg_temp.cl((select c1 from ctx), (select monthly from ctx), 89)$q$, 'OK=true,false,pending');
create temp table p1 as select id from public.subscription_payments where company_id = (select c1 from ctx);
select pg_temp.chk('claim', 'a reserva grava o valor do PLANO (89), moeda BRL e vínculo da empresa', $q$select (amount::text || ',' || currency || ',' || provider || ',' || status::text) from public.subscription_payments where id = (select id from p1)$q$, 'OK=89.00,BRL,evopay,pending');
select pg_temp.chk('claim', 'repetição imediata (criação em voo): NÃO cria outra, devolve a mesma', $q$select pg_temp.cl((select c1 from ctx), (select monthly from ctx), 89)$q$, 'OK=false,false,pending');
select pg_temp.chk('claim', 'mesma cobrança devolvida na repetição', $q$select (pg_temp.clid((select c1 from ctx), (select monthly from ctx), 89) = (select id from p1))::text$q$, 'OK=true');
select pg_temp.chk('claim', 'só existe 1 cobrança pending para empresa+plano', $q$select count(*)::text from public.subscription_payments where company_id = (select c1 from ctx) and plan_id = (select monthly from ctx)$q$, 'OK=1');
update public.subscription_payments set provider_transaction_id = 'tx_h_1', external_reference = 'PRIMEGES:x' where id = (select id from p1);
select pg_temp.chk('claim', 'cobrança já criada no provedor: reutiliza (has_charge=true)', $q$select pg_temp.cl((select c1 from ctx), (select monthly from ctx), 89)$q$, 'OK=false,true,pending');
select pg_temp.chk('claim', 'OUTRO plano da mesma empresa é uma nova compra legítima (created=true)', $q$select pg_temp.cl((select c1 from ctx), (select yearly from ctx), 899)$q$, 'OK=true,false,pending');
select pg_temp.chk('claim', 'OUTRA empresa, mesmo plano: nova cobrança (sem bloqueio global)', $q$select pg_temp.cl((select c2 from ctx), (select monthly from ctx), 89)$q$, 'OK=true,false,pending');
select pg_temp.chk('claim', 'valor diferente do preço do plano é recusado (servidor manda no preço)', $q$select pg_temp.cl((select c3 from ctx), (select monthly from ctx), 1)$q$, 'ERR=não corresponde ao preço do plano');
select pg_temp.chk('claim', 'plano inativo é recusado', $q$select pg_temp.cl((select c3 from ctx), (select inactive_plan from ctx), 1)$q$, 'ERR=Plano indisponível');
select pg_temp.chk('claim', 'plano sob consulta (sem preço) é recusado', $q$select pg_temp.cl((select c3 from ctx), (select custom from ctx), 0)$q$, 'ERR=Plano sem preço');
select pg_temp.chk('claim', 'empresa inexistente é recusada', $q$select pg_temp.cl(gen_random_uuid(), (select monthly from ctx), 89)$q$, 'ERR=Empresa não encontrada');
select pg_temp.chk('claim', 'índice parcial único: INSERT direto de 2ª cobrança aberta é barrado pelo banco', $q$insert into public.subscription_payments(company_id, plan_id, provider, status, amount) values ((select c1 from ctx), (select monthly from ctx), 'evopay', 'pending', 89) returning 'x'$q$, 'ERR=subscription_payments_one_open_evopay_charge_idx');
-- reserva abandonada (sem cobrança no provedor há muito tempo) é reciclada
select pg_temp.chk('claim', 'c4: reserva em voo', $q$select pg_temp.cl((select c4 from ctx), (select monthly from ctx), 89)$q$, 'OK=true,false,pending');
create temp table p4 as select id from public.subscription_payments where company_id = (select c4 from ctx);
update public.subscription_payments set created_at = now() - interval '10 minutes' where id = (select id from p4);
select pg_temp.chk('claim', 'reserva abandonada há 10 min: libera e cria nova', $q$select pg_temp.cl((select c4 from ctx), (select monthly from ctx), 89)$q$, 'OK=true,false,pending');
select pg_temp.chk('claim', 'a abandonada virou failed', $q$select status::text from public.subscription_payments where id = (select id from p4)$q$, 'OK=failed');
select pg_temp.chk('claim', 'c4 continua com exatamente 1 cobrança pending', $q$select count(*)::text from public.subscription_payments where company_id = (select c4 from ctx) and status = 'pending'$q$, 'OK=1');

-- ============================================================ B) CONFIRMAÇÃO: VALOR
select pg_temp.chk('amount', 'paid SEM valor do provedor: rejeitado (AMOUNT_MISSING), nada concedido', $q$select pg_temp.cf((select id from p1), 'paid', 'tx_h_1:COMPLETED', null, 'E2E1')$q$, 'OK=false,pending,false,false,AMOUNT_MISSING');
select pg_temp.chk('amount', 'paid com valor DIVERGENTE (1,00): rejeitado, nada concedido', $q$select pg_temp.cf((select id from p1), 'paid', 'tx_h_1:COMPLETED', 1.00, 'E2E1')$q$, 'OK=false,pending,false,false,AMOUNT_MISMATCH');
select pg_temp.chk('amount', 'paid com valor MAIOR (89,01): rejeitado', $q$select pg_temp.cf((select id from p1), 'paid', 'tx_h_1:COMPLETED', 89.01, 'E2E1')$q$, 'OK=false,pending,false,false,AMOUNT_MISMATCH');
select pg_temp.chk('amount', 'paid com valor MENOR (88,99): rejeitado', $q$select pg_temp.cf((select id from p1), 'paid', 'tx_h_1:COMPLETED', 88.99, 'E2E1')$q$, 'OK=false,pending,false,false,AMOUNT_MISMATCH');
select pg_temp.chk('amount', 'após as rejeições: pagamento segue pending e SEM assinatura', $q$select (select status::text from public.subscription_payments where id = (select id from p1)) || ',' || (select count(*) from public.subscriptions where company_id = (select c1 from ctx))$q$, 'OK=pending,0');
select pg_temp.chk('amount', 'o evento rejeitado fica registrado e NÃO processado (forense + retentativa)', $q$select processed::text from public.payment_events where event_id = 'tx_h_1:COMPLETED'$q$, 'OK=false');
select pg_temp.chk('amount', 'sem cobrança no provedor (sem transaction id) não concede', $q$select pg_temp.cf((select id from public.subscription_payments where company_id = (select c1 from ctx) and plan_id = (select yearly from ctx)), 'paid', 'tx_h_y:COMPLETED', 899)$q$, 'OK=false,pending,false,false,NO_PROVIDER_CHARGE');
-- pago com o valor certo
select pg_temp.chk('paid', 'valor correto (89,00): concede', $q$select pg_temp.cf((select id from p1), 'paid', 'tx_h_1:COMPLETED', 89.00, 'E2E1')$q$, 'OK=true,paid,false,false,-');
select pg_temp.chk('paid', 'assinatura active ~31 dias, provider evopay', $q$select (s.status::text || ',' || (extract(epoch from (s.expires_at - now())) / 86400 between 30.9 and 31.1)::text || ',' || s.provider) from public.subscriptions s where company_id = (select c1 from ctx)$q$, 'OK=active,true,evopay');
select pg_temp.chk('paid', 'entitlements coerentes com a assinatura', $q$select count(*)::text from public.subscriptions s join public.company_entitlements e on e.company_id = s.company_id where s.company_id = (select c1 from ctx) and e.plan_id = s.plan_id and e.status = s.status and e.access_expires_at = s.expires_at$q$, 'OK=1');
select pg_temp.chk('paid', 'pagamento ligado à assinatura, com paid_at e end_to_end_id', $q$select (subscription_id is not null and paid_at is not null and end_to_end_id = 'E2E1')::text from public.subscription_payments where id = (select id from p1)$q$, 'OK=true');
create temp table exp1 as select expires_at e from public.subscriptions where company_id = (select c1 from ctx);

-- ============================================================ C) EVENTOS: DUPLICADO / FORA DE ORDEM / ATRASADO
select pg_temp.chk('events', 'webhook duplicado (mesmo event_id): already_processed, sem nova concessão', $q$select pg_temp.cf((select id from p1), 'paid', 'tx_h_1:COMPLETED', 89.00, 'E2E1')$q$, 'OK=true,paid,true,false,-');
select pg_temp.chk('events', 'reentrega com OUTRO event_id (pagamento já pago): sem dupla concessão', $q$select pg_temp.cf((select id from p1), 'paid', 'tx_h_1:COMPLETED#2', 89.00, 'E2E1')$q$, 'OK=true,paid,false,false,-');
select pg_temp.chk('events', 'o vencimento não mudou depois das reentregas', $q$select (s.expires_at = (select e from exp1))::text from public.subscriptions s where company_id = (select c1 from ctx)$q$, 'OK=true');
select pg_temp.chk('events', 'pending atrasado após paid: continua paid', $q$select pg_temp.cf((select id from p1), 'pending', 'tx_h_1:PENDING#late')$q$, 'OK=true,paid,false,false,-');
select pg_temp.chk('events', 'expired atrasado após paid: continua paid (estado final não é rebaixado)', $q$select pg_temp.cf((select id from p1), 'expired', 'tx_h_1:EXPIRED#late')$q$, 'OK=true,paid,false,false,-');
select pg_temp.chk('events', 'cancelled atrasado após paid: continua paid', $q$select pg_temp.cf((select id from p1), 'cancelled', 'tx_h_1:CANCELED#late')$q$, 'OK=true,paid,false,false,-');
select pg_temp.chk('events', 'evento de OUTRO pagamento reutilizando o event_id é recusado', $q$select pg_temp.cf((select id from public.subscription_payments where company_id = (select c2 from ctx)), 'paid', 'tx_h_1:COMPLETED', 89.00)$q$, 'OK=false,pending,false,false,EVENT_PAYMENT_MISMATCH');
select pg_temp.chk('events', 'pagamento inexistente: not_found, nada gravado', $q$select pg_temp.cf(gen_random_uuid(), 'paid', 'tx_none:COMPLETED', 89)$q$, 'OK=false,pending,false,true,-');
select pg_temp.chk('events', 'payment_events: 1 linha por event_id', $q$select (count(*) = count(distinct event_id))::text from public.payment_events where event_id like 'tx_h_%'$q$, 'OK=true');

-- ============================================================ D) ESTORNO
select pg_temp.chk('refund', 'estorno confirmado pelo provedor: payment vira refunded', $q$select pg_temp.cf((select id from p1), 'refunded', 'tx_h_1:REFUNDED')$q$, 'OK=true,refunded,false,false,-');
select pg_temp.chk('refund', 'o acesso NÃO é revogado automaticamente (decisão do admin)', $q$select (s.expires_at = (select e from exp1) and s.status = 'active')::text from public.subscriptions s where company_id = (select c1 from ctx)$q$, 'OK=true');
select pg_temp.chk('refund', 'paid DEPOIS do estorno é ambíguo: rejeitado e não reconcede', $q$select pg_temp.cf((select id from p1), 'paid', 'tx_h_1:COMPLETED#after-refund', 89.00)$q$, 'OK=false,refunded,false,false,REFUNDED_TERMINAL');
select pg_temp.chk('refund', 'pending depois do estorno: ignorado', $q$select pg_temp.cf((select id from p1), 'pending', 'tx_h_1:PENDING#after-refund')$q$, 'OK=true,refunded,false,false,-');
select pg_temp.chk('refund', 'vencimento continua o mesmo após as tentativas pós-estorno', $q$select (s.expires_at = (select e from exp1))::text from public.subscriptions s where company_id = (select c1 from ctx)$q$, 'OK=true');

-- ============================================================ E) EXPIRADA -> PAGA, RENOVAÇÃO, NOVA COMPRA
select pg_temp.chk('lifecycle', 'cobrança expirada não cria assinatura', $q$select pg_temp.cf((select id from public.subscription_payments where company_id = (select c2 from ctx)), 'expired', 'tx_h_2:EXPIRED') || ',' || (select count(*) from public.subscriptions where company_id = (select c2 from ctx))$q$, 'OK=true,expired,false,false,-,0');
select pg_temp.chk('lifecycle', 'depois da expirada, a MESMA intenção pode comprar de novo (vaga liberada)', $q$select pg_temp.cl((select c2 from ctx), (select monthly from ctx), 89)$q$, 'OK=true,false,pending');
update public.subscription_payments set provider_transaction_id = 'tx_h_2' where company_id = (select c2 from ctx) and status = 'expired';
select pg_temp.chk('lifecycle', 'paga depois de expirada, valor certo: o provedor é a fonte de verdade (concede)', $q$select pg_temp.cf((select id from public.subscription_payments where company_id = (select c2 from ctx) and status = 'expired'), 'paid', 'tx_h_2:COMPLETED', 89.00)$q$, 'OK=true,paid,false,false,-');
select pg_temp.chk('lifecycle', 'assinatura criada com entitlements coerentes', $q$select count(*)::text from public.subscriptions s join public.company_entitlements e on e.company_id = s.company_id where s.company_id = (select c2 from ctx) and e.status = s.status and e.access_expires_at = s.expires_at$q$, 'OK=1');
-- renovação empilhada: novo pagamento da mesma empresa com assinatura ativa soma sobre o vencimento
update public.subscription_payments set status = 'cancelled' where company_id = (select c2 from ctx) and status = 'pending';
select pg_temp.chk('lifecycle', 'nova compra do mesmo plano após o pagamento anterior', $q$select pg_temp.cl((select c2 from ctx), (select monthly from ctx), 89)$q$, 'OK=true,false,pending');
update public.subscription_payments set provider_transaction_id = 'tx_h_3' where company_id = (select c2 from ctx) and status = 'pending';
select pg_temp.chk('lifecycle', 'renovação: paga de novo, valor certo', $q$select pg_temp.cf((select id from public.subscription_payments where company_id = (select c2 from ctx) and status = 'pending'), 'paid', 'tx_h_3:COMPLETED', 89.00)$q$, 'OK=true,paid,false,false,-');
select pg_temp.chk('lifecycle', 'renovação empilha sobre o vencimento atual (~62 dias)', $q$select round((extract(epoch from (s.expires_at - now())) / 86400)::numeric, 0)::text from public.subscriptions s where s.company_id = (select c2 from ctx)$q$, 'OK=62');
select pg_temp.chk('lifecycle', 'entitlements seguem coerentes após a renovação', $q$select count(*)::text from public.subscriptions s join public.company_entitlements e on e.company_id = s.company_id where s.company_id = (select c2 from ctx) and e.plan_id = s.plan_id and e.status = s.status and e.access_expires_at = s.expires_at$q$, 'OK=1');
-- assinatura cancelada pelo admin e depois renovada por pagamento: reativa e limpa cancelled_at
update public.subscriptions set status = 'cancelled', cancelled_at = now() where company_id = (select c2 from ctx);
update public.company_entitlements set status = 'cancelled' where company_id = (select c2 from ctx);
update public.subscription_payments set status = 'cancelled' where company_id = (select c2 from ctx) and status = 'pending';
select pg_temp.chk('lifecycle', 'compra após cancelamento da assinatura', $q$select pg_temp.cl((select c2 from ctx), (select monthly from ctx), 89)$q$, 'OK=true,false,pending');
update public.subscription_payments set provider_transaction_id = 'tx_h_4' where company_id = (select c2 from ctx) and status = 'pending';
select pg_temp.chk('lifecycle', 'pagamento reativa a assinatura cancelada (active, cancelled_at limpo)', $q$select pg_temp.cf((select id from public.subscription_payments where company_id = (select c2 from ctx) and status = 'pending'), 'paid', 'tx_h_4:COMPLETED', 89.00)$q$, 'OK=true,paid,false,false,-');
select pg_temp.chk('lifecycle', 'assinatura voltou a active e cancelled_at é nulo', $q$select (status::text || ',' || (cancelled_at is null)::text) from public.subscriptions where company_id = (select c2 from ctx)$q$, 'OK=active,true');

-- ============================================================ F) ATOMICIDADE: falha na atualização da assinatura desfaz TUDO
create or replace function pg_temp.boom() returns trigger language plpgsql as $$ begin raise exception 'FALHA SIMULADA NO ENTITLEMENT'; end $$;
insert into public.subscription_payments (company_id, plan_id, provider, status, amount, provider_transaction_id)
  select (select c3 from ctx), (select monthly from ctx), 'evopay', 'pending', 89, 'tx_h_5';
create temp table p5 as select id from public.subscription_payments where company_id = (select c3 from ctx);
create trigger boom_trg before insert or update on public.company_entitlements for each row execute function pg_temp.boom();
do $$
declare caught text := 'nao_falhou';
begin
  begin
    perform pg_temp.cf((select id from p5), 'paid', 'tx_h_5:COMPLETED', 89.00);
  exception when others then caught := sqlerrm; end;
  insert into r(grp, label, expect, got, ok) values ('atomic', 'falha ao gravar entitlements propaga o erro (nada é engolido)', 'ERR=FALHA SIMULADA', 'OK=' || caught, caught like '%FALHA SIMULADA%');
end $$;
drop trigger boom_trg on public.company_entitlements;
select pg_temp.chk('atomic', 'após a falha: pagamento continua pending (não ficou "pago sem acesso")', $q$select status::text from public.subscription_payments where id = (select id from p5)$q$, 'OK=pending');
select pg_temp.chk('atomic', 'após a falha: nenhuma assinatura foi criada', $q$select count(*)::text from public.subscriptions where company_id = (select c3 from ctx)$q$, 'OK=0');
select pg_temp.chk('atomic', 'após a falha: o evento NÃO ficou gravado como processado (retentativa possível)', $q$select count(*)::text from public.payment_events where event_id = 'tx_h_5:COMPLETED'$q$, 'OK=0');
select pg_temp.chk('atomic', 'retentativa depois de corrigida a causa: concede', $q$select pg_temp.cf((select id from p5), 'paid', 'tx_h_5:COMPLETED', 89.00)$q$, 'OK=true,paid,false,false,-');

-- ============================================================ G) PERMISSÕES
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"x_bill","role":"authenticated"}', true);
select pg_temp.chk('perms', 'authenticated NÃO executa confirm_subscription_payment', $q$select count(*)::text from public.confirm_subscription_payment((select id from p1), 'paid', null, 'tx_hack', 'x', '{}'::jsonb, 89)$q$, 'ERR=permission denied');
select pg_temp.chk('perms', 'authenticated NÃO executa claim_subscription_payment', $q$select count(*)::text from public.claim_subscription_payment((select c1 from ctx), (select monthly from ctx), 89)$q$, 'ERR=permission denied');
select pg_temp.chk('perms', 'authenticated NÃO insere pagamento', $q$insert into public.subscription_payments(company_id, plan_id, provider, status, amount) values ((select c1 from ctx), (select monthly from ctx), 'evopay', 'paid', 1) returning 'x'$q$, 'DENIED_OR_EMPTY');
select pg_temp.chk('perms', 'authenticated NÃO altera pagamento', $q$with u as (update public.subscription_payments set status = 'paid' returning 1) select count(*)::text from u$q$, 'DENIED_OR_EMPTY');
select pg_temp.chk('perms', 'authenticated NÃO lê payment_events', $q$select count(*)::text from public.payment_events$q$, 'DENIED_OR_EMPTY');
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select pg_temp.chk('perms', 'anon NÃO executa confirm_subscription_payment', $q$select count(*)::text from public.confirm_subscription_payment((select id from p1), 'paid', null, 'tx_hack2', 'x', '{}'::jsonb, 89)$q$, 'ERR=permission denied');
select pg_temp.chk('perms', 'anon NÃO executa claim_subscription_payment', $q$select count(*)::text from public.claim_subscription_payment((select c1 from ctx), (select monthly from ctx), 89)$q$, 'ERR=permission denied');
select pg_temp.chk('perms', 'anon NÃO vê pagamentos', $q$select count(*)::text from public.subscription_payments$q$, 'DENIED_OR_EMPTY');
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- ============================================================ H) DIAGNÓSTICOS (visão do super_admin)
update public.profiles set clerk_user_id = 'bill_super' where user_id = '2068cbe0-ade1-41f6-8301-ddbe2cfcb1fb';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"bill_super","role":"authenticated"}', true);
select pg_temp.chk('diag', 'platform_diagnostics tem 13 verificações', $q$select count(*)::text from public.platform_diagnostics()$q$, 'OK=13');
select pg_temp.chk('diag', 'estorno com acesso ativo aparece como alerta', $q$select (affected >= 1)::text from public.platform_diagnostics() where check_key = 'refunded_with_access'$q$, 'OK=true');
select pg_temp.chk('diag', 'evento rejeitado não processado só alerta depois de 1 hora (hoje: 0)', $q$select affected::text from public.platform_diagnostics() where check_key = 'payment_events_unprocessed'$q$, 'OK=0');
reset role;

do $result$
declare v jsonb;
begin
  select jsonb_build_object('total', count(*), 'pass', count(*) filter (where ok), 'fail', count(*) filter (where not ok),
    'por_grupo', (select jsonb_object_agg(grp, jsonb_build_object('pass', p, 'fail', f)) from (select grp, count(*) filter (where ok) p, count(*) filter (where not ok) f from r group by grp) g),
    'falhas', coalesce((select jsonb_agg(jsonb_build_object('grupo', grp, 'teste', label, 'esperado', expect, 'obtido', got) order by n) from r where not ok), '[]'::jsonb)) into v from r;
  raise exception 'RESULT: %', v::text;
end $result$;
