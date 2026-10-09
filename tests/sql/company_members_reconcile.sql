-- =============================================================================
-- Bateria SQL — membros/propriedade de empresas e reconciliação (Missão 08). Roda SOMENTE no projeto TEST.
-- Transação que termina em erro proposital (RESULT: ...): nada persiste.
-- Requer 20261012000000, 20261012000100 e 20261012000200 aplicadas.
-- =============================================================================
begin;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

update public.profiles set clerk_user_id = 'cm_super' where user_id = '2068cbe0-ade1-41f6-8301-ddbe2cfcb1fb';
update public.profiles set clerk_user_id = 'cm_admin' where user_id = '5280eb70-5ca1-47f2-b154-9a47dbe0b021';
update public.profiles set clerk_user_id = 'cm_user'  where user_id = 'dc959a48-4136-496e-bbf9-fba7cebed805';
select set_config('app.platform_profile_write', 'on', true);
update public.profiles set role = 'admin' where user_id = '5280eb70-5ca1-47f2-b154-9a47dbe0b021';
select set_config('app.platform_profile_write', 'off', true);

-- perfis de teste: dono A, dono B (outra empresa), três candidatos, um suspenso
insert into public.profiles (user_id, clerk_user_id, full_name, email, role, status) values
  ('cccccccc-0000-0000-0000-000000000001', 'cm_own_a', 'CM Dono A', 'cm-own-a@example.invalid', 'user', 'active'),
  ('cccccccc-0000-0000-0000-000000000002', 'cm_own_b', 'CM Dono B', 'cm-own-b@example.invalid', 'user', 'active'),
  ('cccccccc-0000-0000-0000-000000000003', 'cm_m1', 'CM Membro 1', 'cm-m1@example.invalid', 'user', 'active'),
  ('cccccccc-0000-0000-0000-000000000004', 'cm_m2', 'CM Membro 2', 'cm-m2@example.invalid', 'user', 'active'),
  ('cccccccc-0000-0000-0000-000000000005', 'cm_m3', 'CM Membro 3', 'cm-m3@example.invalid', 'user', 'active'),
  ('cccccccc-0000-0000-0000-000000000006', 'cm_susp', 'CM Suspenso', 'cm-susp@example.invalid', 'user', 'active');
select set_config('app.platform_profile_write', 'on', true);
update public.profiles set status = 'suspended' where user_id = 'cccccccc-0000-0000-0000-000000000006';
select set_config('app.platform_profile_write', 'off', true);

create temp table cos (k text primary key, id uuid);
insert into cos values ('a', gen_random_uuid()), ('b', gen_random_uuid()), ('inactive', gen_random_uuid());
insert into public.companies (id, name, business_type, status)
  select id, '[CMTEST] ' || k, 'other', (case when k = 'inactive' then 'inactive' else 'active' end)::public.company_status from cos;
insert into public.company_members (company_id, user_id, role) values
  ((select id from cos where k = 'a'), 'cccccccc-0000-0000-0000-000000000001', 'owner'),
  ((select id from cos where k = 'b'), 'cccccccc-0000-0000-0000-000000000002', 'owner');
insert into public.company_entitlements (company_id, status, max_additional_users)
  select id, 'active', 2 from cos where k in ('a', 'b');

create temp table r (n serial, grp text, label text, expect text, got text, ok boolean);
grant all on r to authenticated, anon;
grant all on sequence r_n_seq to authenticated, anon;
grant all on cos to authenticated, anon;
create or replace function pg_temp.co(k text) returns uuid language sql as $$ select id from cos where cos.k = $1 $$;
grant execute on function pg_temp.co(text) to authenticated, anon;
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
-- papéis da empresa, lidos sem RLS: "user:role,user:role" ordenado
create or replace function pg_temp.team(k text) returns text language sql security definer as $$
  select coalesce(string_agg(right(user_id::text, 1) || ':' || role::text, ',' order by user_id), '-') from public.company_members where company_id = (select id from cos where cos.k = $1) $$;
grant execute on function pg_temp.team(text) to authenticated, anon;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"cm_admin","role":"authenticated"}', true);

-- ================================================= membros (admin)
select pg_temp.chk('add', 'admin adiciona M1 como employee (chave K1)', $q$select ((public.admin_add_company_member(pg_temp.co('a'), 'CM-M1@example.invalid', 'employee', 'novo atendente', '10000000-0000-0000-0000-000000000001'))->>'replayed') || ',' || pg_temp.team('a')$q$, 'OK=false,1:owner,3:employee');
select pg_temp.chk('add', 'mesma chave: replayed=true e UM só vínculo', $q$select ((public.admin_add_company_member(pg_temp.co('a'), 'cm-m1@example.invalid', 'employee', 'novo atendente', '10000000-0000-0000-0000-000000000001'))->>'replayed') || ',' || pg_temp.team('a')$q$, 'OK=true,1:owner,3:employee');
select pg_temp.chk('add', 'admin adiciona M2 como admin da empresa', $q$select (public.admin_add_company_member(pg_temp.co('a'), 'cm-m2@example.invalid', 'admin', 'gerente', '10000000-0000-0000-0000-000000000002'))->>'role'$q$, 'OK=admin');
select pg_temp.chk('add', 'limite do plano (2 adicionais) bloqueia o terceiro', $q$select public.admin_add_company_member(pg_temp.co('a'), 'cm-m3@example.invalid', 'employee', 'estouro', '10000000-0000-0000-0000-000000000003')::text$q$, 'ERR=Limite de usuários do plano atingido');
select pg_temp.chk('add', 'usuário que já pertence a uma empresa não entra em outra', $q$select public.admin_add_company_member(pg_temp.co('b'), 'cm-m1@example.invalid', 'employee', 'duplicado', '10000000-0000-0000-0000-000000000004')::text$q$, 'ERR=já pertence a uma empresa');
select pg_temp.chk('add', 'dono de OUTRA empresa também não', $q$select public.admin_add_company_member(pg_temp.co('a'), 'cm-own-b@example.invalid', 'employee', 'cruzado', '10000000-0000-0000-0000-000000000005')::text$q$, 'ERR=já pertence a uma empresa');
select pg_temp.chk('add', 'usuário suspenso não é adicionado', $q$select public.admin_add_company_member(pg_temp.co('b'), 'cm-susp@example.invalid', 'employee', 'suspenso', '10000000-0000-0000-0000-000000000006')::text$q$, 'ERR=precisa estar ativo');
select pg_temp.chk('add', 'e-mail inexistente', $q$select public.admin_add_company_member(pg_temp.co('b'), 'ninguem@example.invalid', 'employee', 'inexistente', '10000000-0000-0000-0000-000000000007')::text$q$, 'ERR=Usuário não encontrado');
select pg_temp.chk('add', 'papel owner não é aceito aqui', $q$select public.admin_add_company_member(pg_temp.co('b'), 'cm-m3@example.invalid', 'owner', 'tentativa owner', '10000000-0000-0000-0000-000000000008')::text$q$, 'ERR=admin ou employee');
select pg_temp.chk('add', 'empresa inativa não recebe colaborador', $q$select public.admin_add_company_member(pg_temp.co('inactive'), 'cm-m3@example.invalid', 'employee', 'inativa', '10000000-0000-0000-0000-000000000009')::text$q$, 'ERR=empresa está inativa');
select pg_temp.chk('add', 'motivo obrigatório', $q$select public.admin_add_company_member(pg_temp.co('b'), 'cm-m3@example.invalid', 'employee', ' ', '10000000-0000-0000-0000-000000000010')::text$q$, 'ERR=Informe o motivo');
select pg_temp.chk('add', 'chave obrigatória', $q$select public.admin_add_company_member(pg_temp.co('b'), 'cm-m3@example.invalid', 'employee', 'sem chave', null)::text$q$, 'ERR=Chave de operação obrigatória');
select pg_temp.chk('add', 'isolamento: a empresa B continua só com o dono', $q$select pg_temp.team('b')$q$, 'OK=2:owner');
select pg_temp.chk('role', 'admin muda M2 de admin para employee', $q$select coalesce(public.admin_set_company_member_role(pg_temp.co('a'), 'cccccccc-0000-0000-0000-000000000004', 'employee', 'rebaixar')::text, '') || pg_temp.team('a')$q$, 'OK=1:owner,3:employee,4:employee');
select pg_temp.chk('role', 'mesmo papel é recusado', $q$select public.admin_set_company_member_role(pg_temp.co('a'), 'cccccccc-0000-0000-0000-000000000004', 'employee', 'repetido')::text$q$, 'ERR=já tem este papel');
select pg_temp.chk('role', 'não promove a owner por aqui', $q$select public.admin_set_company_member_role(pg_temp.co('a'), 'cccccccc-0000-0000-0000-000000000004', 'owner', 'tentativa')::text$q$, 'ERR=transferência de propriedade');
select pg_temp.chk('role', 'não mexe no papel do owner', $q$select public.admin_set_company_member_role(pg_temp.co('a'), 'cccccccc-0000-0000-0000-000000000001', 'employee', 'tentativa')::text$q$, 'ERR=transferência de propriedade');
select pg_temp.chk('role', 'membro de outra empresa não é encontrado (IDOR)', $q$select public.admin_set_company_member_role(pg_temp.co('a'), 'cccccccc-0000-0000-0000-000000000002', 'employee', 'cruzado')::text$q$, 'ERR=Colaborador não encontrado');
select pg_temp.chk('remove', 'owner não pode ser removido', $q$select public.admin_remove_company_member(pg_temp.co('a'), 'cccccccc-0000-0000-0000-000000000001', 'tentativa')::text$q$, 'ERR=Transfira a propriedade');
select pg_temp.chk('remove', 'remover M2', $q$select coalesce(public.admin_remove_company_member(pg_temp.co('a'), 'cccccccc-0000-0000-0000-000000000004', 'saiu da empresa')::text, '') || pg_temp.team('a')$q$, 'OK=1:owner,3:employee');
select pg_temp.chk('remove', 'remover quem não é membro', $q$select public.admin_remove_company_member(pg_temp.co('a'), 'cccccccc-0000-0000-0000-000000000004', 'de novo')::text$q$, 'ERR=Colaborador não encontrado');
select pg_temp.chk('remove', 'liberou vaga: M3 agora entra', $q$select (public.admin_add_company_member(pg_temp.co('a'), 'cm-m3@example.invalid', 'employee', 'reposição', '10000000-0000-0000-0000-000000000011'))->>'role'$q$, 'OK=employee');

-- ================================================= propriedade
select pg_temp.chk('owner', 'admin NÃO transfere propriedade', $q$select public.admin_transfer_company_ownership(pg_temp.co('a'), 'cccccccc-0000-0000-0000-000000000003', 'tentativa admin', gen_random_uuid())::text$q$, 'ERR=not authorized');
select set_config('request.jwt.claims', '{"sub":"cm_super","role":"authenticated"}', true);
select pg_temp.chk('owner', 'super: novo owner precisa ser membro', $q$select public.admin_transfer_company_ownership(pg_temp.co('a'), 'cccccccc-0000-0000-0000-000000000004', 'não é membro', gen_random_uuid())::text$q$, 'ERR=precisa ser membro');
select pg_temp.chk('owner', 'super: dono atual não vira "novo" dono', $q$select public.admin_transfer_company_ownership(pg_temp.co('a'), 'cccccccc-0000-0000-0000-000000000001', 'já é', gen_random_uuid())::text$q$, 'ERR=já é o único proprietário');
select pg_temp.chk('owner', 'super transfere a propriedade para M1 (chave T1)', $q$select ((public.admin_transfer_company_ownership(pg_temp.co('a'), 'cccccccc-0000-0000-0000-000000000003', 'venda do negócio', '20000000-0000-0000-0000-000000000001'))->>'replayed') || ',' || pg_temp.team('a')$q$, 'OK=false,1:admin,3:owner,5:employee');
select pg_temp.chk('owner', 'mesma chave: replayed=true e papéis intactos', $q$select ((public.admin_transfer_company_ownership(pg_temp.co('a'), 'cccccccc-0000-0000-0000-000000000003', 'venda do negócio', '20000000-0000-0000-0000-000000000001'))->>'replayed') || ',' || pg_temp.team('a')$q$, 'OK=true,1:admin,3:owner,5:employee');
select pg_temp.chk('owner', 'transferir de volta ao antigo (agora admin) funciona e continua com UM owner', $q$select (public.admin_transfer_company_ownership(pg_temp.co('a'), 'cccccccc-0000-0000-0000-000000000001', 'devolução', '20000000-0000-0000-0000-000000000002'))->>'replayed'$q$, 'OK=false');
select pg_temp.chk('owner', 'um único owner ao final', $q$select pg_temp.team('a')$q$, 'OK=1:owner,3:admin,5:employee');
reset role;
select set_config('app.platform_profile_write', 'on', true);
update public.profiles set status = 'suspended' where user_id = 'cccccccc-0000-0000-0000-000000000005';
select set_config('app.platform_profile_write', 'off', true);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"cm_super","role":"authenticated"}', true);
select pg_temp.chk('owner', 'super NÃO transfere para membro com conta suspensa', $q$select public.admin_transfer_company_ownership(pg_temp.co('a'), 'cccccccc-0000-0000-0000-000000000005', 'suspenso', gen_random_uuid())::text$q$, 'ERR=conta ativa');

-- ================================================= negado
select set_config('request.jwt.claims', '{"sub":"cm_user","role":"authenticated"}', true);
select pg_temp.chk('denied', 'usuário comum: adicionar membro', $q$select public.admin_add_company_member(pg_temp.co('b'), 'cm-m3@example.invalid', 'employee', 'tentativa', gen_random_uuid())::text$q$, 'ERR=not authorized');
select pg_temp.chk('denied', 'usuário comum: remover membro', $q$select public.admin_remove_company_member(pg_temp.co('a'), 'cccccccc-0000-0000-0000-000000000003', 'tentativa')::text$q$, 'ERR=not authorized');
select pg_temp.chk('denied', 'usuário comum: candidatos de reconciliação', $q$select count(*)::text from public.platform_reconcile_candidates()$q$, 'ERR=not authorized');
select pg_temp.chk('denied', 'usuário comum: auditoria de reconciliação', $q$select public.admin_audit_reconciliation(1, 1, 0, 0)::text$q$, 'ERR=not authorized');
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select pg_temp.chk('denied', 'anon: transferir propriedade', $q$select public.admin_transfer_company_ownership(pg_temp.co('a'), 'cccccccc-0000-0000-0000-000000000003', 'tentativa', gen_random_uuid())::text$q$, 'ERR=permission denied');
select pg_temp.chk('denied', 'anon: candidatos de reconciliação', $q$select count(*)::text from public.platform_reconcile_candidates()$q$, 'ERR=permission denied');
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- ================================================= reconciliação
insert into public.subscription_payments (company_id, plan_id, provider, status, amount, currency, provider_transaction_id, created_at)
  select (select id from cos where k = 'a'), (select id from public.plans where code = 'MONTHLY'), 'evopay', 'pending', 89, 'BRL', 'tx_rec_old', now() - interval '20 minutes';
insert into public.subscription_payments (company_id, plan_id, provider, status, amount, currency, provider_transaction_id, created_at)
  select (select id from cos where k = 'a'), (select id from public.plans where code = 'YEARLY'), 'evopay', 'pending', 899, 'BRL', 'tx_rec_new', now() - interval '3 minutes';
insert into public.subscription_payments (company_id, plan_id, provider, status, amount, currency, created_at)
  select (select id from cos where k = 'b'), (select id from public.plans where code = 'MONTHLY'), 'evopay', 'pending', 89, 'BRL', now() - interval '30 minutes';
insert into public.subscription_payments (company_id, plan_id, provider, status, amount, currency, provider_transaction_id, paid_at, created_at)
  select (select id from cos where k = 'b'), (select id from public.plans where code = 'QUARTERLY'), 'evopay', 'paid', 240, 'BRL', 'tx_rec_paid', now(), now() - interval '40 minutes';
insert into public.subscription_payments (company_id, plan_id, provider, status, amount, currency, provider_transaction_id, created_at)
  select (select id from cos where k = 'b'), (select id from public.plans where code = 'YEARLY'), 'evopay', 'pending', 899, 'BRL', 'tx_rec_ancient', now() - interval '40 days';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"cm_admin","role":"authenticated"}', true);
select pg_temp.chk('reconcile', 'candidatos (>=10 min): só a pendente antiga COM cobrança no provedor', $q$select string_agg(company_name, ',') from public.platform_reconcile_candidates(25, 10) where company_name like '[CMTEST]%'$q$, 'OK=[CMTEST] a');
select pg_temp.chk('reconcile', 'janela de 1 minuto inclui também a recente', $q$select count(*)::text from public.platform_reconcile_candidates(25, 1) where company_name like '[CMTEST]%'$q$, 'OK=2');
select pg_temp.chk('reconcile', 'limite é aplicado (máx. 50) e valores absurdos são normalizados', $q$select (count(*) <= 50)::text from public.platform_reconcile_candidates(100000, -5)$q$, 'OK=true');
select pg_temp.chk('reconcile', 'registro da reconciliação', $q$select coalesce(public.admin_audit_reconciliation(3, 1, 1, 1)::text, '')$q$, 'OK=');
select pg_temp.chk('reconcile', 'parâmetros inválidos recusados', $q$select public.admin_audit_reconciliation(-1, 0, 0, 0)::text$q$, 'ERR=Parâmetros inválidos');
reset role;
select pg_temp.chk('audit', 'auditoria das operações de membros e propriedade', $q$select ((select count(*) from public.audit_logs where action = 'platform.company.member_added') >= 3 and (select count(*) from public.audit_logs where action = 'platform.company.member_role_changed') >= 1 and (select count(*) from public.audit_logs where action = 'platform.company.member_removed') >= 1 and (select count(*) from public.audit_logs where action = 'platform.company.ownership_transferred') >= 2 and (select count(*) from public.audit_logs where action = 'platform.payment.reconciled') >= 1)::text$q$, 'OK=true');
select pg_temp.chk('audit', 'categorias: membros = ADMIN_ACTION, reconciliação = PAYMENT', $q$select public.platform_audit_category('platform.company.member_added') || ',' || public.platform_audit_category('platform.payment.reconciled')$q$, 'OK=ADMIN_ACTION,PAYMENT');
select pg_temp.chk('audit', 'sempre exatamente 1 owner nas empresas de teste', $q$select count(*)::text from (select company_id from public.company_members where company_id in (select id from cos) group by company_id having count(*) filter (where role = 'owner') <> 1) x$q$, 'OK=0');

do $result$
declare v jsonb;
begin
  select jsonb_build_object('total', count(*), 'pass', count(*) filter (where ok), 'fail', count(*) filter (where not ok),
    'falhas', coalesce((select jsonb_agg(jsonb_build_object('grupo', grp, 'teste', label, 'esperado', expect, 'obtido', got) order by n) from r where not ok), '[]'::jsonb)) into v from r;
  raise exception 'RESULT: %', v::text;
end $result$;
