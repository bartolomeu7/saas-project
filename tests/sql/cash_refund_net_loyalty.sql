-- =============================================================================
-- Bateria SQL — estorno no caixa + pontos sobre o valor pago (20261108120000_cash_refund_and_net_loyalty_points).
-- Roda SOMENTE no projeto TEST. Transação que termina em erro proposital (RESULT: ...): nada persiste.
-- =============================================================================
begin;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

insert into public.profiles (user_id, clerk_user_id, full_name, email, role, status) values
  ('ffffffff-0000-0000-0000-0000000000a1', 'cr_owner', 'CR Dono', 'cr-owner@example.invalid', 'user', 'active');
insert into public.companies (id, name, business_type, status) values
  ('ffffffff-1000-0000-0000-0000000000a1', '[CRTEST] Empresa', 'bakery', 'active');
alter table public.company_members disable trigger company_members_seat_limit;
insert into public.company_members (company_id, user_id, role) values
  ('ffffffff-1000-0000-0000-0000000000a1', 'ffffffff-0000-0000-0000-0000000000a1', 'owner');
insert into public.subscriptions (company_id, plan_id, status, starts_at, expires_at, provider)
  select 'ffffffff-1000-0000-0000-0000000000a1', (select id from public.plans order by created_at limit 1), 'active', now(), now() + interval '30 days', 'manual';

insert into public.customers (id, company_id, name) values
  ('ffffffff-3000-0000-0000-0000000000a1', 'ffffffff-1000-0000-0000-0000000000a1', 'CR Cliente 1'),
  ('ffffffff-3000-0000-0000-0000000000a2', 'ffffffff-1000-0000-0000-0000000000a1', 'CR Cliente 2');

insert into public.products (id, company_id, name, sale_price, cost_price) values
  ('ffffffff-2000-0000-0000-0000000000a1', 'ffffffff-1000-0000-0000-0000000000a1', 'CR Produto', 59.90, 20);
insert into public.services (id, company_id, name, sale_price, cost_price) values
  ('ffffffff-2000-0000-0000-0000000000a2', 'ffffffff-1000-0000-0000-0000000000a1', 'CR Servico', 280, 45);

insert into public.loyalty_settings (company_id, enabled, grant_on, points_per_currency_unit, first_purchase_bonus_points,
                                     birthday_bonus_points, min_purchase_amount_for_points, points_expire)
  values ('ffffffff-1000-0000-0000-0000000000a1', true, 'completion', 2, 50, 0, 0, false)
  on conflict (company_id) do update set enabled = true, grant_on = 'completion', points_per_currency_unit = 2,
    first_purchase_bonus_points = 50, birthday_bonus_points = 0, min_purchase_amount_for_points = 0, points_expire = false;

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

-- ================================================= FIDELIDADE: pontos sobre o valor pago
-- Venda 1: itens 280,00 + 119,80 = 399,80 com desconto manual de 19,80 → total pago 380,00.
insert into public.sales (id, company_id, user_id, customer_id, status, subtotal, total_amount, discount_amount)
  values ('ffffffff-4000-0000-0000-0000000000a1', 'ffffffff-1000-0000-0000-0000000000a1', 'ffffffff-0000-0000-0000-0000000000a1',
          'ffffffff-3000-0000-0000-0000000000a1', 'draft', 399.80, 380, 19.80);
insert into public.sale_items (company_id, sale_id, item_type, service_id, product_id, description, quantity, unit_price, subtotal, total_amount) values
  ('ffffffff-1000-0000-0000-0000000000a1', 'ffffffff-4000-0000-0000-0000000000a1', 'service', 'ffffffff-2000-0000-0000-0000000000a2', null, 'CR Servico', 1, 280, 280, 280),
  ('ffffffff-1000-0000-0000-0000000000a1', 'ffffffff-4000-0000-0000-0000000000a1', 'product', null, 'ffffffff-2000-0000-0000-0000000000a1', 'CR Produto', 2, 59.90, 119.80, 119.80);
update public.sales set status = 'completed', completed_at = now() where id = 'ffffffff-4000-0000-0000-0000000000a1';

select pg_temp.chk('fidelidade', 'compra com desconto: pontos da venda sobre o TOTAL PAGO (759, não 799)',
  $q$select coalesce(sum(points), 0)::text from public.loyalty_transactions where reference_id = 'ffffffff-4000-0000-0000-0000000000a1' and source = 'sale'$q$, 'OK=759');
select pg_temp.chk('fidelidade', 'bônus de primeira compra continua 50',
  $q$select coalesce(sum(points), 0)::text from public.loyalty_transactions where reference_id = 'ffffffff-4000-0000-0000-0000000000a1' and source = 'first_purchase'$q$, 'OK=50');
select pg_temp.chk('fidelidade', 'saldo da conta = 809',
  $q$select balance::text from public.loyalty_accounts where customer_id = 'ffffffff-3000-0000-0000-0000000000a1'$q$, 'OK=809');

-- Venda 2 (cliente 2): sem desconto — comportamento antigo preservado (R$ 100 x 2 = 200 + 50 de primeira compra).
insert into public.sales (id, company_id, user_id, customer_id, status, subtotal, total_amount, discount_amount)
  values ('ffffffff-4000-0000-0000-0000000000a2', 'ffffffff-1000-0000-0000-0000000000a1', 'ffffffff-0000-0000-0000-0000000000a1',
          'ffffffff-3000-0000-0000-0000000000a2', 'draft', 100, 100, 0);
insert into public.sale_items (company_id, sale_id, item_type, service_id, product_id, description, quantity, unit_price, subtotal, total_amount) values
  ('ffffffff-1000-0000-0000-0000000000a1', 'ffffffff-4000-0000-0000-0000000000a2', 'service', 'ffffffff-2000-0000-0000-0000000000a2', null, 'CR Servico', 1, 100, 100, 100);
update public.sales set status = 'completed', completed_at = now() where id = 'ffffffff-4000-0000-0000-0000000000a2';
select pg_temp.chk('fidelidade', 'compra sem desconto: 200 pontos da venda (inalterado)',
  $q$select coalesce(sum(points), 0)::text from public.loyalty_transactions where reference_id = 'ffffffff-4000-0000-0000-0000000000a2' and source = 'sale'$q$, 'OK=200');

-- ================================================= CAIXA: estorno vira saída
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"cr_owner","role":"authenticated"}', true);
select pg_temp.chk('caixa', 'dono abre o caixa', $q$select (public.open_cash_register(100, null)).status::text$q$, 'OK=open');
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- pagamento 1 (PIX 59,90) entra no caixa e depois é estornado
insert into public.sale_payments (id, company_id, sale_id, method, amount, status)
  values ('ffffffff-5000-0000-0000-0000000000a1', 'ffffffff-1000-0000-0000-0000000000a1', 'ffffffff-4000-0000-0000-0000000000a2', 'pix', 59.90, 'paid');
select pg_temp.chk('caixa', 'pagamento pago gera ENTRADA no caixa',
  $q$select count(*)::text from public.cash_movements where sale_payment_id = 'ffffffff-5000-0000-0000-0000000000a1' and direction = 'in' and amount = 59.90$q$, 'OK=1');
update public.sale_payments set status = 'refunded' where id = 'ffffffff-5000-0000-0000-0000000000a1';
select pg_temp.chk('caixa', 'estorno gera SAÍDA de 59,90 no mesmo método',
  $q$select count(*)::text from public.cash_movements where company_id = 'ffffffff-1000-0000-0000-0000000000a1' and direction = 'out' and amount = 59.90 and method = 'pix' and description like 'Estorno de pagamento de venda%'$q$, 'OK=1');
update public.sale_payments set notes = 'reafirma' where id = 'ffffffff-5000-0000-0000-0000000000a1';
select pg_temp.chk('caixa', 'novo UPDATE no pagamento já estornado NÃO duplica a saída',
  $q$select count(*)::text from public.cash_movements where company_id = 'ffffffff-1000-0000-0000-0000000000a1' and direction = 'out' and description like 'Estorno de pagamento de venda%'$q$, 'OK=1');
select pg_temp.chk('caixa', 'ainda existe 1 entrada de venda (histórico preservado)',
  $q$select count(*)::text from public.cash_movements where sale_payment_id = 'ffffffff-5000-0000-0000-0000000000a1'$q$, 'OK=1');

-- pagamento 2: nunca entrou em caixa nenhum (simulado apagando a entrada) → estornar NÃO cria saída
insert into public.sale_payments (id, company_id, sale_id, method, amount, status)
  values ('ffffffff-5000-0000-0000-0000000000a2', 'ffffffff-1000-0000-0000-0000000000a1', 'ffffffff-4000-0000-0000-0000000000a2', 'cash', 20, 'paid');
delete from public.cash_movements where sale_payment_id = 'ffffffff-5000-0000-0000-0000000000a2';
update public.sale_payments set status = 'refunded' where id = 'ffffffff-5000-0000-0000-0000000000a2';
select pg_temp.chk('caixa', 'estorno de pagamento que nunca entrou no caixa NÃO gera saída',
  $q$select count(*)::text from public.cash_movements where company_id = 'ffffffff-1000-0000-0000-0000000000a1' and direction = 'out' and amount = 20$q$, 'OK=0');

-- pagamento 3 em dinheiro: entra e é estornado → espécie esperado volta ao saldo inicial
insert into public.sale_payments (id, company_id, sale_id, method, amount, status)
  values ('ffffffff-5000-0000-0000-0000000000a3', 'ffffffff-1000-0000-0000-0000000000a1', 'ffffffff-4000-0000-0000-0000000000a2', 'cash', 30, 'paid');
update public.sale_payments set status = 'refunded' where id = 'ffffffff-5000-0000-0000-0000000000a3';
select pg_temp.chk('caixa', 'dinheiro entrou 30 e saiu 30: espécie esperado = saldo inicial (100)',
  $q$select (100 + coalesce(sum(case when direction = 'in' then amount else -amount end), 0))::text
       from public.cash_movements where company_id = 'ffffffff-1000-0000-0000-0000000000a1' and method = 'cash' and sale_payment_id is distinct from 'ffffffff-5000-0000-0000-0000000000a2'$q$, 'OK=100.00');

-- sem caixa aberto: fecha o caixa e estorna outro pagamento → nada é lançado
insert into public.sale_payments (id, company_id, sale_id, method, amount, status)
  values ('ffffffff-5000-0000-0000-0000000000a4', 'ffffffff-1000-0000-0000-0000000000a1', 'ffffffff-4000-0000-0000-0000000000a2', 'debit', 15, 'paid');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"cr_owner","role":"authenticated"}', true);
select pg_temp.chk('caixa', 'dono fecha o caixa', $q$select (public.close_cash_register((select id from public.cash_registers where company_id = 'ffffffff-1000-0000-0000-0000000000a1' and status = 'open'), 100, null)).status::text$q$, 'OK=closed');
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
update public.sale_payments set status = 'refunded' where id = 'ffffffff-5000-0000-0000-0000000000a4';
select pg_temp.chk('caixa', 'estorno SEM caixa aberto não lança nada (fica só no Financeiro)',
  $q$select count(*)::text from public.cash_movements where company_id = 'ffffffff-1000-0000-0000-0000000000a1' and direction = 'out' and amount = 15$q$, 'OK=0');
select pg_temp.chk('financeiro', 'o Financeiro continua registrando o estorno do pagamento 1',
  $q$select count(*)::text from public.financial_entries where source_type = 'sale_payment_refund' and source_id = 'ffffffff-5000-0000-0000-0000000000a1'$q$, 'OK=1');

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
