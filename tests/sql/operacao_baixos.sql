-- =============================================================================
-- Bateria SQL — Operação, itens baixos (20261126140000_operacao_baixos). Rodar em uma CÓPIA do banco.
-- Transação que termina em erro proposital (RESULT: ...): nada persiste.
-- =============================================================================
begin;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

insert into public.profiles (user_id, clerk_user_id, full_name, email, role, status) values
  ('efefefef-0000-0000-0000-000000000001', 'ob_owner', 'OB Dono', 'ob-owner@example.invalid', 'user', 'active');
insert into public.companies (id, name, business_type, status) values
  ('efefefef-1000-0000-0000-000000000001', '[OBTEST] A', 'other', 'active');
alter table public.company_members disable trigger company_members_seat_limit;
insert into public.company_members (company_id, user_id, role) values
  ('efefefef-1000-0000-0000-000000000001', 'efefefef-0000-0000-0000-000000000001', 'owner');
insert into public.subscriptions (company_id, plan_id, status, starts_at, expires_at, provider)
  select 'efefefef-1000-0000-0000-000000000001', (select id from public.plans order by created_at limit 1), 'active', now(), now() + interval '30 days', 'manual';
insert into public.products (id, company_id, name, cost_price, sale_price, stock_quantity, status) values
  ('efefefef-3000-0000-0000-000000000001', 'efefefef-1000-0000-0000-000000000001', 'OB Ativo', 1, 2, 5, 'active'),
  ('efefefef-3000-0000-0000-000000000002', 'efefefef-1000-0000-0000-000000000001', 'OB Desativado', 1, 2, 5, 'inactive');

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

create or replace function pg_temp.historico(acao text) returns text language sql security definer as $$
  select count(*)::text from public.audit_logs where company_id = 'efefefef-1000-0000-0000-000000000001' and action = acao
     and actor_user_id = 'efefefef-0000-0000-0000-000000000001'; $$;
create or replace function pg_temp.fornecedor(nome text, doc text) returns text language sql as $$
  insert into public.suppliers (company_id, name, document) values ('efefefef-1000-0000-0000-000000000001', nome, doc) returning 'sim'; $$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"ob_owner","role":"authenticated"}', true);

-- FOR-2: texto sem número repete; documento com número não
select pg_temp.chk('for primeiro ISENTO', $q$select pg_temp.fornecedor('OB 1', 'ISENTO')$q$, 'OK=sim');
select pg_temp.chk('for segundo ISENTO', $q$select pg_temp.fornecedor('OB 2', 'ISENTO')$q$, 'OK=sim');
select pg_temp.chk('for documento com número', $q$select pg_temp.fornecedor('OB 3', 'RG 12345')$q$, 'OK=sim');
select pg_temp.chk('for documento com número repetido é recusado', $q$select pg_temp.fornecedor('OB 4', 'RG 12345')$q$, 'ERR=suppliers_document_per_company_unique');

-- FOR-4: situação no histórico, só quando muda
select pg_temp.chk('for inativa', $q$update public.suppliers set status = 'inactive' where name = 'OB 1' returning 'sim'$q$, 'OK=sim');
select pg_temp.chk('for inativação registrada', $q$select pg_temp.historico('supplier.deactivated')$q$, 'OK=1');
select pg_temp.chk('for salvar sem mudar situação', $q$update public.suppliers set status = 'inactive', notes = 'x' where name = 'OB 1' returning 'sim'$q$, 'OK=sim');
select pg_temp.chk('for não registra de novo', $q$select pg_temp.historico('supplier.deactivated')$q$, 'OK=1');
select pg_temp.chk('for reativa', $q$update public.suppliers set status = 'active' where name = 'OB 1' returning 'sim'$q$, 'OK=sim');
select pg_temp.chk('for reativação registrada', $q$select pg_temp.historico('supplier.reactivated')$q$, 'OK=1');

-- EST-4: produto desativado não aceita ajuste
select pg_temp.chk('est ajusta ativo', $q$select (public.adjust_product_stock('efefefef-3000-0000-0000-000000000001', 8, 'contagem')).stock_quantity::text$q$, 'OK=8.000');
select pg_temp.chk('est desativado é recusado', $q$select (public.adjust_product_stock('efefefef-3000-0000-0000-000000000002', 8, 'contagem')).stock_quantity::text$q$, 'ERR=Reative o produto');
select pg_temp.chk('est saldo do desativado intacto', $q$select stock_quantity::text from public.products where id = 'efefefef-3000-0000-0000-000000000002'$q$, 'OK=5.000');

reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select pg_temp.chk('ninguém chama o registro direto', $q$select has_function_privilege('authenticated', 'public.audit_supplier_status()', 'execute')::text$q$, 'OK=false');
select pg_temp.chk('exclusão da empresa continua funcionando', $q$delete from public.companies where id = 'efefefef-1000-0000-0000-000000000001' returning 'sim'$q$, 'OK=sim');

do $$
declare bad text;
begin
  select string_agg(n || ' ' || label || ' => ' || got, E'\n' order by n) filter (where not ok) into bad from r;
  raise exception 'RESULT: % de % ok%', (select count(*) from r where ok), (select count(*) from r), coalesce(E'\nFALHAS:\n' || bad, '');
end $$;
rollback;
