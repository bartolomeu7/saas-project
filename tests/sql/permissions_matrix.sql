-- =============================================================================
-- Bateria SQL — matriz de permissões (20261108000000_permissions_matrix). Roda SOMENTE no projeto TEST.
-- Transação que termina em erro proposital (RESULT: ...): nada persiste. NÃO rode em Production.
-- =============================================================================
begin;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

insert into public.profiles (user_id, clerk_user_id, full_name, email, role, status) values
  ('ffffffff-0000-0000-0000-000000000001', 'pm_owner',  'PM Dono',        'pm-owner@example.invalid',  'user', 'active'),
  ('ffffffff-0000-0000-0000-000000000002', 'pm_admin',  'PM Admin',       'pm-admin@example.invalid',  'user', 'active'),
  ('ffffffff-0000-0000-0000-000000000003', 'pm_staff',  'PM Func A',      'pm-staff@example.invalid',  'user', 'active'),
  ('ffffffff-0000-0000-0000-000000000004', 'pm_staff2', 'PM Func B',      'pm-staff2@example.invalid', 'user', 'active'),
  ('ffffffff-0000-0000-0000-000000000005', 'pm_admin2', 'PM Admin 2',     'pm-admin2@example.invalid', 'user', 'active'),
  ('ffffffff-0000-0000-0000-000000000006', 'pm_other',  'PM Outra empresa','pm-other@example.invalid',  'user', 'active');

insert into public.companies (id, name, business_type, status) values
  ('ffffffff-1000-0000-0000-000000000001', '[PMTEST] Empresa A', 'bakery', 'active'),
  ('ffffffff-1000-0000-0000-000000000002', '[PMTEST] Empresa B', 'other',  'active');
alter table public.company_members disable trigger company_members_seat_limit;
insert into public.company_members (company_id, user_id, role) values
  ('ffffffff-1000-0000-0000-000000000001', 'ffffffff-0000-0000-0000-000000000001', 'owner'),
  ('ffffffff-1000-0000-0000-000000000001', 'ffffffff-0000-0000-0000-000000000002', 'admin'),
  ('ffffffff-1000-0000-0000-000000000001', 'ffffffff-0000-0000-0000-000000000003', 'employee'),
  ('ffffffff-1000-0000-0000-000000000001', 'ffffffff-0000-0000-0000-000000000004', 'employee'),
  ('ffffffff-1000-0000-0000-000000000001', 'ffffffff-0000-0000-0000-000000000005', 'admin'),
  ('ffffffff-1000-0000-0000-000000000002', 'ffffffff-0000-0000-0000-000000000006', 'owner');

-- acesso comercial vigente (sem assinatura ativa o banco recusa qualquer gravação: COMMERCIAL_ACCESS_REQUIRED)
insert into public.subscriptions (company_id, plan_id, status, starts_at, expires_at, provider)
  select c.id, (select id from public.plans order by created_at limit 1), 'active', now(), now() + interval '30 days', 'manual'
  from public.companies c where c.id in ('ffffffff-1000-0000-0000-000000000001', 'ffffffff-1000-0000-0000-000000000002');

-- dados da empresa A (inseridos sem RLS)
insert into public.products (id, company_id, name, sale_price, cost_price) values
  ('ffffffff-2000-0000-0000-000000000001', 'ffffffff-1000-0000-0000-000000000001', 'PM Produto', 10, 4);
insert into public.services (id, company_id, name, sale_price, cost_price) values
  ('ffffffff-2000-0000-0000-000000000002', 'ffffffff-1000-0000-0000-000000000001', 'PM Servico', 50, 20);
insert into public.suppliers (id, company_id, name) values
  ('ffffffff-2000-0000-0000-000000000003', 'ffffffff-1000-0000-0000-000000000001', 'PM Fornecedor');
insert into public.financial_entries (company_id, direction, description, amount) values
  ('ffffffff-1000-0000-0000-000000000001', 'expense', 'PM lancamento', 5);
insert into public.accounts_payable (company_id, supplier_id, description, amount) values
  ('ffffffff-1000-0000-0000-000000000001', 'ffffffff-2000-0000-0000-000000000003', 'PM conta', 7);
insert into public.purchase_orders (company_id, supplier_id) values
  ('ffffffff-1000-0000-0000-000000000001', 'ffffffff-2000-0000-0000-000000000003');

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
grant execute on function pg_temp.chk(text, text, text, text) to authenticated, anon;
-- leituras auxiliares sem RLS
create or replace function pg_temp.open_reg() returns text language sql security definer as $$
  select id::text from public.cash_registers where company_id = 'ffffffff-1000-0000-0000-000000000001' and status = 'open' $$;
grant execute on function pg_temp.open_reg() to authenticated, anon;
create or replace function pg_temp.reg_status(rid text) returns text language sql security definer as $$
  select status::text from public.cash_registers where id = rid::uuid $$;
grant execute on function pg_temp.reg_status(text) to authenticated, anon;
create or replace function pg_temp.mid(clerk text) returns text language sql security definer as $$
  select cm.id::text from public.company_members cm join public.profiles p on p.user_id = cm.user_id
  where p.clerk_user_id = clerk and cm.company_id = 'ffffffff-1000-0000-0000-000000000001' $$;
grant execute on function pg_temp.mid(text) to authenticated, anon;
create or replace function pg_temp.role_of(clerk text) returns text language sql security definer as $$
  select cm.role::text from public.company_members cm join public.profiles p on p.user_id = cm.user_id
  where p.clerk_user_id = clerk and cm.company_id = 'ffffffff-1000-0000-0000-000000000001' $$;
grant execute on function pg_temp.role_of(text) to authenticated, anon;
create or replace function pg_temp.price(tbl text, id text) returns text language plpgsql security definer as $$
declare v text; begin
  execute format('select sale_price::text || ''/'' || cost_price::text from public.%I where id = %L', tbl, id) into v; return v; end $$;
grant execute on function pg_temp.price(text, text) to authenticated, anon;

-- ================================================= CAIXA
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"pm_staff","role":"authenticated"}', true);
select pg_temp.chk('caixa', 'funcionário A ABRE o caixa', $q$select (public.open_cash_register(100, 'turno A')).status::text$q$, 'OK=open');
select set_config('request.jwt.claims', '{"sub":"pm_staff2","role":"authenticated"}', true);
select pg_temp.chk('caixa', 'funcionário B NÃO fecha o caixa do A', $q$select (public.close_cash_register(pg_temp.open_reg()::uuid, 100, null)).status::text$q$, 'ERR=só pode fechar o caixa que você abriu');
select pg_temp.chk('caixa', 'funcionário B NÃO abre outro (já há um aberto)', $q$select (public.open_cash_register(50, null)).status::text$q$, 'ERR=Já existe um caixa aberto');
select pg_temp.chk('caixa', 'funcionário B NÃO lança sangria/suprimento', $q$select (public.create_cash_movement('out', 10, 'cash', 'teste')).id::text$q$, 'ERR=Apenas owner/admin');
select set_config('request.jwt.claims', '{"sub":"pm_staff","role":"authenticated"}', true);
select pg_temp.chk('caixa', 'funcionário A NÃO lança sangria/suprimento', $q$select (public.create_cash_movement('out', 10, 'cash', 'teste')).id::text$q$, 'ERR=Apenas owner/admin');
select pg_temp.chk('caixa', 'funcionário A FECHA o próprio caixa', $q$select (public.close_cash_register(pg_temp.open_reg()::uuid, 100, 'fim')).status::text$q$, 'OK=closed');
select set_config('request.jwt.claims', '{"sub":"pm_admin","role":"authenticated"}', true);
select pg_temp.chk('caixa', 'admin abre o caixa', $q$select (public.open_cash_register(200, null)).status::text$q$, 'OK=open');
select set_config('request.jwt.claims', '{"sub":"pm_staff","role":"authenticated"}', true);
select pg_temp.chk('caixa', 'funcionário NÃO fecha o caixa aberto pelo admin', $q$select (public.close_cash_register(pg_temp.open_reg()::uuid, 200, null)).status::text$q$, 'ERR=só pode fechar o caixa que você abriu');
select set_config('request.jwt.claims', '{"sub":"pm_owner","role":"authenticated"}', true);
select pg_temp.chk('caixa', 'dono fecha o caixa aberto pelo admin', $q$select (public.close_cash_register(pg_temp.open_reg()::uuid, 200, null)).status::text$q$, 'OK=closed');
select pg_temp.chk('caixa', 'dono abre', $q$select (public.open_cash_register(10, null)).status::text$q$, 'OK=open');
select pg_temp.chk('caixa', 'dono lança movimentação manual', $q$select (public.create_cash_movement('in', 10, 'cash', 'suprimento')).source::text$q$, 'OK=manual');
select pg_temp.chk('caixa', 'dono fecha', $q$select (public.close_cash_register(pg_temp.open_reg()::uuid, 20, null)).status::text$q$, 'OK=closed');
select set_config('request.jwt.claims', '{"sub":"pm_other","role":"authenticated"}', true);
select pg_temp.chk('caixa', 'outra empresa não vê nenhum caixa da A', $q$select count(*)::text from public.cash_registers where company_id = 'ffffffff-1000-0000-0000-000000000001'$q$, 'OK=0');
reset role;

-- ================================================= PREÇO E CUSTO
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"pm_staff","role":"authenticated"}', true);
select pg_temp.chk('preço', 'funcionário NÃO altera preço do produto', $q$with u as (update public.products set sale_price = 99 where id = 'ffffffff-2000-0000-0000-000000000001' returning 1) select count(*)::text from u$q$, 'ERR=Apenas owner/admin podem alterar o preço');
select pg_temp.chk('preço', 'funcionário NÃO altera custo do produto', $q$with u as (update public.products set cost_price = 1 where id = 'ffffffff-2000-0000-0000-000000000001' returning 1) select count(*)::text from u$q$, 'ERR=Apenas owner/admin podem alterar o preço');
select pg_temp.chk('preço', 'funcionário NÃO altera preço do serviço', $q$with u as (update public.services set sale_price = 99 where id = 'ffffffff-2000-0000-0000-000000000002' returning 1) select count(*)::text from u$q$, 'ERR=Apenas owner/admin podem alterar o preço');
select pg_temp.chk('preço', 'funcionário AINDA altera o nome do produto', $q$with u as (update public.products set name = 'PM Produto Renomeado' where id = 'ffffffff-2000-0000-0000-000000000001' returning 1) select count(*)::text from u$q$, 'OK=1');
select pg_temp.chk('preço', 'funcionário AINDA cadastra produto novo com preço', $q$with i as (insert into public.products (company_id, name, sale_price, cost_price) values ('ffffffff-1000-0000-0000-000000000001', 'PM Novo', 3, 0) returning 1) select count(*)::text from i$q$, 'OK=1');
select set_config('request.jwt.claims', '{"sub":"pm_admin","role":"authenticated"}', true);
select pg_temp.chk('preço', 'admin altera preço e custo do produto', $q$with u as (update public.products set sale_price = 12, cost_price = 5 where id = 'ffffffff-2000-0000-0000-000000000001' returning 1) select count(*)::text from u$q$, 'OK=1');
select set_config('request.jwt.claims', '{"sub":"pm_owner","role":"authenticated"}', true);
select pg_temp.chk('preço', 'dono altera preço do serviço', $q$with u as (update public.services set sale_price = 60 where id = 'ffffffff-2000-0000-0000-000000000002' returning 1) select count(*)::text from u$q$, 'OK=1');
reset role;
select pg_temp.chk('preço', 'produto ficou com o preço do admin (12/5)', $q$select pg_temp.price('products', 'ffffffff-2000-0000-0000-000000000001')$q$, 'OK=12.00/5.00');
select pg_temp.chk('preço', 'serviço ficou com o preço do dono (60/20)', $q$select pg_temp.price('services', 'ffffffff-2000-0000-0000-000000000002')$q$, 'OK=60.00/20.00');

-- ================================================= LEITURA: financeiro, fornecedores, compras
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"pm_owner","role":"authenticated"}', true);
select pg_temp.chk('leitura', 'dono vê lançamentos', $q$select count(*)::text from public.financial_entries$q$, 'OK=1');
select pg_temp.chk('leitura', 'dono vê contas a pagar', $q$select count(*)::text from public.accounts_payable$q$, 'OK=1');
select pg_temp.chk('leitura', 'dono vê fornecedores', $q$select count(*)::text from public.suppliers$q$, 'OK=1');
select pg_temp.chk('leitura', 'dono vê pedidos de compra', $q$select count(*)::text from public.purchase_orders$q$, 'OK=1');
select set_config('request.jwt.claims', '{"sub":"pm_admin","role":"authenticated"}', true);
select pg_temp.chk('leitura', 'admin vê lançamentos', $q$select count(*)::text from public.financial_entries$q$, 'OK=1');
select pg_temp.chk('leitura', 'admin vê fornecedores', $q$select count(*)::text from public.suppliers$q$, 'OK=1');
select pg_temp.chk('leitura', 'admin cadastra fornecedor', $q$with i as (insert into public.suppliers (company_id, name) values ('ffffffff-1000-0000-0000-000000000001', 'PM Forn 2') returning 1) select count(*)::text from i$q$, 'OK=1');
select set_config('request.jwt.claims', '{"sub":"pm_staff","role":"authenticated"}', true);
select pg_temp.chk('leitura', 'funcionário NÃO vê lançamentos', $q$select count(*)::text from public.financial_entries$q$, 'OK=0');
select pg_temp.chk('leitura', 'funcionário NÃO vê contas a pagar', $q$select count(*)::text from public.accounts_payable$q$, 'OK=0');
select pg_temp.chk('leitura', 'funcionário NÃO vê categorias financeiras', $q$select count(*)::text from public.financial_categories$q$, 'OK=0');
select pg_temp.chk('leitura', 'funcionário NÃO vê fornecedores', $q$select count(*)::text from public.suppliers$q$, 'OK=0');
select pg_temp.chk('leitura', 'funcionário NÃO vê pedidos de compra', $q$select count(*)::text from public.purchase_orders$q$, 'OK=0');
select pg_temp.chk('leitura', 'funcionário NÃO cadastra fornecedor', $q$with i as (insert into public.suppliers (company_id, name) values ('ffffffff-1000-0000-0000-000000000001', 'PM Hack') returning 1) select count(*)::text from i$q$, 'ERR=row-level security');
select pg_temp.chk('leitura', 'funcionário AINDA vê produtos', $q$select count(*)::text from public.products where company_id = 'ffffffff-1000-0000-0000-000000000001'$q$, 'OK=2');
select set_config('request.jwt.claims', '{"sub":"pm_other","role":"authenticated"}', true);
select pg_temp.chk('leitura', 'dono da outra empresa não vê nada da A (lançamentos)', $q$select count(*)::text from public.financial_entries$q$, 'OK=0');
select pg_temp.chk('leitura', 'dono da outra empresa não vê fornecedores da A', $q$select count(*)::text from public.suppliers$q$, 'OK=0');
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select pg_temp.chk('leitura', 'anon não lê lançamentos', $q$select count(*)::text from public.financial_entries$q$, 'ERR=permission denied');
reset role;

-- ================================================= EQUIPE
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"pm_admin","role":"authenticated"}', true);
select pg_temp.chk('equipe', 'admin NÃO adiciona outro admin', $q$select (public.add_existing_company_member('pm-nobody@example.invalid', 'admin')).id::text$q$, 'ERR=Apenas o owner pode adicionar um administrador');
select pg_temp.chk('equipe', 'admin NÃO promove funcionário a admin', $q$select (public.update_company_member_role(pg_temp.mid('pm_staff')::uuid, 'admin')).role::text$q$, 'ERR=Apenas o owner pode alterar administradores');
select pg_temp.chk('equipe', 'admin NÃO rebaixa outro admin', $q$select (public.update_company_member_role(pg_temp.mid('pm_admin2')::uuid, 'employee')).role::text$q$, 'ERR=Apenas o owner pode alterar administradores');
select pg_temp.chk('equipe', 'admin NÃO mexe no dono', $q$select (public.update_company_member_role(pg_temp.mid('pm_owner')::uuid, 'employee')).role::text$q$, 'ERR=Apenas o owner pode alterar administradores');
select pg_temp.chk('equipe', 'admin NÃO remove outro admin', $q$select public.remove_company_member(pg_temp.mid('pm_admin2')::uuid)::text$q$, 'ERR=Apenas o owner pode remover administradores');
select pg_temp.chk('equipe', 'admin NÃO remove o dono', $q$select public.remove_company_member(pg_temp.mid('pm_owner')::uuid)::text$q$, 'ERR=Apenas o owner pode remover administradores');
select pg_temp.chk('equipe', 'admin remove FUNCIONÁRIO', $q$select coalesce(public.remove_company_member(pg_temp.mid('pm_staff2')::uuid)::text, 'x')$q$, 'OK=');
select set_config('request.jwt.claims', '{"sub":"pm_staff","role":"authenticated"}', true);
select pg_temp.chk('equipe', 'funcionário NÃO remove ninguém', $q$select public.remove_company_member(pg_temp.mid('pm_admin2')::uuid)::text$q$, 'ERR=Apenas owner/admin');
select set_config('request.jwt.claims', '{"sub":"pm_owner","role":"authenticated"}', true);
select pg_temp.chk('equipe', 'dono promove funcionário a admin', $q$select (public.update_company_member_role(pg_temp.mid('pm_staff')::uuid, 'admin')).role::text$q$, 'OK=admin');
select pg_temp.chk('equipe', 'dono rebaixa admin a funcionário', $q$select (public.update_company_member_role(pg_temp.mid('pm_staff')::uuid, 'employee')).role::text$q$, 'OK=employee');
select pg_temp.chk('equipe', 'dono remove admin', $q$select coalesce(public.remove_company_member(pg_temp.mid('pm_admin2')::uuid)::text, 'x')$q$, 'OK=');
reset role;
select pg_temp.chk('equipe', 'dono continua dono', $q$select pg_temp.role_of('pm_owner')$q$, 'OK=owner');
select pg_temp.chk('equipe', 'admin continua admin', $q$select pg_temp.role_of('pm_admin')$q$, 'OK=admin');

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
