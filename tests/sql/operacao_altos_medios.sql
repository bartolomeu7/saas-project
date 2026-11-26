-- =============================================================================
-- Bateria SQL — Operação, altos e médios (20261126120000_operacao_caixa_compras). Rodar em uma CÓPIA do banco.
-- Transação que termina em erro proposital (RESULT: ...): nada persiste.
-- =============================================================================
begin;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

insert into public.profiles (user_id, clerk_user_id, full_name, email, role, status) values
  ('cdcdcdcd-0000-0000-0000-000000000001', 'op_owner', 'OP Dono', 'op-owner@example.invalid', 'user', 'active');
insert into public.companies (id, name, business_type, status) values
  ('cdcdcdcd-1000-0000-0000-000000000001', '[OPTEST] A', 'other', 'active');
alter table public.company_members disable trigger company_members_seat_limit;
insert into public.company_members (company_id, user_id, role) values
  ('cdcdcdcd-1000-0000-0000-000000000001', 'cdcdcdcd-0000-0000-0000-000000000001', 'owner');
insert into public.subscriptions (company_id, plan_id, status, starts_at, expires_at, provider)
  select 'cdcdcdcd-1000-0000-0000-000000000001', (select id from public.plans order by created_at limit 1), 'active', now(), now() + interval '30 days', 'manual';
insert into public.suppliers (id, company_id, name) values
  ('cdcdcdcd-2000-0000-0000-000000000001', 'cdcdcdcd-1000-0000-0000-000000000001', 'OP Fornecedor');
insert into public.products (id, company_id, name, cost_price, sale_price, stock_quantity) values
  ('cdcdcdcd-3000-0000-0000-000000000001', 'cdcdcdcd-1000-0000-0000-000000000001', 'OP Produto', 5, 20, 0);
insert into public.services (id, company_id, name, sale_price, cost_price) values
  ('cdcdcdcd-4000-0000-0000-000000000001', 'cdcdcdcd-1000-0000-0000-000000000001', 'OP Servico', 30, 0);
insert into public.sales (id, company_id, user_id, status, subtotal, total_amount, discount_amount)
  values ('cdcdcdcd-5000-0000-0000-000000000001', 'cdcdcdcd-1000-0000-0000-000000000001', 'cdcdcdcd-0000-0000-0000-000000000001', 'draft', 30, 30, 0);
insert into public.sale_items (company_id, sale_id, item_type, service_id, description, quantity, unit_price, subtotal, total_amount)
  values ('cdcdcdcd-1000-0000-0000-000000000001', 'cdcdcdcd-5000-0000-0000-000000000001', 'service', 'cdcdcdcd-4000-0000-0000-000000000001', 'S', 1, 30, 30, 30);
insert into public.hr_employees (id, company_id, full_name, base_amount, rate_kind, pay_frequency, pay_weekday, started_on)
  values ('cdcdcdcd-6000-0000-0000-000000000001', 'cdcdcdcd-1000-0000-0000-000000000001', 'OP Func', 800, 'fixed', 'weekly', 5, date '2026-01-02');
insert into public.accounts_payable (id, company_id, supplier_id, description, amount, status, created_by)
  values ('cdcdcdcd-7000-0000-0000-000000000001', 'cdcdcdcd-1000-0000-0000-000000000001', 'cdcdcdcd-2000-0000-0000-000000000001', 'OP conta', 500, 'open', 'cdcdcdcd-0000-0000-0000-000000000001');

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

create or replace function pg_temp.gaveta() returns text language sql security definer as $$
  select (r.opening_balance + coalesce(sum(case when m.direction = 'in' then m.amount else -m.amount end), 0))::numeric(12,2)::text
    from public.cash_registers r left join public.cash_movements m on m.cash_register_id = r.id and m.method = 'cash'
   where r.company_id = 'cdcdcdcd-1000-0000-0000-000000000001' and r.status = 'open' group by r.id; $$;
create or replace function pg_temp.custo() returns text language sql security definer as $$
  select cost_price::text from public.products where id = 'cdcdcdcd-3000-0000-0000-000000000001'; $$;
create temp table ids (d text primary key, id uuid);
grant all on ids to authenticated;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"op_owner","role":"authenticated"}', true);

-- ---------------------------------------------------------------- CX-1: a gaveta nunca fica negativa, venha de onde vier a saída
select pg_temp.chk('cx abre com 100', $q$select (public.open_cash_register(100, null)).status::text$q$, 'OK=open');
select pg_temp.chk('cx despesa 800 do Financeiro é recusada com o saldo na mensagem', $q$select (public.create_financial_entry('expense', 'op grande', 800, null, 'cash')).status::text$q$, 'ERR=há R$ 100,00 em dinheiro e a saída é de R$ 800,00');
select pg_temp.chk('cx recusa não deixa lançamento', $q$select count(*)::text from public.financial_entries where description = 'op grande'$q$, 'OK=0');
select pg_temp.chk('cx despesa no Pix passa', $q$select (public.create_financial_entry('expense', 'op pix', 800, null, 'pix')).status::text$q$, 'OK=posted');
select pg_temp.chk('cx vale 500 em dinheiro é recusado', $q$select public.hr_add_adjustment('cdcdcdcd-6000-0000-0000-000000000001', 'advance', 500, null, 'op vale', 'cash')::text$q$, 'ERR=Saldo insuficiente no caixa');
select pg_temp.chk('cx recusa não deixa vale', $q$select count(*)::text from public.hr_adjustments where employee_id = 'cdcdcdcd-6000-0000-0000-000000000001'$q$, 'OK=0');
select pg_temp.chk('cx fornecedor 200 em dinheiro é recusado', $q$select (public.pay_accounts_payable('cdcdcdcd-7000-0000-0000-000000000001', 200, 'cash')).status::text$q$, 'ERR=Saldo insuficiente no caixa');
select pg_temp.chk('cx recusa não baixa a conta', $q$select paid_amount::text || ' ' || status::text from public.accounts_payable where id = 'cdcdcdcd-7000-0000-0000-000000000001'$q$, 'OK=0.00 open');
select pg_temp.chk('cx saída manual acima é recusada', $q$select (public.create_cash_movement('out', 100.01, 'cash', 'op')).id::text$q$, 'ERR=Saldo insuficiente no caixa');
select pg_temp.chk('cx saída manual no Pix passa', $q$select (public.create_cash_movement('out', 999, 'pix', 'op pix')).direction::text$q$, 'OK=out');
select pg_temp.chk('cx saída do saldo exato passa', $q$select (public.create_cash_movement('out', 100, 'cash', 'op tudo')).direction::text$q$, 'OK=out');
select pg_temp.chk('cx gaveta zerada', $q$select pg_temp.gaveta()$q$, 'OK=0.00');

-- estornos em dinheiro também precisam do dinheiro
select pg_temp.chk('cx paga venda 30', $q$select (public.add_sale_payment('cdcdcdcd-5000-0000-0000-000000000001', 'cash', 30, null)).status::text$q$, 'OK=paid');
select pg_temp.chk('cx conclui venda', $q$select (public.complete_sale('cdcdcdcd-5000-0000-0000-000000000001')).status::text$q$, 'OK=completed');
select pg_temp.chk('cx retira os 30', $q$select (public.create_cash_movement('out', 30, 'cash', 'op sangria')).direction::text$q$, 'OK=out');
select pg_temp.chk('cx cancelar venda sem o dinheiro é recusado', $q$select (public.cancel_sale('cdcdcdcd-5000-0000-0000-000000000001', 'op')).status::text$q$, 'ERR=Saldo insuficiente no caixa');
select pg_temp.chk('cx venda continua concluída e paga', $q$select s.status::text || ' ' || p.status::text from public.sales s join public.sale_payments p on p.sale_id = s.id where s.id = 'cdcdcdcd-5000-0000-0000-000000000001'$q$, 'OK=completed paid');
select pg_temp.chk('cx recebe receita 40', $q$with e as (select (public.create_financial_entry('income', 'op receita', 40, null, 'cash')).id) insert into ids select 'receita', id from e returning d$q$, 'OK=receita');
select pg_temp.chk('cx cancela venda com dinheiro na gaveta', $q$select (public.cancel_sale('cdcdcdcd-5000-0000-0000-000000000001', 'op')).status::text$q$, 'OK=cancelled');
select pg_temp.chk('cx gaveta 10', $q$select pg_temp.gaveta()$q$, 'OK=10.00');
select pg_temp.chk('cx estornar receita de 40 com 10 é recusado', $q$select (public.cancel_manual_financial_entry((select id from ids where d = 'receita'), 'op')).status::text$q$, 'ERR=Saldo insuficiente no caixa');
select pg_temp.chk('cx receita continua lançada', $q$select status::text from public.financial_entries where id = (select id from ids where d = 'receita')$q$, 'OK=posted');

-- ---------------------------------------------------------------- COM-3: pagamento sem data futura
select pg_temp.chk('com data futura recusada', $q$select (public.pay_accounts_payable('cdcdcdcd-7000-0000-0000-000000000001', 10, 'pix', public.today_sao_paulo() + 1)).status::text$q$, 'ERR=não pode ser futura');
select pg_temp.chk('com data de hoje aceita', $q$select (public.pay_accounts_payable('cdcdcdcd-7000-0000-0000-000000000001', 10, 'pix', public.today_sao_paulo())).status::text$q$, 'OK=partial');
select pg_temp.chk('com dinheiro dentro do saldo aceito', $q$select (public.pay_accounts_payable('cdcdcdcd-7000-0000-0000-000000000001', 10, 'cash')).status::text$q$, 'OK=partial');
select pg_temp.chk('cx fecha com saldo esperado 0', $q$select (public.close_cash_register((select id from public.cash_registers where company_id = 'cdcdcdcd-1000-0000-0000-000000000001' and status = 'open'), 0, null)).expected_cash_balance::text$q$, 'OK=0.00');

-- ---------------------------------------------------------------- COM-5: custo zero não apaga o custo
create or replace function pg_temp.pedido(apelido text, qtd numeric, custo numeric) returns text language plpgsql as $$
declare o public.purchase_orders; r public.purchase_receipts;
begin
  o := public.create_purchase_order('cdcdcdcd-2000-0000-0000-000000000001',
         jsonb_build_array(jsonb_build_object('product_id', 'cdcdcdcd-3000-0000-0000-000000000001', 'quantity', qtd, 'unit_cost', custo)));
  r := public.receive_purchase_order(o.id, jsonb_build_array(jsonb_build_object('purchase_order_item_id',
         (select id from public.purchase_order_items where purchase_order_id = o.id), 'quantity', qtd)));
  insert into ids values (apelido, r.id);
  return r.status::text;
end $$;
create or replace function pg_temp.historico(apelido text) returns text language plpgsql security definer as $$
begin
  return (select count(*)::text from public.audit_logs where action = 'purchase.received' and entity_id = (select id from ids where d = apelido));
end $$;
-- dentro de uma transação todas as linhas têm o mesmo created_at; recebimentos reais são em momentos diferentes
select pg_temp.chk('com recebe custo 0', $q$select pg_temp.pedido('zero1', 2, 0)$q$, 'OK=posted');
select pg_temp.chk('com custo continua 5', $q$select pg_temp.custo()$q$, 'OK=5.00');
select pg_temp.chk('com recebimento de custo 0 vai para o histórico', $q$select pg_temp.historico('zero1')$q$, 'OK=1');
select pg_temp.chk('com custo 0 não gera conta a pagar', $q$select count(*)::text from public.accounts_payable where purchase_receipt_id = (select id from ids where d = 'zero1')$q$, 'OK=0');
select pg_temp.chk('com recebe custo 7', $q$select pg_temp.pedido('sete', 1, 7)$q$, 'OK=posted');
select pg_temp.chk('com custo vira 7', $q$select pg_temp.custo()$q$, 'OK=7.00');
select pg_temp.chk('com recebimento pago vai uma vez para o histórico', $q$select pg_temp.historico('sete')$q$, 'OK=1');
select pg_temp.chk('com estorna o de custo 0', $q$select ((public.cancel_purchase_receipt((select id from ids where d = 'zero1'))).id is not null)::text$q$, 'OK=true');
select pg_temp.chk('com custo continua 7', $q$select pg_temp.custo()$q$, 'OK=7.00');
select pg_temp.chk('com recebe outro custo 0', $q$select pg_temp.pedido('zero2', 1, 0)$q$, 'OK=posted');
select pg_temp.chk('com estorna o de custo 7', $q$select ((public.cancel_purchase_receipt((select id from ids where d = 'sete'))).id is not null)::text$q$, 'OK=true');
select pg_temp.chk('com custo volta a 5, ignorando o de custo 0', $q$select pg_temp.custo()$q$, 'OK=5.00');

-- ---------------------------------------------------------------- permissões e exclusão em cascata
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select pg_temp.chk('ninguém chama a trava direto', $q$select has_function_privilege('authenticated', 'public.guard_cash_drawer()', 'execute')::text$q$, 'OK=false');
select pg_temp.chk('exclusão da empresa continua funcionando', $q$delete from public.companies where id = 'cdcdcdcd-1000-0000-0000-000000000001' returning 'sim'$q$, 'OK=sim');

do $$
declare bad text;
begin
  select string_agg(n || ' ' || label || ' => ' || got, E'\n' order by n) filter (where not ok) into bad from r;
  raise exception 'RESULT: % de % ok%', (select count(*) from r where ok), (select count(*) from r), coalesce(E'\nFALHAS:\n' || bad, '');
end $$;
rollback;
