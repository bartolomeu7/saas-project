-- =============================================================================
-- Bateria SQL de isolamento entre empresas (multi-tenant) e escalada de papel de empresa.
-- Roda SOMENTE no projeto TEST. Uma transação que termina em erro proposital (RESULT: ...): nada persiste.
--
-- Ajuste os UUIDs abaixo para dados existentes no TEST antes de rodar:
--   ATACANTE  = usuário comum (owner) de uma empresa SEM os dados do alvo;
--   FUNCIONÁRIO = membro 'employee' da empresa ALVO; ALVO = empresa com clientes e vendas.
-- Resultado esperado: "VAZAMENTOS entre empresas => nenhum" e todas as tentativas com ERR/OK=0.
-- =============================================================================
begin;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
update public.profiles set clerk_user_id = 'iso_attacker' where user_id = 'dc959a48-4136-496e-bbf9-fba7cebed805';   -- ATACANTE
update public.profiles set clerk_user_id = 'iso_employee' where user_id = '4fddea09-455a-45f8-abab-b72c06e43bd4';   -- FUNCIONÁRIO

create temp table r (n serial, label text, got text);
grant all on r to authenticated;
grant all on sequence r_n_seq to authenticated;
create temp table tgt as select 'ee7de5f5-7872-497d-b670-90daf6380aef'::uuid co,                                       -- ALVO
  (select id from public.sales where company_id = 'ee7de5f5-7872-497d-b670-90daf6380aef' limit 1) sale_id,
  (select id from public.customers where company_id = 'ee7de5f5-7872-497d-b670-90daf6380aef' limit 1) cust_id,
  (select id from public.company_members where company_id = 'ee7de5f5-7872-497d-b670-90daf6380aef' and role = 'owner' limit 1) owner_member;
grant select on tgt to authenticated;
insert into r(label, got) select 'pré-condição: dados da empresa alvo (clientes/vendas)', (select count(*) from public.customers where company_id = co) || '/' || (select count(*) from public.sales where company_id = co) from tgt;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"iso_attacker","role":"authenticated"}', true);

do $$
declare t record; n_sel bigint; n_upd bigint; n_del bigint; leaks text := ''; checked int := 0; co uuid;
begin
  select tgt.co into co from tgt;
  for t in
    select c.table_name from information_schema.columns c
      join pg_class k on k.relname = c.table_name and k.relnamespace = 'public'::regnamespace and k.relkind = 'r'
     where c.table_schema = 'public' and c.column_name = 'company_id' order by 1
  loop
    checked := checked + 1;
    begin
      execute format('select count(*) from public.%I where company_id = $1', t.table_name) into n_sel using co;
      if n_sel > 0 then leaks := leaks || t.table_name || ':SELECT=' || n_sel || ' '; end if;
    exception when others then null; end;
    begin
      execute format('with u as (update public.%I set company_id = company_id where company_id = $1 returning 1) select count(*) from u', t.table_name) into n_upd using co;
      if n_upd > 0 then leaks := leaks || t.table_name || ':UPDATE=' || n_upd || ' '; end if;
    exception when others then null; end;
    begin
      execute format('with d as (delete from public.%I where company_id = $1 returning 1) select count(*) from d', t.table_name) into n_del using co;
      if n_del > 0 then leaks := leaks || t.table_name || ':DELETE=' || n_del || ' '; end if;
    exception when others then null; end;
  end loop;
  insert into r(label, got) values ('tabelas com company_id testadas (SELECT/UPDATE/DELETE na empresa alheia)', checked::text);
  insert into r(label, got) values ('VAZAMENTOS entre empresas (vazio = nenhum)', coalesce(nullif(leaks, ''), 'nenhum'));
end $$;

create or replace function pg_temp.try(l text, q text) returns void language plpgsql as $$
declare v text;
begin
  begin execute q into v; insert into r(label, got) values (l, 'OK=' || coalesce(v, 'null'));
  exception when others then insert into r(label, got) values (l, 'ERR=' || left(sqlerrm, 110)); end;
end $$;
grant execute on function pg_temp.try(text, text) to authenticated;

select pg_temp.try('atacante: enxerga só o próprio perfil', $q$select count(*)::text from public.profiles$q$);
select pg_temp.try('atacante: lista membros da empresa alheia', $q$select count(*)::text from public.company_members where company_id = (select co from tgt)$q$);
select pg_temp.try('atacante: complete_sale em venda alheia', $q$select public.complete_sale((select sale_id from tgt))::text$q$);
select pg_temp.try('atacante: cancel_sale em venda alheia', $q$select public.cancel_sale((select sale_id from tgt), 'hack')::text$q$);
select pg_temp.try('atacante: receive_sale_payment em venda alheia', $q$select public.receive_sale_payment((select sale_id from tgt), 1, 'pix', now(), 'x')::text$q$);
select pg_temp.try('atacante: remove_company_member de empresa alheia', $q$select public.remove_company_member((select owner_member from tgt))::text$q$);
select pg_temp.try('atacante: update_company_member_role em empresa alheia', $q$select public.update_company_member_role((select owner_member from tgt), 'employee')::text$q$);
select pg_temp.try('atacante: INSERT direto de cliente na empresa alheia', $q$insert into public.customers(company_id, name) values ((select co from tgt), 'hack') returning 'inserido'$q$);
select pg_temp.try('atacante: adjust_loyalty_points em cliente alheio', $q$select public.adjust_loyalty_points((select cust_id from tgt), 100, 'hack')::text$q$);
select pg_temp.try('atacante: write_audit_log direto (forjar auditoria)', $q$select public.write_audit_log((select co from tgt), 'sale', (select sale_id from tgt), 'forged', '{}'::jsonb, null)::text$q$);

select set_config('request.jwt.claims', '{"sub":"iso_employee","role":"authenticated"}', true);
select pg_temp.try('funcionário: update_company_member_role do owner (escalada)', $q$select public.update_company_member_role((select owner_member from tgt), 'employee')::text$q$);
select pg_temp.try('funcionário: remove_company_member do owner', $q$select public.remove_company_member((select owner_member from tgt))::text$q$);
select pg_temp.try('funcionário: promover a si mesmo', $q$select public.update_company_member_role((select id from public.company_members where user_id = '4fddea09-455a-45f8-abab-b72c06e43bd4'), 'owner')::text$q$);
select pg_temp.try('funcionário: add_existing_company_member', $q$select public.add_existing_company_member('y@example.invalid', 'employee')::text$q$);
select pg_temp.try('funcionário: UPDATE direto em companies', $q$with u as (update public.companies set name = 'hack' where id = (select co from tgt) returning 1) select count(*)::text from u$q$);
select pg_temp.try('funcionário: UPDATE direto em company_members (virar owner)', $q$with u as (update public.company_members set role = 'owner' where user_id = '4fddea09-455a-45f8-abab-b72c06e43bd4' returning 1) select count(*)::text from u$q$);
select pg_temp.try('funcionário: UPDATE direto em subscriptions', $q$with u as (update public.subscriptions set expires_at = now() + interval '9999 days' where company_id = (select co from tgt) returning 1) select count(*)::text from u$q$);

reset role;
do $result$
declare v text;
begin
  select string_agg(label || ' => ' || got, E'\n' order by n) into v from r;
  raise exception E'RESULT:\n%', v;
end $result$;
