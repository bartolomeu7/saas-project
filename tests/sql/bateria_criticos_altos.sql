-- =============================================================================
-- Bateria SQL — correções críticas e altas (20261126100000_bateria_criticos_altos). Rodar em uma CÓPIA do banco.
-- Transação que termina em erro proposital (RESULT: ...): nada persiste.
-- =============================================================================
begin;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

insert into public.profiles (user_id, clerk_user_id, full_name, email, role, status) values
  ('abababab-0000-0000-0000-000000000001', 'bc_owner', 'BC Dono', 'bc-owner@example.invalid', 'user', 'active'),
  ('abababab-0000-0000-0000-000000000002', 'bc_func', 'BC Funcionario', 'bc-func@example.invalid', 'user', 'active'),
  ('abababab-0000-0000-0000-000000000003', 'bc_outro', 'BC Outro', 'bc-outro@example.invalid', 'user', 'active');
insert into public.companies (id, name, business_type, status) values
  ('abababab-1000-0000-0000-000000000001', '[BCTEST] A', 'other', 'active'),
  ('abababab-1000-0000-0000-000000000002', '[BCTEST] B', 'other', 'active');
alter table public.company_members disable trigger company_members_seat_limit;
insert into public.company_members (company_id, user_id, role) values
  ('abababab-1000-0000-0000-000000000001', 'abababab-0000-0000-0000-000000000001', 'owner'),
  ('abababab-1000-0000-0000-000000000001', 'abababab-0000-0000-0000-000000000002', 'employee'),
  ('abababab-1000-0000-0000-000000000002', 'abababab-0000-0000-0000-000000000003', 'owner');
insert into public.subscriptions (company_id, plan_id, status, starts_at, expires_at, provider)
  select c, (select id from public.plans order by created_at limit 1), 'active', now(), now() + interval '30 days', 'manual'
    from unnest(array['abababab-1000-0000-0000-000000000001','abababab-1000-0000-0000-000000000002']::uuid[]) c;
insert into public.customers (id, company_id, name, birth_date) values
  ('abababab-2000-0000-0000-000000000001', 'abababab-1000-0000-0000-000000000001', 'BC Aniversaria 25', date '1990-11-25'),
  ('abababab-2000-0000-0000-000000000002', 'abababab-1000-0000-0000-000000000001', 'BC Aniversaria 26', date '1990-11-26'),
  ('abababab-2000-0000-0000-000000000003', 'abababab-1000-0000-0000-000000000001', 'BC Pontos', null);
insert into public.services (id, company_id, name, sale_price, cost_price) values
  ('abababab-3000-0000-0000-000000000001', 'abababab-1000-0000-0000-000000000001', 'BC Servico', 100, 10);
insert into public.loyalty_settings (company_id, enabled, grant_on, points_per_currency_unit, first_purchase_bonus_points,
                                     birthday_bonus_points, min_purchase_amount_for_points, points_expire,
                                     redemption_value_per_point, min_points_to_redeem, max_redeem_percent_per_sale)
  values ('abababab-1000-0000-0000-000000000001', true, 'completion', 1, 0, 100, 0, false, 0.5, 0, 100);

-- venda rascunho com dois itens (60 + 40)
create or replace function pg_temp.venda(n int, cliente int default null) returns uuid language plpgsql as $$
declare v uuid := ('abababab-4000-0000-0000-' || lpad(n::text, 12, '0'))::uuid;
begin
  insert into public.sales (id, company_id, user_id, customer_id, status, subtotal, total_amount, discount_amount)
  values (v, 'abababab-1000-0000-0000-000000000001', 'abababab-0000-0000-0000-000000000001',
          case when cliente is null then null else ('abababab-2000-0000-0000-' || lpad(cliente::text, 12, '0'))::uuid end, 'draft', 100, 100, 0);
  insert into public.sale_items (id, company_id, sale_id, item_type, service_id, description, quantity, unit_price, subtotal, total_amount) values
    (('abababab-5000-0000-0001-' || lpad(n::text, 12, '0'))::uuid, 'abababab-1000-0000-0000-000000000001', v, 'service', 'abababab-3000-0000-0000-000000000001', 'A', 1, 60, 60, 60),
    (('abababab-5000-0000-0002-' || lpad(n::text, 12, '0'))::uuid, 'abababab-1000-0000-0000-000000000001', v, 'service', 'abababab-3000-0000-0000-000000000001', 'B', 1, 40, 40, 40);
  return v;
end $$;
select pg_temp.venda(n) from generate_series(1, 6) n;
select pg_temp.venda(7, 3);

create temp table r (n serial, label text, ok boolean, got text);
grant all on r to authenticated, anon;
grant all on sequence r_n_seq to authenticated, anon;
create or replace function pg_temp.chk(l text, q text, e text) returns void language plpgsql as $$
declare v text; got text;
begin
  begin execute q into v; got := 'OK=' || coalesce(v, 'null');
  exception when others then got := 'ERR=' || sqlerrm; end;
  insert into r(label, got, ok) values (l, left(got, 160), case when e like 'ERR=%' then got like 'ERR=%' and position(substr(e, 5) in got) > 0 else got = e end);
end $$;
grant execute on function pg_temp.chk(text, text, text) to authenticated, anon;

create or replace function pg_temp.dono() returns void language sql as $$
  select set_config('request.jwt.claims', '{"sub":"bc_owner","role":"authenticated"}', true); $$;
create or replace function pg_temp.caixa(sentido text) returns text language sql security definer as $$
  select count(*) || ':' || coalesce(sum(amount), 0) from public.cash_movements
   where company_id = 'abababab-1000-0000-0000-000000000001' and direction::text = sentido and method = 'cash'; $$;

set local role authenticated;
select pg_temp.dono();

-- ---------------------------------------------------------------- VDA-2: estorno de venda em dinheiro sai uma vez só
select pg_temp.chk('v2 abre caixa', $q$select (public.open_cash_register(100, null)).status::text$q$, 'OK=open');
select pg_temp.chk('v2 paga 30 em dinheiro', $q$select (public.add_sale_payment('abababab-4000-0000-0000-000000000001', 'cash', 30, null)).status::text$q$, 'OK=paid');
select pg_temp.chk('v2 conclui', $q$select (public.complete_sale('abababab-4000-0000-0000-000000000001')).status::text$q$, 'OK=completed');
select pg_temp.chk('v2 cancela', $q$select (public.cancel_sale('abababab-4000-0000-0000-000000000001', 'teste')).status::text$q$, 'OK=cancelled');
select pg_temp.chk('v2 uma única saída de 30', $q$select pg_temp.caixa('out')$q$, 'OK=1:30.00');

-- ---------------------------------------------------------------- VDA-1: pago nunca maior que o total
select pg_temp.chk('v1 paga 80', $q$select (public.add_sale_payment('abababab-4000-0000-0000-000000000002', 'pix', 80, null)).status::text$q$, 'OK=paid');
select pg_temp.chk('v1 remover item de 40 é recusado', $q$delete from public.sale_items where id = 'abababab-5000-0000-0002-000000000002' returning 'sim'$q$, 'ERR=valor já recebido');
select pg_temp.chk('v1 baratear item é recusado', $q$update public.sale_items set subtotal = 10, total_amount = 10, unit_price = 10 where id = 'abababab-5000-0000-0002-000000000002' returning 'sim'$q$, 'ERR=valor já recebido');
select pg_temp.chk('v1 desconto de 25 é recusado', $q$update public.sales set discount_amount = 25 where id = 'abababab-4000-0000-0000-000000000002' returning 'sim'$q$, 'ERR=valor já recebido');
select pg_temp.chk('v1 desconto de 20 é aceito (total = pago)', $q$update public.sales set discount_amount = 20 where id = 'abababab-4000-0000-0000-000000000002' returning 'sim'$q$, 'OK=sim');
select pg_temp.chk('v1 conclui com total = pago', $q$select (public.complete_sale('abababab-4000-0000-0000-000000000002')).status::text$q$, 'OK=completed');

reset role;
insert into public.sale_payments (company_id, sale_id, method, amount, status)
  values ('abababab-1000-0000-0000-000000000001', 'abababab-4000-0000-0000-000000000003', 'pix', 150, 'paid');
set local role authenticated;
select pg_temp.dono();
select pg_temp.chk('v1 não conclui venda com pago acima do total', $q$select (public.complete_sale('abababab-4000-0000-0000-000000000003')).status::text$q$, 'ERR=valor já recebido');
select pg_temp.chk('v1 rascunho já errado aceita alteração que não reduz o total', $q$update public.sale_items set quantity = 1 where id = 'abababab-5000-0000-0001-000000000003' returning 'sim'$q$, 'OK=sim');

reset role;
insert into public.loyalty_accounts (company_id, customer_id, balance, lifetime_points)
  values ('abababab-1000-0000-0000-000000000001', 'abababab-2000-0000-0000-000000000003', 100, 100);
insert into public.loyalty_transactions (company_id, customer_id, type, points, balance_after, source, reason, remaining_points)
  values ('abababab-1000-0000-0000-000000000001', 'abababab-2000-0000-0000-000000000003', 'ajuste', 100, 100, 'manual', 'teste', 100);
set local role authenticated;
select pg_temp.dono();
select pg_temp.chk('v1 paga 90', $q$select (public.add_sale_payment('abababab-4000-0000-0000-000000000007', 'pix', 90, null)).status::text$q$, 'OK=paid');
select pg_temp.chk('v1 resgate que passaria do pago é recusado', $q$select public.redeem_loyalty_points('abababab-4000-0000-0000-000000000007', 40)::text$q$, 'ERR=valor já recebido');
select pg_temp.chk('v1 saldo de pontos intacto', $q$select balance::text from public.loyalty_accounts where customer_id = 'abababab-2000-0000-0000-000000000003'$q$, 'OK=100');

-- ---------------------------------------------------------------- VDA-3: remover pagamento e descartar rascunho
select pg_temp.chk('v3 descartar com pagamento é recusado', $q$select public.discard_draft_sale('abababab-4000-0000-0000-000000000007')::text$q$, 'ERR=Remova os pagamentos');
select set_config('request.jwt.claims', '{"sub":"bc_outro","role":"authenticated"}', true);
select pg_temp.chk('v3 outra empresa não remove', $q$select public.remove_draft_sale_payment((select id from public.sale_payments where sale_id = 'abababab-4000-0000-0000-000000000007'))::text$q$, 'ERR=Pagamento não encontrado');
select pg_temp.chk('v3 outra empresa não descarta', $q$select public.discard_draft_sale('abababab-4000-0000-0000-000000000004')::text$q$, 'ERR=Venda não encontrada');
reset role;
create temp table p as select id from public.sale_payments where sale_id = 'abababab-4000-0000-0000-000000000007';
grant select on p to authenticated, anon;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"bc_outro","role":"authenticated"}', true);
select pg_temp.chk('v3 outra empresa não remove mesmo sabendo o código', $q$select public.remove_draft_sale_payment((select id from p))::text$q$, 'ERR=Pagamento não encontrado');
select set_config('request.jwt.claims', '{"sub":"bc_func","role":"authenticated"}', true);
select pg_temp.chk('v3 funcionário não mexe em venda de outro', $q$select public.remove_draft_sale_payment((select id from p))::text$q$, 'ERR=registradas por você');
select pg_temp.chk('v3 funcionário não descarta venda de outro', $q$select public.discard_draft_sale('abababab-4000-0000-0000-000000000004')::text$q$, 'ERR=registradas por você');
select pg_temp.dono();
select pg_temp.chk('v3 dono remove', $q$select public.remove_draft_sale_payment((select id from p))::text$q$, 'OK=');
select pg_temp.chk('v3 fica estornado', $q$select status::text from public.sale_payments where id = (select id from p)$q$, 'OK=refunded');
select pg_temp.chk('v3 remover de novo é recusado', $q$select public.remove_draft_sale_payment((select id from p))::text$q$, 'ERR=já foi removido');
select pg_temp.chk('v3 financeiro zera', $q$select coalesce(sum(case when direction = 'income' then amount else -amount end), 0)::text from public.financial_entries where source_id = (select id from p)$q$, 'OK=0.00');
select pg_temp.chk('v3 resgata 40 pontos agora', $q$select public.redeem_loyalty_points('abababab-4000-0000-0000-000000000007', 40)::text$q$, 'OK=20.00');
select pg_temp.chk('v3 descarta', $q$select public.discard_draft_sale('abababab-4000-0000-0000-000000000007')::text$q$, 'OK=');
select pg_temp.chk('v3 rascunho vira cancelada', $q$select status::text || ' ' || cancelled_reason from public.sales where id = 'abababab-4000-0000-0000-000000000007'$q$, 'OK=cancelled Rascunho descartado');
select pg_temp.chk('v3 pontos voltam', $q$select balance::text from public.loyalty_accounts where customer_id = 'abababab-2000-0000-0000-000000000003'$q$, 'OK=100');
select pg_temp.chk('v3 concluída não é descartada', $q$select public.discard_draft_sale('abababab-4000-0000-0000-000000000002')::text$q$, 'ERR=em rascunho');
select pg_temp.chk('v3 pagamento de concluída não é removido', $q$select public.remove_draft_sale_payment((select id from public.sale_payments where sale_id = 'abababab-4000-0000-0000-000000000002'))::text$q$, 'ERR=em rascunho');
select pg_temp.chk('v3 paga 10 em dinheiro', $q$select (public.add_sale_payment('abababab-4000-0000-0000-000000000004', 'cash', 10, null)).status::text$q$, 'OK=paid');
select pg_temp.chk('v3 fecha caixa', $q$select (public.close_cash_register((select id from public.cash_registers where company_id = 'abababab-1000-0000-0000-000000000001' and status = 'open'), 0, null)).status::text$q$, 'OK=closed');
select pg_temp.chk('v3 dinheiro do caixa exige caixa aberto', $q$select public.remove_draft_sale_payment((select id from public.sale_payments where sale_id = 'abababab-4000-0000-0000-000000000004'))::text$q$, 'ERR=Abra o caixa');
select pg_temp.chk('v3 reabre caixa', $q$select (public.open_cash_register(0, null)).status::text$q$, 'OK=open');
select pg_temp.chk('v3 remove dinheiro', $q$select public.remove_draft_sale_payment((select id from public.sale_payments where sale_id = 'abababab-4000-0000-0000-000000000004'))::text$q$, 'OK=');
select pg_temp.chk('v3 saiu uma vez do caixa', $q$select pg_temp.caixa('out')$q$, 'OK=2:40.00');

-- ---------------------------------------------------------------- FID-2: aniversário no horário de São Paulo
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
update public.sales set customer_id = 'abababab-2000-0000-0000-000000000001' where id = 'abababab-4000-0000-0000-000000000005';
update public.sales set customer_id = 'abababab-2000-0000-0000-000000000002' where id = 'abababab-4000-0000-0000-000000000006';
-- 26/11 02:30 UTC = 25/11 23:30 em São Paulo
update public.sales set status = 'completed', completed_at = timestamptz '2026-11-26 02:30:00+00'
 where id in ('abababab-4000-0000-0000-000000000005', 'abababab-4000-0000-0000-000000000006');
select pg_temp.chk('f2 aniversariante do dia 25 ganha às 23h30', $q$select coalesce(sum(points), 0)::text from public.loyalty_transactions where reference_id = 'abababab-4000-0000-0000-000000000005' and source = 'birthday'$q$, 'OK=100');
select pg_temp.chk('f2 aniversariante do dia 26 não ganha no dia 25', $q$select coalesce(sum(points), 0)::text from public.loyalty_transactions where reference_id = 'abababab-4000-0000-0000-000000000006' and source = 'birthday'$q$, 'OK=0');

-- ---------------------------------------------------------------- RH-1: estorno de vale
insert into public.hr_employees (id, company_id, full_name, base_amount, rate_kind, pay_frequency, pay_weekday, started_on)
  values ('abababab-6000-0000-0000-000000000001', 'abababab-1000-0000-0000-000000000001', 'BC Diarista Teste', 100, 'per_day', 'weekly', 5, current_date - 40);
set local role authenticated;
select pg_temp.dono();
select pg_temp.chk('rh vale pix', $q$select (public.hr_add_adjustment('abababab-6000-0000-0000-000000000001', 'advance', 5000, null, 'bc-pix', 'pix')).kind::text$q$, 'OK=advance');
select pg_temp.chk('rh vale dinheiro', $q$select (public.hr_add_adjustment('abababab-6000-0000-0000-000000000001', 'advance', 70, null, 'bc-cash', 'cash')).kind::text$q$, 'OK=advance');
select pg_temp.chk('rh desconto', $q$select (public.hr_add_adjustment('abababab-6000-0000-0000-000000000001', 'deduction', 5, null, 'bc-desc', null)).kind::text$q$, 'OK=deduction');
reset role;
create temp table a as select description d, id, financial_entry_id f from public.hr_adjustments where employee_id = 'abababab-6000-0000-0000-000000000001';
grant select on a to authenticated, anon;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"bc_outro","role":"authenticated"}', true);
select pg_temp.chk('rh outra empresa não estorna', $q$select public.hr_reverse_advance((select id from a where d = 'bc-pix'))::text$q$, 'ERR=Lançamento não encontrado');
select set_config('request.jwt.claims', '{"sub":"bc_func","role":"authenticated"}', true);
select pg_temp.chk('rh funcionário não estorna', $q$select public.hr_reverse_advance((select id from a where d = 'bc-pix'))::text$q$, 'ERR=Acesso negado');
select pg_temp.dono();
select pg_temp.chk('rh desconto não é estornado por aqui', $q$select public.hr_reverse_advance((select id from a where d = 'bc-desc'))::text$q$, 'ERR=Só vale');
select pg_temp.chk('rh estorna pix', $q$select public.hr_reverse_advance((select id from a where d = 'bc-pix'))::text$q$, 'OK=');
select pg_temp.chk('rh despesa cancelada', $q$select status::text from public.financial_entries where id = (select f from a where d = 'bc-pix')$q$, 'OK=cancelled');
select pg_temp.chk('rh vale saiu da ficha', $q$select count(*)::text from public.hr_adjustments where id = (select id from a where d = 'bc-pix')$q$, 'OK=0');
select pg_temp.chk('rh estornar de novo é recusado', $q$select public.hr_reverse_advance((select id from a where d = 'bc-pix'))::text$q$, 'ERR=Lançamento não encontrado');
select pg_temp.chk('rh fecha caixa', $q$select (public.close_cash_register((select id from public.cash_registers where company_id = 'abababab-1000-0000-0000-000000000001' and status = 'open'), 0, null)).status::text$q$, 'OK=closed');
select pg_temp.chk('rh dinheiro exige caixa aberto', $q$select public.hr_reverse_advance((select id from a where d = 'bc-cash'))::text$q$, 'ERR=Abra o caixa');
select pg_temp.chk('rh reabre', $q$select (public.open_cash_register(0, null)).status::text$q$, 'OK=open');
select pg_temp.chk('rh estorna dinheiro', $q$select public.hr_reverse_advance((select id from a where d = 'bc-cash'))::text$q$, 'OK=');
select pg_temp.chk('rh dinheiro volta ao caixa', $q$select count(*)::text from public.cash_movements where company_id = 'abababab-1000-0000-0000-000000000001' and direction = 'in' and amount = 70 and description like 'Estorno:%'$q$, 'OK=1');

-- ---------------------------------------------------------------- permissões e exclusão em cascata
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select pg_temp.chk('anon não remove pagamento', $q$select public.remove_draft_sale_payment((select id from p))::text$q$, 'ERR=permission denied');
select pg_temp.chk('anon não descarta', $q$select public.discard_draft_sale('abababab-4000-0000-0000-000000000004')::text$q$, 'ERR=permission denied');
select pg_temp.chk('anon não estorna vale', $q$select public.hr_reverse_advance(gen_random_uuid())::text$q$, 'ERR=permission denied');
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select pg_temp.chk('exclusão da empresa com rascunho pago continua funcionando', $q$delete from public.companies where id = 'abababab-1000-0000-0000-000000000001' returning 'sim'$q$, 'OK=sim');

do $$
declare bad text;
begin
  select string_agg(n || ' ' || label || ' => ' || got, E'\n' order by n) filter (where not ok) into bad from r;
  raise exception 'RESULT: % de % ok%', (select count(*) from r where ok), (select count(*) from r), coalesce(E'\nFALHAS:\n' || bad, '');
end $$;
rollback;
