-- =============================================================================
-- Bateria SQL — Relatórios, resumo do período (20261126160000_relatorios_resumo). Rodar em uma CÓPIA do banco.
-- Transação que termina em erro proposital (RESULT: ...): nada persiste.
-- =============================================================================
begin;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

insert into public.profiles (user_id, clerk_user_id, full_name, email, role, status) values
  ('abababab-0000-0000-0000-000000000001', 'rl_owner', 'RL Dono', 'rl-owner@example.invalid', 'user', 'active'),
  ('abababab-0000-0000-0000-000000000002', 'rl_outro', 'RL Outro', 'rl-outro@example.invalid', 'user', 'active'),
  ('abababab-0000-0000-0000-000000000003', 'rl_func', 'RL Func', 'rl-func@example.invalid', 'user', 'active');
insert into public.companies (id, name, business_type, status) values
  ('abababab-1000-0000-0000-000000000001', '[RLTEST] A', 'other', 'active'),
  ('abababab-1000-0000-0000-000000000002', '[RLTEST] B', 'other', 'active');
alter table public.company_members disable trigger company_members_seat_limit;
insert into public.company_members (company_id, user_id, role) values
  ('abababab-1000-0000-0000-000000000001', 'abababab-0000-0000-0000-000000000001', 'owner'),
  ('abababab-1000-0000-0000-000000000002', 'abababab-0000-0000-0000-000000000002', 'owner'),
  ('abababab-1000-0000-0000-000000000001', 'abababab-0000-0000-0000-000000000003', 'employee');
insert into public.subscriptions (company_id, plan_id, status, starts_at, expires_at, provider)
  select c, (select id from public.plans order by created_at limit 1), 'active', now(), now() + interval '30 days', 'manual'
    from unnest(array['abababab-1000-0000-0000-000000000001', 'abababab-1000-0000-0000-000000000002']::uuid[]) c;

-- Período usado nas conferências: março de 2020 (fora de qualquer dado real).
-- V1: 1º/03 00:30 de São Paulo (entra). V2: 29/02 23:30 de São Paulo (não entra, embora seja março em UTC).
-- V3: concluída sem pagar. V4: cancelada. V5: rascunho com pagamento (entra só nos recebimentos). V6: outra empresa.
insert into public.sales (id, company_id, user_id, status, subtotal, total_amount, total_cost, sold_at, completed_at) values
  ('abababab-5000-0000-0000-000000000001', 'abababab-1000-0000-0000-000000000001', 'abababab-0000-0000-0000-000000000001', 'draft', 100, 100, 40, '2020-03-01 03:30+00', null),
  ('abababab-5000-0000-0000-000000000002', 'abababab-1000-0000-0000-000000000001', 'abababab-0000-0000-0000-000000000001', 'draft', 70, 70, 10, '2020-03-01 02:30+00', null),
  ('abababab-5000-0000-0000-000000000003', 'abababab-1000-0000-0000-000000000001', 'abababab-0000-0000-0000-000000000001', 'draft', 50, 50, 5, '2020-03-10 15:00+00', null),
  ('abababab-5000-0000-0000-000000000004', 'abababab-1000-0000-0000-000000000001', 'abababab-0000-0000-0000-000000000001', 'draft', 999, 999, 1, '2020-03-11 15:00+00', null),
  ('abababab-5000-0000-0000-000000000005', 'abababab-1000-0000-0000-000000000001', 'abababab-0000-0000-0000-000000000001', 'draft', 30, 30, 0, '2020-03-12 15:00+00', null),
  ('abababab-5000-0000-0000-000000000006', 'abababab-1000-0000-0000-000000000002', 'abababab-0000-0000-0000-000000000002', 'draft', 500, 500, 0, '2020-03-05 15:00+00', null);
insert into public.products (id, company_id, name, cost_price, sale_price, stock_quantity, status) values
  ('abababab-3000-0000-0000-000000000001', 'abababab-1000-0000-0000-000000000001', 'RL Produto', 1, 16, 5, 'active'),
  ('abababab-3000-0000-0000-000000000002', 'abababab-1000-0000-0000-000000000002', 'RL Alheio', 1, 500, 5, 'active');
insert into public.services (id, company_id, name) values
  ('abababab-4000-0000-0000-000000000001', 'abababab-1000-0000-0000-000000000001', 'RL Serviço');
insert into public.sale_items (company_id, sale_id, item_type, product_id, service_id, description, quantity, unit_price, subtotal, total_amount) values
  ('abababab-1000-0000-0000-000000000001', 'abababab-5000-0000-0000-000000000001', 'service', null, 'abababab-4000-0000-0000-000000000001', 'RL Serviço', 1, 60, 60, 60),
  ('abababab-1000-0000-0000-000000000001', 'abababab-5000-0000-0000-000000000001', 'product', 'abababab-3000-0000-0000-000000000001', null, 'RL Produto', 2.5, 16, 40, 40),
  ('abababab-1000-0000-0000-000000000001', 'abababab-5000-0000-0000-000000000002', 'product', 'abababab-3000-0000-0000-000000000001', null, 'RL Produto', 1, 70, 70, 70),
  ('abababab-1000-0000-0000-000000000001', 'abababab-5000-0000-0000-000000000003', 'product', 'abababab-3000-0000-0000-000000000001', null, 'RL Produto', 1, 50, 50, 50),
  ('abababab-1000-0000-0000-000000000001', 'abababab-5000-0000-0000-000000000004', 'product', 'abababab-3000-0000-0000-000000000001', null, 'RL Cancelado', 1, 999, 999, 999),
  ('abababab-1000-0000-0000-000000000001', 'abababab-5000-0000-0000-000000000005', 'product', 'abababab-3000-0000-0000-000000000001', null, 'RL Rascunho', 1, 30, 30, 30),
  ('abababab-1000-0000-0000-000000000002', 'abababab-5000-0000-0000-000000000006', 'product', 'abababab-3000-0000-0000-000000000002', null, 'RL Alheio', 1, 500, 500, 500);
update public.sales set status = 'completed', completed_at = sold_at
 where id in ('abababab-5000-0000-0000-000000000001', 'abababab-5000-0000-0000-000000000002', 'abababab-5000-0000-0000-000000000003', 'abababab-5000-0000-0000-000000000006');
update public.sales set status = 'cancelled', cancelled_at = sold_at, cancelled_reason = 'teste' where id = 'abababab-5000-0000-0000-000000000004';

insert into public.sale_payments (id, company_id, sale_id, method, amount, status, paid_at) values
  ('abababab-6000-0000-0000-000000000001', 'abababab-1000-0000-0000-000000000001', 'abababab-5000-0000-0000-000000000001', 'pix', 100, 'paid', '2020-03-01 04:00+00'),
  -- venda de fevereiro recebida em março: conta em março
  ('abababab-6000-0000-0000-000000000002', 'abababab-1000-0000-0000-000000000001', 'abababab-5000-0000-0000-000000000002', 'cash', 70, 'paid', '2020-03-02 15:00+00'),
  ('abababab-6000-0000-0000-000000000003', 'abababab-1000-0000-0000-000000000001', 'abababab-5000-0000-0000-000000000003', 'cash', 20, 'paid', '2020-03-10 15:00+00'),
  ('abababab-6000-0000-0000-000000000005', 'abababab-1000-0000-0000-000000000001', 'abababab-5000-0000-0000-000000000005', 'pix', 15, 'paid', '2020-03-12 15:00+00'),
  ('abababab-6000-0000-0000-000000000006', 'abababab-1000-0000-0000-000000000002', 'abababab-5000-0000-0000-000000000006', 'pix', 500, 'paid', '2020-03-05 15:00+00');
-- estorno: o gatilho lança a saída na data de hoje; aqui ela é levada para março para a conferência
update public.sale_payments set status = 'refunded' where id = 'abababab-6000-0000-0000-000000000003';
update public.financial_entries set occurred_on = '2020-03-15'
 where source_type = 'sale_payment_refund' and source_id = 'abababab-6000-0000-0000-000000000003';

insert into public.financial_entries (company_id, direction, status, description, amount, occurred_on) values
  ('abababab-1000-0000-0000-000000000001', 'expense', 'posted', 'RL despesa', 25, '2020-03-31'),
  ('abababab-1000-0000-0000-000000000001', 'income', 'posted', 'RL outra receita', 8, '2020-03-01'),
  ('abababab-1000-0000-0000-000000000001', 'expense', 'cancelled', 'RL cancelada', 777, '2020-03-05'),
  ('abababab-1000-0000-0000-000000000001', 'expense', 'posted', 'RL abril', 333, '2020-04-01');

create temp table r (n serial, label text, ok boolean, got text);
grant all on r to authenticated, anon;
grant all on sequence r_n_seq to authenticated, anon;
create or replace function pg_temp.chk(l text, q text, e text) returns void language plpgsql as $$
declare v text; got text;
begin
  begin execute q into v; got := 'OK=' || coalesce(v, 'null');
  exception when others then got := 'ERR=' || sqlerrm; end;
  insert into r(label, got, ok) values (l, left(got, 200), case when e like 'ERR=%' then got like 'ERR=%' and position(substr(e, 5) in got) > 0 else got = e end);
end $$;
grant execute on function pg_temp.chk(text, text, text) to authenticated, anon;
create or replace function pg_temp.resumo() returns jsonb language sql as $$
  select public.report_summary('abababab-1000-0000-0000-000000000001', '2020-03-01 03:00+00', '2020-04-01 02:59:59.999+00', '2020-04-01 02:59:59.999+00'); $$;
grant execute on function pg_temp.resumo() to authenticated, anon;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"rl_owner","role":"authenticated"}', true);

select pg_temp.chk('faturamento sem cancelada, rascunho, fevereiro e outra empresa', $q$select (pg_temp.resumo()->>'revenue')$q$, 'OK=150.00');
select pg_temp.chk('custo', $q$select (pg_temp.resumo()->>'cost_of_goods')$q$, 'OK=45.00');
select pg_temp.chk('vendas concluídas', $q$select (pg_temp.resumo()->>'completed_sales')$q$, 'OK=2');
select pg_temp.chk('dias no fuso de São Paulo', $q$select string_agg(d->>'date' || ':' || (d->>'value'), ' ') from jsonb_array_elements(pg_temp.resumo()->'days') d$q$, 'OK=2020-03-01:100.00 2020-03-10:50.00');
select pg_temp.chk('itens somados e ordenados', $q$select string_agg((i->>'description') || ':' || (i->>'quantity') || ':' || (i->>'revenue'), ' | ') from jsonb_array_elements(pg_temp.resumo()->'items') i$q$, 'OK=RL Produto:3.500:90.00 | RL Serviço:1.000:60.00');
select pg_temp.chk('recebimentos pela data do recebimento, com estorno', $q$select string_agg((p->>'method') || ':' || (p->>'received') || '-' || (p->>'refunded'), ' ' order by p->>'method') from jsonb_array_elements(pg_temp.resumo()->'payments') p$q$, 'OK=cash:90.00-20.00 pix:115.00-0');
select pg_temp.chk('despesa e outra receita lançadas à mão', $q$select string_agg((e->>'direction') || ':' || (e->>'amount'), ' ' order by e->>'direction') from jsonb_array_elements(pg_temp.resumo()->'entries') e where e->>'source_type' is null$q$, 'OK=expense:25.00 income:8.00');
select pg_temp.chk('a receber (posição atual)', $q$select pg_temp.resumo()->>'receivable'$q$, 'OK=50.00');
select pg_temp.chk('a receber de dias anteriores', $q$select pg_temp.resumo()->>'receivable_overdue'$q$, 'OK=1');
select pg_temp.chk('período vazio vem zerado', $q$select (r->>'revenue') || ' ' || (r->'days')::text || ' ' || (r->'items')::text || ' ' || (r->'appointments')::text from (select public.report_summary('abababab-1000-0000-0000-000000000001', '2019-01-01', '2019-01-02', '2019-01-02') r) x$q$, 'OK=0 [] [] {}');

select set_config('request.jwt.claims', '{"sub":"rl_outro","role":"authenticated"}', true);
select pg_temp.chk('outra empresa não enxerga nada', $q$select (r->>'revenue') || ' ' || (r->>'receivable') || ' ' || (r->'payments')::text from (select pg_temp.resumo() r) x$q$, 'OK=0 0 []');

select set_config('request.jwt.claims', '{"sub":"rl_func","role":"authenticated"}', true);
select pg_temp.chk('funcionário não recebe lançamentos do Financeiro', $q$select (r->'payments')::text || ' ' || (r->'entries')::text from (select pg_temp.resumo() r) x$q$, 'OK=[] []');

reset role;
set local role anon;
select pg_temp.chk('visitante não executa', $q$select pg_temp.resumo()::text$q$, 'ERR=permission denied');
reset role;

do $$
declare bad text;
begin
  select string_agg(n || ' ' || label || ' => ' || got, E'\n' order by n) filter (where not ok) into bad from r;
  raise exception 'RESULT: % de % ok%', (select count(*) from r where ok), (select count(*) from r), coalesce(E'\nFALHAS:\n' || bad, '');
end $$;
rollback;
