-- =============================================================================
-- Bateria SQL — anexos no banco e rotinas diárias (20261126000000). Rodar em uma CÓPIA do banco.
-- Transação que termina em erro proposital (RESULT: ...): nada persiste.
-- =============================================================================
begin;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

insert into public.profiles (user_id, clerk_user_id, full_name, email, role, status) values
  ('eeeeeeee-0000-0000-0000-000000000001', 'ms_a', 'MS Dono A', 'ms-a@example.invalid', 'user', 'active'),
  ('eeeeeeee-0000-0000-0000-000000000002', 'ms_b', 'MS Dono B', 'ms-b@example.invalid', 'user', 'active');
insert into public.companies (id, name, business_type, status) values
  ('eeeeeeee-1000-0000-0000-000000000001', '[MSTEST] A', 'other', 'active'),
  ('eeeeeeee-1000-0000-0000-000000000002', '[MSTEST] B', 'other', 'active');
insert into public.company_members (company_id, user_id, role) values
  ('eeeeeeee-1000-0000-0000-000000000001', 'eeeeeeee-0000-0000-0000-000000000001', 'owner'),
  ('eeeeeeee-1000-0000-0000-000000000002', 'eeeeeeee-0000-0000-0000-000000000002', 'owner');
insert into public.customers (id, company_id, name) values
  ('eeeeeeee-2000-0000-0000-000000000001', 'eeeeeeee-1000-0000-0000-000000000001', 'MS Cliente');

-- um lote de pontos vencido e um válido
insert into public.loyalty_accounts (company_id, customer_id, balance)
  values ('eeeeeeee-1000-0000-0000-000000000001', 'eeeeeeee-2000-0000-0000-000000000001', 30);
insert into public.loyalty_transactions (company_id, customer_id, type, points, balance_after, source, remaining_points, expires_at) values
  ('eeeeeeee-1000-0000-0000-000000000001', 'eeeeeeee-2000-0000-0000-000000000001', 'ganho', 10, 10, 'sale', 10, now() - interval '1 day'),
  ('eeeeeeee-1000-0000-0000-000000000001', 'eeeeeeee-2000-0000-0000-000000000001', 'ganho', 20, 30, 'sale', 20, now() + interval '30 days');
delete from public.daily_maintenance;

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

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"ms_a","role":"authenticated"}', true);

select pg_temp.chk('dono registra o documento', $q$insert into public.customer_documents (id, company_id, customer_id, file_path, file_name, file_type, file_size, uploaded_by) values ('eeeeeeee-3000-0000-0000-000000000001','eeeeeeee-1000-0000-0000-000000000001','eeeeeeee-2000-0000-0000-000000000001','ms/1.pdf','a.pdf','application/pdf',5,'eeeeeeee-0000-0000-0000-000000000001') returning 'sim'$q$, 'OK=sim');
select pg_temp.chk('dono grava o conteúdo', $q$insert into public.customer_document_files values ('eeeeeeee-3000-0000-0000-000000000001','eeeeeeee-1000-0000-0000-000000000001','JVBERi0=') returning 'sim'$q$, 'OK=sim');
select pg_temp.chk('dono lê o conteúdo', $q$select data_base64 from public.customer_document_files where document_id = 'eeeeeeee-3000-0000-0000-000000000001'$q$, 'OK=JVBERi0=');
select pg_temp.chk('ninguém altera o conteúdo', $q$update public.customer_document_files set data_base64 = 'eA==' returning 'sim'$q$, 'ERR=permission denied');
select pg_temp.chk('rotina diária roda na primeira chamada', $q$select public.run_daily_maintenance()::text$q$, 'OK=true');
select pg_temp.chk('segunda chamada no mesmo dia não faz nada', $q$select public.run_daily_maintenance()::text$q$, 'OK=false');
select pg_temp.chk('pontos vencidos saíram do saldo, os válidos ficaram', $q$select balance::text from public.loyalty_accounts where customer_id = 'eeeeeeee-2000-0000-0000-000000000001'$q$, 'OK=20');
select pg_temp.chk('a expiração ficou no extrato', $q$select count(*)::text from public.loyalty_transactions where customer_id = 'eeeeeeee-2000-0000-0000-000000000001' and type = 'expirado' and points = -10$q$, 'OK=1');

select set_config('request.jwt.claims', '{"sub":"ms_b","role":"authenticated"}', true);
select pg_temp.chk('outra empresa não lê o anexo', $q$select count(*)::text from public.customer_document_files where document_id = 'eeeeeeee-3000-0000-0000-000000000001'$q$, 'OK=0');
select pg_temp.chk('outra empresa não anexa em documento alheio', $q$insert into public.customer_document_files values ('eeeeeeee-3000-0000-0000-000000000001','eeeeeeee-1000-0000-0000-000000000002','eA==') returning 'sim'$q$, 'ERR=row-level security');

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select pg_temp.chk('visitante não lê anexos', $q$select count(*)::text from public.customer_document_files$q$, 'ERR=permission denied');
select pg_temp.chk('visitante não chama a rotina', $q$select public.run_daily_maintenance()::text$q$, 'ERR=permission denied');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"ms_a","role":"authenticated"}', true);
select pg_temp.chk('dono exclui o documento', $q$delete from public.customer_documents where id = 'eeeeeeee-3000-0000-0000-000000000001' returning 'sim'$q$, 'OK=sim');
reset role;
select pg_temp.chk('o conteúdo saiu junto', $q$select count(*)::text from public.customer_document_files where document_id = 'eeeeeeee-3000-0000-0000-000000000001'$q$, 'OK=0');

do $$
declare total int; bad text;
begin
  select count(*), string_agg(label || ' => ' || got, ' | ') filter (where not ok) into total, bad from r;
  raise exception 'RESULT: % de % ok%', (select count(*) from r where ok), total, coalesce(' | FALHAS: ' || bad, '');
end $$;
rollback;
