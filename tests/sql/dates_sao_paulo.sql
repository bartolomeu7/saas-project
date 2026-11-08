-- =============================================================================
-- Bateria SQL — datas de negócio no calendário de São Paulo (20261108140000_dates_sao_paulo).
-- Roda SOMENTE no projeto TEST. Transação que termina em erro proposital (RESULT: ...): nada persiste.
-- Antes da migração os casos de "dia de São Paulo" FALHAM (provam o defeito); depois passam.
-- =============================================================================
begin;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

insert into public.profiles (user_id, clerk_user_id, full_name, email, role, status) values
  ('ffffffff-0000-0000-0000-0000000000b1', 'dt_owner', 'DT Dono', 'dt-owner@example.invalid', 'user', 'active');
insert into public.companies (id, name, business_type, status) values
  ('ffffffff-1000-0000-0000-0000000000b1', '[DTTEST] Empresa', 'bakery', 'active');
alter table public.company_members disable trigger company_members_seat_limit;
insert into public.company_members (company_id, user_id, role) values
  ('ffffffff-1000-0000-0000-0000000000b1', 'ffffffff-0000-0000-0000-0000000000b1', 'owner');
insert into public.subscriptions (company_id, plan_id, status, starts_at, expires_at, provider)
  select 'ffffffff-1000-0000-0000-0000000000b1', (select id from public.plans order by created_at limit 1), 'active', now(), now() + interval '30 days', 'manual';

insert into public.products (id, company_id, name, sale_price, cost_price) values
  ('ffffffff-2000-0000-0000-0000000000b1', 'ffffffff-1000-0000-0000-0000000000b1', 'DT Produto', 50, 20);
insert into public.suppliers (id, company_id, name) values
  ('ffffffff-6000-0000-0000-0000000000b1', 'ffffffff-1000-0000-0000-0000000000b1', 'DT Fornecedor');

create temp table r (n serial, grp text, label text, expect text, got text, ok boolean);
grant all on r to authenticated, anon;
grant all on sequence r_n_seq to authenticated, anon;
create or replace function pg_temp.chk(g text, l text, q text, e text) returns void language plpgsql as $$
declare v text; got text; pass boolean;
begin
  begin execute q into v; got := 'OK=' || coalesce(v, 'null');
  exception when others then got := 'ERR=' || sqlerrm; end;
  pass := case
    when e like 'OK=%' then got = e
    when e like 'ERR=%' then got like 'ERR=%' and position(substr(e, 5) in got) > 0
    else false end;
  insert into r(grp, label, expect, got, ok) values (g, l, e, left(got, 200), pass);
end $$;

-- ================================================= recebimento de venda às 22h30 em São Paulo
insert into public.sales (id, company_id, user_id, status, subtotal, total_amount, discount_amount)
  values ('ffffffff-4000-0000-0000-0000000000b1', 'ffffffff-1000-0000-0000-0000000000b1', 'ffffffff-0000-0000-0000-0000000000b1', 'draft', 100, 100, 0);

-- 08/11 22:30 em São Paulo = 09/11 01:30 UTC
insert into public.sale_payments (id, company_id, sale_id, method, amount, status, paid_at)
  values ('ffffffff-5000-0000-0000-0000000000b1', 'ffffffff-1000-0000-0000-0000000000b1', 'ffffffff-4000-0000-0000-0000000000b1', 'pix', 40, 'paid', '2026-11-09 01:30:00+00');
select pg_temp.chk('recebimento', 'pago às 22:30 de São Paulo (01:30 UTC do dia seguinte) fica no dia 08/11, não 09/11',
  $q$select occurred_on::text from public.financial_entries where source_type = 'sale_payment' and source_id = 'ffffffff-5000-0000-0000-0000000000b1'$q$, 'OK=2026-11-08');

-- 12:00 UTC = 09:00 em São Paulo: mesmo dia nos dois calendários
insert into public.sale_payments (id, company_id, sale_id, method, amount, status, paid_at)
  values ('ffffffff-5000-0000-0000-0000000000b2', 'ffffffff-1000-0000-0000-0000000000b1', 'ffffffff-4000-0000-0000-0000000000b1', 'pix', 10, 'paid', '2026-11-08 12:00:00+00');
select pg_temp.chk('recebimento', 'pago às 09:00 de São Paulo continua em 08/11',
  $q$select occurred_on::text from public.financial_entries where source_type = 'sale_payment' and source_id = 'ffffffff-5000-0000-0000-0000000000b2'$q$, 'OK=2026-11-08');

-- 02:59 UTC = 23:59 de 07/11 em São Paulo
insert into public.sale_payments (id, company_id, sale_id, method, amount, status, paid_at)
  values ('ffffffff-5000-0000-0000-0000000000b3', 'ffffffff-1000-0000-0000-0000000000b1', 'ffffffff-4000-0000-0000-0000000000b1', 'pix', 5, 'paid', '2026-11-08 02:59:00+00');
select pg_temp.chk('recebimento', 'pago às 23:59 de 07/11 em São Paulo (02:59 UTC de 08/11) fica em 07/11',
  $q$select occurred_on::text from public.financial_entries where source_type = 'sale_payment' and source_id = 'ffffffff-5000-0000-0000-0000000000b3'$q$, 'OK=2026-11-07');

-- estorno: usa updated_at (agora) → dia de hoje em São Paulo
update public.sale_payments set status = 'refunded' where id = 'ffffffff-5000-0000-0000-0000000000b2';
select pg_temp.chk('estorno', 'estorno do pagamento gravado com a data de hoje em São Paulo',
  $q$select (occurred_on = (now() at time zone 'America/Sao_Paulo')::date)::text from public.financial_entries where source_type = 'sale_payment_refund' and source_id = 'ffffffff-5000-0000-0000-0000000000b2'$q$, 'OK=true');

-- ================================================= helper e padrões de coluna
select pg_temp.chk('helper', 'today_sao_paulo() = data de hoje em São Paulo',
  $q$select (public.today_sao_paulo() = (now() at time zone 'America/Sao_Paulo')::date)::text$q$, 'OK=true');
select pg_temp.chk('padrao', 'occurred_on tem padrão today_sao_paulo()',
  $q$select (column_default like '%today_sao_paulo%')::text from information_schema.columns where table_schema = 'public' and table_name = 'financial_entries' and column_name = 'occurred_on'$q$, 'OK=true');
select pg_temp.chk('padrao', 'issue_date da conta a pagar tem padrão today_sao_paulo()',
  $q$select (column_default like '%today_sao_paulo%')::text from information_schema.columns where table_schema = 'public' and table_name = 'accounts_payable' and column_name = 'issue_date'$q$, 'OK=true');
select pg_temp.chk('padrao', 'today_sao_paulo() não é executável por anon',
  $q$select has_function_privilege('anon', 'public.today_sao_paulo()', 'execute')::text$q$, 'OK=false');

-- ================================================= funções chamadas pelo dono
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"dt_owner","role":"authenticated"}', true);

select pg_temp.chk('lancamento', 'lançamento sem data usa hoje em São Paulo',
  $q$select ((public.create_financial_entry('income', 'DT receita sem data', 10, null, 'pix')).occurred_on = public.today_sao_paulo())::text$q$, 'OK=true');

select pg_temp.chk('compra', 'pedido de compra: número PC-AAAAMMDD com a data de São Paulo',
  $q$select (((public.create_purchase_order('ffffffff-6000-0000-0000-0000000000b1',
        '[{"product_id":"ffffffff-2000-0000-0000-0000000000b1","quantity":2,"unit_cost":7.5}]'::jsonb)).order_number)
        like 'PC-' || to_char(public.today_sao_paulo(), 'YYYYMMDD') || '-%')::text$q$, 'OK=true');

select pg_temp.chk('compra', 'recebimento da compra: emissão da conta a pagar = hoje em São Paulo',
  $q$select (public.receive_purchase_order(
        (select id from public.purchase_orders where company_id = 'ffffffff-1000-0000-0000-0000000000b1' limit 1),
        jsonb_build_array(jsonb_build_object('purchase_order_item_id',
          (select id from public.purchase_order_items where company_id = 'ffffffff-1000-0000-0000-0000000000b1' limit 1), 'quantity', 2)),
        null)).total_amount::text$q$, 'OK=15.00');
select pg_temp.chk('compra', 'conta a pagar nasce com issue_date = hoje em São Paulo',
  $q$select (issue_date = public.today_sao_paulo())::text from public.accounts_payable where company_id = 'ffffffff-1000-0000-0000-0000000000b1'$q$, 'OK=true');

select pg_temp.chk('pagamento', 'pay_accounts_payable sem informar a data funciona (padrão = hoje em São Paulo)',
  $q$select ((public.pay_accounts_payable((select id from public.accounts_payable where company_id = 'ffffffff-1000-0000-0000-0000000000b1' limit 1), 5, 'pix')).status)::text$q$, 'OK=partial');
select pg_temp.chk('pagamento', 'o lançamento do pagamento ficou com a data de hoje em São Paulo',
  $q$select (occurred_on = public.today_sao_paulo())::text from public.financial_entries where company_id = 'ffffffff-1000-0000-0000-0000000000b1' and source_type = 'accounts_payable_payment'$q$, 'OK=true');
select pg_temp.chk('pagamento', 'a data informada pelo usuário continua valendo',
  $q$select ((public.pay_accounts_payable((select id from public.accounts_payable where company_id = 'ffffffff-1000-0000-0000-0000000000b1' limit 1), 2, 'pix', date '2026-10-15')).status)::text$q$, 'OK=partial');
select pg_temp.chk('pagamento', 'lançamento com data informada = 15/10 (inalterado)',
  $q$select count(*)::text from public.financial_entries where company_id = 'ffffffff-1000-0000-0000-0000000000b1' and source_type = 'accounts_payable_payment' and occurred_on = date '2026-10-15'$q$, 'OK=1');

reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- ================================================= correção dos registros antigos (mesmo UPDATE da migração)
insert into public.financial_entries (company_id, direction, status, description, amount, occurred_on, paid_at, method, source_type, source_id)
  values ('ffffffff-1000-0000-0000-0000000000b1', 'income', 'posted', 'DT antigo automático', 10, '2026-11-09', '2026-11-09 01:30:00+00', 'pix', 'sale_payment', gen_random_uuid());
insert into public.financial_entries (company_id, direction, status, description, amount, occurred_on, paid_at, method)
  values ('ffffffff-1000-0000-0000-0000000000b1', 'income', 'posted', 'DT digitado pelo usuário', 10, '2026-11-09', '2026-11-09 01:30:00+00', 'pix');

update public.financial_entries
set occurred_on = (paid_at at time zone 'America/Sao_Paulo')::date
where source_type in ('sale_payment', 'sale_payment_refund')
  and paid_at is not null
  and occurred_on <> (paid_at at time zone 'America/Sao_Paulo')::date;

select pg_temp.chk('correcao', 'registro automático com dia de Greenwich vira o dia de São Paulo',
  $q$select occurred_on::text from public.financial_entries where description = 'DT antigo automático'$q$, 'OK=2026-11-08');
select pg_temp.chk('correcao', 'lançamento digitado pelo usuário NÃO é alterado',
  $q$select occurred_on::text from public.financial_entries where description = 'DT digitado pelo usuário'$q$, 'OK=2026-11-09');

do $result$
declare v jsonb;
begin
  select jsonb_build_object(
    'total', count(*),
    'pass', count(*) filter (where ok),
    'fail', count(*) filter (where not ok),
    'falhas', coalesce((select jsonb_agg(jsonb_build_object('grupo', grp, 'teste', label, 'esperado', expect, 'obtido', got) order by n) from r where not ok), '[]'::jsonb)
  ) into v from r;
  raise exception 'RESULT: %', v::text;
end
$result$;
