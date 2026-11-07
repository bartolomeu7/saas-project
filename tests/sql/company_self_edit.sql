-- =============================================================================
-- Bateria SQL — editar a própria empresa (update_own_company). Roda SOMENTE no projeto TEST.
-- Requer 20261106000000_company_self_edit aplicada. Transação que termina em erro proposital (RESULT: ...):
-- nada persiste. NÃO rode em Production.
-- =============================================================================
begin;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

insert into public.profiles (user_id, clerk_user_id, full_name, email, role, status) values
  ('eeeeeeee-0000-0000-0000-000000000001', 'ce_owner',   'CE Dono',        'ce-owner@example.invalid',   'user', 'active'),
  ('eeeeeeee-0000-0000-0000-000000000002', 'ce_admin',   'CE Admin',       'ce-admin@example.invalid',   'user', 'active'),
  ('eeeeeeee-0000-0000-0000-000000000003', 'ce_staff',   'CE Funcionario', 'ce-staff@example.invalid',   'user', 'active'),
  ('eeeeeeee-0000-0000-0000-000000000004', 'ce_outsider','CE Sem empresa', 'ce-outsider@example.invalid','user', 'active'),
  ('eeeeeeee-0000-0000-0000-000000000005', 'ce_other',   'CE Outra empresa','ce-other@example.invalid',  'user', 'active');

insert into public.companies (id, name, business_type, status) values
  ('eeeeeeee-1000-0000-0000-000000000001', '[CETEST] Empresa A', 'bakery', 'active'),
  ('eeeeeeee-1000-0000-0000-000000000002', '[CETEST] Empresa B', 'other',  'active');
alter table public.company_members disable trigger company_members_seat_limit;
insert into public.company_members (company_id, user_id, role) values
  ('eeeeeeee-1000-0000-0000-000000000001', 'eeeeeeee-0000-0000-0000-000000000001', 'owner'),
  ('eeeeeeee-1000-0000-0000-000000000001', 'eeeeeeee-0000-0000-0000-000000000002', 'admin'),
  ('eeeeeeee-1000-0000-0000-000000000001', 'eeeeeeee-0000-0000-0000-000000000003', 'employee'),
  ('eeeeeeee-1000-0000-0000-000000000002', 'eeeeeeee-0000-0000-0000-000000000005', 'owner');

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
-- leitura sem RLS
create or replace function pg_temp.co(cid text) returns text language sql security definer as $$
  select name || '|' || business_type::text || '|' || status::text from public.companies where id = cid::uuid $$;
grant execute on function pg_temp.co(text) to authenticated, anon;
create or replace function pg_temp.audits(cid text) returns text language sql security definer as $$
  select count(*)::text from public.audit_logs where company_id = cid::uuid and action = 'company.updated' $$;
grant execute on function pg_temp.audits(text) to authenticated, anon;

-- ================================================= dono
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"ce_owner","role":"authenticated"}', true);
select pg_temp.chk('dono', 'altera nome e segmento (espaços nas pontas são removidos)', $q$select (public.update_own_company('  Padaria Nova  ', 'grocery')).name$q$, 'OK=Padaria Nova');
select pg_temp.chk('dono', 'ficou gravado e o status NÃO mudou', $q$select pg_temp.co('eeeeeeee-1000-0000-0000-000000000001')$q$, 'OK=Padaria Nova|grocery|active');
select pg_temp.chk('dono', 'auditoria registrada (1)', $q$select pg_temp.audits('eeeeeeee-1000-0000-0000-000000000001')$q$, 'OK=1');
select pg_temp.chk('dono', 'salvar igual não duplica a auditoria', $q$select (public.update_own_company('Padaria Nova', 'grocery')).name$q$, 'OK=Padaria Nova');
select pg_temp.chk('dono', 'ainda 1 registro de auditoria', $q$select pg_temp.audits('eeeeeeee-1000-0000-0000-000000000001')$q$, 'OK=1');
select pg_temp.chk('dono', 'nome vazio é recusado', $q$select (public.update_own_company('   ', 'grocery')).name$q$, 'ERR=Informe o nome da empresa');
select pg_temp.chk('dono', 'nome com mais de 160 caracteres é recusado', $q$select (public.update_own_company(repeat('x', 161), 'grocery')).name$q$, 'ERR=no máximo 160');
select pg_temp.chk('dono', 'nome com exatamente 160 caracteres é aceito', $q$select char_length((public.update_own_company(repeat('y', 160), 'grocery')).name)::text$q$, 'OK=160');
select pg_temp.chk('dono', 'segmento nulo é recusado', $q$select (public.update_own_company('Padaria Nova', null)).name$q$, 'ERR=Selecione o segmento');

-- ================================================= admin da empresa
select set_config('request.jwt.claims', '{"sub":"ce_admin","role":"authenticated"}', true);
select pg_temp.chk('admin', 'administrador da empresa também altera', $q$select (public.update_own_company('Padaria do Admin', 'bakery')).name$q$, 'OK=Padaria do Admin');

-- ================================================= funcionário, sem empresa, anônimo
select set_config('request.jwt.claims', '{"sub":"ce_staff","role":"authenticated"}', true);
select pg_temp.chk('negado', 'funcionário NÃO altera', $q$select (public.update_own_company('Hack', 'other')).name$q$, 'ERR=Apenas o proprietário');
select set_config('request.jwt.claims', '{"sub":"ce_outsider","role":"authenticated"}', true);
select pg_temp.chk('negado', 'usuário sem empresa NÃO altera', $q$select (public.update_own_company('Hack', 'other')).name$q$, 'ERR=Nenhuma empresa');
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select pg_temp.chk('negado', 'anon NÃO executa', $q$select (public.update_own_company('Hack', 'other')).name$q$, 'ERR=permission denied');
reset role;

-- ================================================= isolamento entre empresas
select pg_temp.chk('isolamento', 'a empresa B continua intacta', $q$select pg_temp.co('eeeeeeee-1000-0000-0000-000000000002')$q$, 'OK=[CETEST] Empresa B|other|active');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"ce_other","role":"authenticated"}', true);
select pg_temp.chk('isolamento', 'dono da B altera só a B', $q$select (public.update_own_company('B Renomeada', 'workshop')).id::text$q$, 'OK=eeeeeeee-1000-0000-0000-000000000002');
reset role;
select pg_temp.chk('isolamento', 'a empresa A não foi tocada pela B', $q$select split_part(pg_temp.co('eeeeeeee-1000-0000-0000-000000000001'), '|', 1)$q$, 'OK=Padaria do Admin');

-- ================================================= sem escrita direta na tabela
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"ce_owner","role":"authenticated"}', true);
select pg_temp.chk('rls', 'UPDATE direto em companies não altera nenhuma linha (sem policy)', $q$with u as (update public.companies set name = 'direto' where id = 'eeeeeeee-1000-0000-0000-000000000001' returning 1) select count(*)::text from u$q$, 'OK=0');
reset role;

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
