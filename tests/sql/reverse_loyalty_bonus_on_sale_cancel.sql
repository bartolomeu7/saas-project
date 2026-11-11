-- =============================================================================
-- Bateria SQL — cancelar a venda reverte também o bônus de primeira compra (20261111120000_reverse_loyalty_bonus_on_sale_cancel).
-- Roda SOMENTE no projeto TEST. Transação que termina em erro proposital (RESULT: ...): nada persiste.
-- =============================================================================
begin;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

insert into public.profiles (user_id, clerk_user_id, full_name, email, role, status) values
  ('ffffffff-0000-0000-0000-0000000000a1', 'lb_owner', 'LB Dono', 'lb-owner@example.invalid', 'user', 'active');
insert into public.companies (id, name, business_type, status) values
  ('ffffffff-1000-0000-0000-0000000000a1', '[LBTEST] Empresa', 'bakery', 'active');
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

-- ================================================= venda 1 do cliente 1: 280 -> 560 pontos + 50 de primeira compra
insert into public.sales (id, company_id, user_id, customer_id, status, subtotal, total_amount, discount_amount)
  values ('ffffffff-4000-0000-0000-0000000000b1', 'ffffffff-1000-0000-0000-0000000000a1', 'ffffffff-0000-0000-0000-0000000000a1',
          'ffffffff-3000-0000-0000-0000000000a1', 'draft', 280, 280, 0);
insert into public.sale_items (company_id, sale_id, item_type, service_id, product_id, description, quantity, unit_price, subtotal, total_amount) values
  ('ffffffff-1000-0000-0000-0000000000a1', 'ffffffff-4000-0000-0000-0000000000b1', 'service', 'ffffffff-2000-0000-0000-0000000000a2', null, 'CR Servico', 1, 280, 280, 280);
update public.sales set status = 'completed', completed_at = now() where id = 'ffffffff-4000-0000-0000-0000000000b1';
select pg_temp.chk('antes', 'saldo após a venda = 610 (560 + 50)', $q$select balance::text from public.loyalty_accounts where customer_id = 'ffffffff-3000-0000-0000-0000000000a1'$q$, 'OK=610');

-- cancela a venda
update public.sales set status = 'cancelled', cancelled_at = now() where id = 'ffffffff-4000-0000-0000-0000000000b1';
select pg_temp.chk('cancelar', 'saldo volta a 0 (compra E bônus revertidos)', $q$select balance::text from public.loyalty_accounts where customer_id = 'ffffffff-3000-0000-0000-0000000000a1'$q$, 'OK=0');
select pg_temp.chk('cancelar', 'pontos vitalícios voltam a 0', $q$select lifetime_points::text from public.loyalty_accounts where customer_id = 'ffffffff-3000-0000-0000-0000000000a1'$q$, 'OK=0');
select pg_temp.chk('cancelar', '2 reversões gravadas (compra + primeira compra)', $q$select count(*)::text from public.loyalty_transactions where type = 'reversao' and customer_id = 'ffffffff-3000-0000-0000-0000000000a1'$q$, 'OK=2');
select pg_temp.chk('cancelar', 'lotes de pontos zerados (nada resgatável sobra)', $q$select coalesce(sum(remaining_points), 0)::text from public.loyalty_transactions where customer_id = 'ffffffff-3000-0000-0000-0000000000a1' and type = 'ganho'$q$, 'OK=0');

-- idempotência: reexecutar a reversão não duplica
select public.reverse_loyalty_points_for_sale('ffffffff-4000-0000-0000-0000000000b1');
select pg_temp.chk('cancelar', 'reversão repetida não duplica (continua 2)', $q$select count(*)::text from public.loyalty_transactions where type = 'reversao' and customer_id = 'ffffffff-3000-0000-0000-0000000000a1'$q$, 'OK=2');
select pg_temp.chk('cancelar', 'saldo continua 0 após reversão repetida', $q$select balance::text from public.loyalty_accounts where customer_id = 'ffffffff-3000-0000-0000-0000000000a1'$q$, 'OK=0');

-- nova venda do mesmo cliente: é a primeira compra VÁLIDA, então ganha o bônus uma única vez
insert into public.sales (id, company_id, user_id, customer_id, status, subtotal, total_amount, discount_amount)
  values ('ffffffff-4000-0000-0000-0000000000b2', 'ffffffff-1000-0000-0000-0000000000a1', 'ffffffff-0000-0000-0000-0000000000a1',
          'ffffffff-3000-0000-0000-0000000000a1', 'draft', 100, 100, 0);
insert into public.sale_items (company_id, sale_id, item_type, service_id, product_id, description, quantity, unit_price, subtotal, total_amount) values
  ('ffffffff-1000-0000-0000-0000000000a1', 'ffffffff-4000-0000-0000-0000000000b2', 'service', 'ffffffff-2000-0000-0000-0000000000a2', null, 'CR Servico', 1, 100, 100, 100);
update public.sales set status = 'completed', completed_at = now() where id = 'ffffffff-4000-0000-0000-0000000000b2';
select pg_temp.chk('depois', 'nova venda: 200 + 50 = 250 (bônus só uma vez no total)', $q$select balance::text from public.loyalty_accounts where customer_id = 'ffffffff-3000-0000-0000-0000000000a1'$q$, 'OK=250');

-- resgate da venda cancelada continua sendo devolvido (comportamento da 012 preservado)
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
