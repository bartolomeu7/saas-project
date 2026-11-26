-- =============================================================================
-- Bateria SQL — Relatórios, aba Vendas (20261126180000_relatorios_vendas). Rodar em uma CÓPIA do banco.
-- Transação que termina em erro proposital (RESULT: ...): nada persiste.
-- =============================================================================
begin;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

insert into public.profiles (user_id, clerk_user_id, full_name, email, role, status) values
  ('acacacac-0000-0000-0000-000000000001', 'rv_owner', 'RV Dono', 'rv-owner@example.invalid', 'user', 'active'),
  ('acacacac-0000-0000-0000-000000000002', 'rv_func', 'RV Func', 'rv-func@example.invalid', 'user', 'active'),
  ('acacacac-0000-0000-0000-000000000003', 'rv_outro', 'RV Outro', 'rv-outro@example.invalid', 'user', 'active');
insert into public.companies (id, name, business_type, status) values
  ('acacacac-1000-0000-0000-000000000001', '[RVTEST] A', 'other', 'active'),
  ('acacacac-1000-0000-0000-000000000002', '[RVTEST] B', 'other', 'active');
alter table public.company_members disable trigger company_members_seat_limit;
insert into public.company_members (company_id, user_id, role) values
  ('acacacac-1000-0000-0000-000000000001', 'acacacac-0000-0000-0000-000000000001', 'owner'),
  ('acacacac-1000-0000-0000-000000000001', 'acacacac-0000-0000-0000-000000000002', 'employee'),
  ('acacacac-1000-0000-0000-000000000002', 'acacacac-0000-0000-0000-000000000003', 'owner');
insert into public.subscriptions (company_id, plan_id, status, starts_at, expires_at, provider)
  select c, (select id from public.plans order by created_at limit 1), 'active', now(), now() + interval '30 days', 'manual'
    from unnest(array['acacacac-1000-0000-0000-000000000001', 'acacacac-1000-0000-0000-000000000002']::uuid[]) c;
insert into public.customers (id, company_id, name) values
  ('acacacac-2000-0000-0000-000000000001', 'acacacac-1000-0000-0000-000000000001', 'RV Cliente');
insert into public.products (id, company_id, name, cost_price, sale_price, stock_quantity, status) values
  ('acacacac-3000-0000-0000-000000000001', 'acacacac-1000-0000-0000-000000000001', 'RV Shampoo', 4, 10, 50, 'active'),
  ('acacacac-3000-0000-0000-000000000002', 'acacacac-1000-0000-0000-000000000001', 'RV Brinde', 0, 10, 50, 'active');

-- V1: do dono, com cliente, 2 shampoos (custo 4) + 1 item sem custo, desconto de 5. V2: do funcionário, sem cliente.
-- V3: cancelada (não conta).
insert into public.sales (id, company_id, user_id, customer_id, status, subtotal, discount_amount, total_amount, total_cost, sold_at) values
  ('acacacac-5000-0000-0000-000000000001', 'acacacac-1000-0000-0000-000000000001', 'acacacac-0000-0000-0000-000000000001', 'acacacac-2000-0000-0000-000000000001', 'draft', 30, 5, 25, 8, '2018-01-10 15:00+00'),
  ('acacacac-5000-0000-0000-000000000002', 'acacacac-1000-0000-0000-000000000001', 'acacacac-0000-0000-0000-000000000002', null, 'draft', 10, 0, 10, 4, '2018-01-11 15:00+00'),
  ('acacacac-5000-0000-0000-000000000003', 'acacacac-1000-0000-0000-000000000001', 'acacacac-0000-0000-0000-000000000001', null, 'draft', 99, 0, 99, 1, '2018-01-12 15:00+00');
insert into public.sale_items (company_id, sale_id, item_type, product_id, description, quantity, unit_price, unit_cost, subtotal, total_amount) values
  ('acacacac-1000-0000-0000-000000000001', 'acacacac-5000-0000-0000-000000000001', 'product', 'acacacac-3000-0000-0000-000000000001', 'RV Shampoo', 2, 10, 4, 20, 20),
  ('acacacac-1000-0000-0000-000000000001', 'acacacac-5000-0000-0000-000000000001', 'product', 'acacacac-3000-0000-0000-000000000002', 'RV Brinde 100%', 1, 10, 0, 10, 10),
  ('acacacac-1000-0000-0000-000000000001', 'acacacac-5000-0000-0000-000000000002', 'product', 'acacacac-3000-0000-0000-000000000001', 'RV Shampoo', 1, 10, 4, 10, 10),
  ('acacacac-1000-0000-0000-000000000001', 'acacacac-5000-0000-0000-000000000003', 'product', 'acacacac-3000-0000-0000-000000000001', 'RV Shampoo', 1, 99, 1, 99, 99);
update public.sales set status = 'completed', completed_at = sold_at
 where id in ('acacacac-5000-0000-0000-000000000001', 'acacacac-5000-0000-0000-000000000002');
update public.sales set status = 'cancelled', cancelled_at = sold_at, cancelled_reason = 'teste' where id = 'acacacac-5000-0000-0000-000000000003';

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
create or replace function pg_temp.v(cliente uuid default null, sem boolean default false, quem uuid default null, item text default null) returns jsonb language sql as $$
  select public.report_sales('acacacac-1000-0000-0000-000000000001', '2018-01-01 03:00+00', '2018-02-01 02:59:59.999+00', cliente, sem, quem, item); $$;
grant execute on function pg_temp.v(uuid, boolean, uuid, text) to authenticated, anon;
create or replace function pg_temp.totais(r jsonb) returns text language sql as $$
  select concat_ws(' ', r->>'sales', r->>'revenue', r->>'cost', r->>'discounts'); $$;
grant execute on function pg_temp.totais(jsonb) to authenticated, anon;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"rv_owner","role":"authenticated"}', true);

select pg_temp.chk('totais com desconto, sem cancelada', $q$select pg_temp.totais(pg_temp.v())$q$, 'OK=2 35.00 12.00 5.00');
select pg_temp.chk('mesmo faturamento e custo do resumo geral', $q$select (s->>'revenue') || ' ' || (s->>'cost_of_goods') from (select public.report_summary('acacacac-1000-0000-0000-000000000001', '2018-01-01 03:00+00', '2018-02-01 02:59:59.999+00', '2018-02-01 02:59:59.999+00') s) x$q$, 'OK=35.00 12.00');
select pg_temp.chk('itens com custo e marcação de sem custo', $q$select string_agg(concat_ws(':', i->>'description', i->>'quantity', i->>'revenue', i->>'cost', i->>'uncosted_quantity', i->>'uncosted_revenue'), ' | ') from jsonb_array_elements(pg_temp.v()->'items') i$q$, 'OK=RV Shampoo:3.000:30.00:12.00:0:0 | RV Brinde 100%:1.000:10.00:0.00:1.000:10.00');
select pg_temp.chk('por quem registrou', $q$select string_agg(concat_ws(':', right(s->>'user_id', 1), s->>'sales', s->>'revenue', s->>'cost'), ' ') from jsonb_array_elements(pg_temp.v()->'sellers') s$q$, 'OK=1:1:25.00:8.00 2:1:10.00:4.00');
select pg_temp.chk('filtro por cliente', $q$select pg_temp.totais(pg_temp.v('acacacac-2000-0000-0000-000000000001'))$q$, 'OK=1 25.00 8.00 5.00');
select pg_temp.chk('só vendas sem cliente', $q$select pg_temp.totais(pg_temp.v(null, true))$q$, 'OK=1 10.00 4.00 0.00');
select pg_temp.chk('filtro por quem registrou', $q$select pg_temp.totais(pg_temp.v(null, false, 'acacacac-0000-0000-0000-000000000002'))$q$, 'OK=1 10.00 4.00 0.00');
select pg_temp.chk('filtro por item soma só o item, sem desconto', $q$select pg_temp.totais(pg_temp.v(null, false, null, '  SHAMP '))$q$, 'OK=2 30.00 12.00 0');
select pg_temp.chk('filtro de item trata % como texto', $q$select pg_temp.totais(pg_temp.v(null, false, null, '100%'))$q$, 'OK=1 10.00 0.00 0');
select pg_temp.chk('item que não existe', $q$select pg_temp.totais(pg_temp.v(null, false, null, 'zzz')) || ' ' || (pg_temp.v(null, false, null, 'zzz')->'items')::text$q$, 'OK=0 0 0 0 []');
select pg_temp.chk('opções de cliente não dependem do filtro', $q$select string_agg(c->>'name', ',') from jsonb_array_elements(pg_temp.v(null, true)->'customers') c$q$, 'OK=RV Cliente');

select set_config('request.jwt.claims', '{"sub":"rv_outro","role":"authenticated"}', true);
select pg_temp.chk('outra empresa não enxerga nada', $q$select pg_temp.totais(pg_temp.v()) || ' ' || (pg_temp.v()->'customers')::text$q$, 'OK=0 0 0 0 []');

reset role;
set local role anon;
select pg_temp.chk('visitante não executa', $q$select pg_temp.v()::text$q$, 'ERR=permission denied');
reset role;

do $$
declare bad text;
begin
  select string_agg(n || ' ' || label || ' => ' || got, E'\n' order by n) filter (where not ok) into bad from r;
  raise exception 'RESULT: % de % ok%', (select count(*) from r where ok), (select count(*) from r), coalesce(E'\nFALHAS:\n' || bad, '');
end $$;
rollback;
