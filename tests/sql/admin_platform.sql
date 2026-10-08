-- =============================================================================
-- Bateria SQL do Admin Control Center (Missão 06) — roda SOMENTE no projeto TEST.
--
-- Executa tudo dentro de UMA transação com ROLLBACK no final: nada persiste.
-- Simula as sessões do Clerk pelo claim `sub` + `role=authenticated` (como o PostgREST
-- faz com o JWT do Clerk) e o service_role pelo claim `role=service_role`.
-- Resultado: uma linha JSON com totais por grupo e a lista de falhas (vazia = tudo certo).
--
-- Como rodar: cole o arquivo inteiro no SQL do projeto TEST (ou execute_sql do MCP).
-- NÃO rode em Production: a bateria promove perfis de teste e cria empresas fictícias
-- (tudo desfeito pelo rollback, mas o ambiente certo é TEST).
-- =============================================================================
begin;

select set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- ------------------------------------------------------------------ atores
update public.profiles set clerk_user_id = 'ap_super'  where user_id = '2068cbe0-ade1-41f6-8301-ddbe2cfcb1fb';
update public.profiles set clerk_user_id = 'ap_admin'  where user_id = '5280eb70-5ca1-47f2-b154-9a47dbe0b021';
update public.profiles set clerk_user_id = 'ap_admin2' where user_id = 'e7f8ca46-a2a6-4cf7-8b6d-fb9c59700d0a';
update public.profiles set clerk_user_id = 'ap_user'   where user_id = 'dc959a48-4136-496e-bbf9-fba7cebed805';
update public.profiles set clerk_user_id = 'ap_susp'   where user_id = '8445c8b7-3977-44df-a78f-a2f300567828';
select set_config('app.platform_profile_write', 'on', true);
update public.profiles set role = 'admin' where user_id in ('5280eb70-5ca1-47f2-b154-9a47dbe0b021', 'e7f8ca46-a2a6-4cf7-8b6d-fb9c59700d0a');
update public.profiles set status = 'suspended' where user_id = '8445c8b7-3977-44df-a78f-a2f300567828';
select set_config('app.platform_profile_write', 'off', true);

-- empresas fictícias para as operações de cobrança (uma por operação: o anti clique-duplo é por ator+ação+empresa)
create temp table ids as
  select (select id from public.plans where code = 'MONTHLY')  as monthly,
         (select id from public.plans where code = 'YEARLY')   as yearly,
         (select id from public.plans where code = 'FREE_TRIAL') as trial,
         (select id from public.plans where code = 'TEST_R1')   as inactive_plan;
create temp table cos (k text primary key, id uuid);
insert into cos select 't' || g, gen_random_uuid() from generate_series(1, 15) g;
insert into public.companies (id, name, business_type, status) select id, '[SQLTEST] ' || k, 'other', 'active' from cos;
insert into public.subscriptions (company_id, plan_id, status, starts_at, expires_at, provider)
  select c.id, (select monthly from ids), 'active', now() - interval '10 days', now() + interval '20 days', 'manual' from cos c where c.k not in ('t14', 't15');
insert into public.company_entitlements (company_id, plan_id, status, access_starts_at, access_expires_at)
  select c.id, (select monthly from ids), 'active', now() - interval '10 days', now() + interval '20 days' from cos c where c.k not in ('t14', 't15');
-- t14 e t15 ficam SEM assinatura (empresas novas)

create temp table r (n serial, grp text, label text, expect text, got text, ok boolean);
grant all on r to authenticated, anon;
grant all on sequence r_n_seq to authenticated, anon;
grant all on ids, cos to authenticated, anon;

create or replace function pg_temp.co(k text) returns uuid language sql as $$ select id from cos where cos.k = $1 $$;
grant execute on function pg_temp.co(text) to authenticated, anon;

-- chk(grupo, rótulo, consulta que devolve 1 valor, esperado)
--   'OK'            -> não deu erro
--   'OK=valor'      -> deu certo e o valor é exatamente esse
--   'OKLIKE=trecho' -> deu certo e o valor contém o trecho
--   'ERR=trecho'    -> deu erro cuja mensagem contém o trecho
create or replace function pg_temp.chk(g text, l text, q text, e text) returns void language plpgsql as $$
declare v text; got text; pass boolean;
begin
  begin
    execute q into v;
    got := 'OK=' || coalesce(v, 'null');
  exception when others then
    got := 'ERR=' || sqlerrm;
  end;
  pass := case
    when e = 'OK' then got like 'OK=%'
    when e like 'OKLIKE=%' then got like 'OK=%' and position(substr(e, 8) in got) > 0
    when e like 'OK=%' then got = e
    when e like 'ERR=%' then got like 'ERR=%' and position(substr(e, 5) in got) > 0
    else false end;
  insert into r(grp, label, expect, got, ok) values (g, l, e, left(got, 160), pass);
end $$;
grant execute on function pg_temp.chk(text, text, text, text) to authenticated, anon;

-- ================================================================ ADMIN
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"ap_admin","role":"authenticated"}', true);

-- ---- configurações
select pg_temp.chk('settings', 'admin lê configurações', $q$select count(*)::text from public.get_platform_settings()$q$, 'OK=3');
select pg_temp.chk('settings', 'admin NÃO altera configuração', $q$select public.set_platform_setting('admin_max_free_days', 15, 'x')::text$q$, 'ERR=not authorized');

-- ---- presença
select pg_temp.chk('presence', 'touch_presence do admin ativo', $q$select public.touch_presence()::text$q$, 'OK');

-- ---- usuários
select pg_temp.chk('users', 'lista total', $q$select (total_count > 0)::text from public.list_platform_admin_users() limit 1$q$, 'OK=true');
select pg_temp.chk('users', 'paginação limit 2 offset 2', $q$select count(*)::text from public.list_platform_admin_users(null,null,null,null,null,null,'created_desc',2,2)$q$, 'OK=2');
select pg_temp.chk('users', 'limit 5000 é limitado a 100', $q$select (count(*) <= 100)::text from public.list_platform_admin_users(null,null,null,null,null,null,'created_desc',5000,0)$q$, 'OK=true');
select pg_temp.chk('users', 'offset negativo vira 0', $q$select (count(*) > 0)::text from public.list_platform_admin_users(null,null,null,null,null,null,'created_desc',5,-10)$q$, 'OK=true');
select pg_temp.chk('users', 'filtro role=admin', $q$select (count(*) = count(*) filter (where role = 'admin'))::text from public.list_platform_admin_users(null,null,'admin')$q$, 'OK=true');
select pg_temp.chk('users', 'filtro status=suspended acha o suspenso', $q$select count(*)::text from public.list_platform_admin_users(null,'suspended')$q$, 'OK=1');
select pg_temp.chk('users', 'filtro assinatura=none', $q$select (count(*) = count(*) filter (where subscription_status is null))::text from public.list_platform_admin_users(null,null,null,null,'none')$q$, 'OK=true');
select pg_temp.chk('users', 'filtro assinatura inválido', $q$select count(*)::text from public.list_platform_admin_users(null,null,null,null,'zzz')$q$, 'ERR=Filtro de assinatura inválido');
select pg_temp.chk('users', 'filtro presença inválido', $q$select count(*)::text from public.list_platform_admin_users(null,null,null,null,null,'zzz')$q$, 'ERR=Filtro de presença inválido');
select pg_temp.chk('users', 'busca com % é literal (sem curinga)', $q$select count(*)::text from public.list_platform_admin_users('%')$q$, 'OK=0');
select pg_temp.chk('users', 'busca com _ é literal (sem curinga)', $q$select count(*)::text from public.list_platform_admin_users('owner_b')$q$, 'OK=0');
select pg_temp.chk('users', 'busca por e-mail', $q$select count(*)::text from public.list_platform_admin_users('owner-b')$q$, 'OK=1');
select pg_temp.chk('users', 'busca com aspas/SQL é inofensiva', $q$select count(*)::text from public.list_platform_admin_users($s$x' or '1'='1$s$)$q$, 'OK=0');
select pg_temp.chk('users', 'ordenação inválida cai no padrão (sem erro)', $q$select (count(*) > 0)::text from public.list_platform_admin_users(null,null,null,null,null,null,'; drop table profiles')$q$, 'OK=true');
select pg_temp.chk('users', 'filtro plano+assinatura+presença combinados', $q$select (count(*) >= 0)::text from public.list_platform_admin_users('a','active','user','MONTHLY','active','offline','name_asc',25,0)$q$, 'OK=true');
select pg_temp.chk('users', 'detalhe: chaves', $q$select string_agg(k, ',' order by k) from jsonb_object_keys(public.get_platform_user_detail('dc959a48-4136-496e-bbf9-fba7cebed805')) k$q$, 'OK=audit,company,payments,profile,subscription');
select pg_temp.chk('users', 'detalhe: admin NÃO vê clerk_user_id', $q$select coalesce(public.get_platform_user_detail('dc959a48-4136-496e-bbf9-fba7cebed805')->'profile'->>'clerk_user_id', 'oculto')$q$, 'OK=oculto');
select pg_temp.chk('users', 'detalhe de inexistente', $q$select public.get_platform_user_detail(gen_random_uuid())::text$q$, 'ERR=Usuário não encontrado');
select pg_temp.chk('users', 'admin edita nome de usuário comum', $q$select public.admin_update_user_profile('dc959a48-4136-496e-bbf9-fba7cebed805', 'Nome Novo')::text$q$, 'OK');
select pg_temp.chk('users', 'mesmo nome é recusado', $q$select public.admin_update_user_profile('dc959a48-4136-496e-bbf9-fba7cebed805', 'Nome Novo')::text$q$, 'ERR=O nome já é este');
select pg_temp.chk('users', 'nome vazio recusado', $q$select public.admin_update_user_profile('dc959a48-4136-496e-bbf9-fba7cebed805', '   ')::text$q$, 'ERR=Parâmetros inválidos');
select pg_temp.chk('users', 'nome > 160 recusado', $q$select public.admin_update_user_profile('dc959a48-4136-496e-bbf9-fba7cebed805', repeat('x', 161))::text$q$, 'ERR=Parâmetros inválidos');
select pg_temp.chk('users', 'admin NÃO edita super_admin', $q$select public.admin_update_user_profile('2068cbe0-ade1-41f6-8301-ddbe2cfcb1fb', 'Hack')::text$q$, 'ERR=Sem permissão');
select pg_temp.chk('users', 'admin NÃO edita outro admin', $q$select public.admin_update_user_profile('e7f8ca46-a2a6-4cf7-8b6d-fb9c59700d0a', 'Hack')::text$q$, 'ERR=Sem permissão');
select pg_temp.chk('users', 'admin edita o PRÓPRIO nome', $q$select public.admin_update_user_profile('5280eb70-5ca1-47f2-b154-9a47dbe0b021', 'Admin Renomeado')::text$q$, 'OK');
select pg_temp.chk('users', 'admin NÃO busca por e-mail (super only)', $q$select email from public.admin_find_user_by_email('teste-owner-b@primeges-teste.invalid')$q$, 'ERR=not authorized');
select pg_temp.chk('users', 'admin NÃO muda papel', $q$select public.set_platform_user_role('dc959a48-4136-496e-bbf9-fba7cebed805', 'admin')::text$q$, 'ERR=');
select pg_temp.chk('users', 'admin suspende usuário comum', $q$select public.set_platform_user_status('dc959a48-4136-496e-bbf9-fba7cebed805', 'suspended')::text$q$, 'OK');
select pg_temp.chk('users', 'admin reativa usuário comum', $q$select public.set_platform_user_status('dc959a48-4136-496e-bbf9-fba7cebed805', 'active')::text$q$, 'OK');
select pg_temp.chk('users', 'admin NÃO suspende super_admin', $q$select public.set_platform_user_status('2068cbe0-ade1-41f6-8301-ddbe2cfcb1fb', 'suspended')::text$q$, 'ERR=');
select pg_temp.chk('users', 'admin NÃO suspende a si mesmo', $q$select public.set_platform_user_status('5280eb70-5ca1-47f2-b154-9a47dbe0b021', 'suspended')::text$q$, 'ERR=');

-- ---- empresas
select pg_temp.chk('companies', 'lista total', $q$select (total_count > 0)::text from public.list_platform_admin_companies() limit 1$q$, 'OK=true');
select pg_temp.chk('companies', 'filtro assinatura=none acha t14 e t15', $q$select count(*)::text from public.list_platform_admin_companies('SQLTEST',null,null,'none')$q$, 'OK=2');
select pg_temp.chk('companies', 'filtro plano MONTHLY', $q$select count(*)::text from public.list_platform_admin_companies('SQLTEST',null,'MONTHLY')$q$, 'OK=13');
select pg_temp.chk('companies', 'filtro plano+assinatura combinados', $q$select count(*)::text from public.list_platform_admin_companies('SQLTEST','active','MONTHLY','active')$q$, 'OK=13');
select pg_temp.chk('companies', 'filtro assinatura inválido', $q$select count(*)::text from public.list_platform_admin_companies(null,null,null,'zzz')$q$, 'ERR=Filtro de assinatura inválido');
select pg_temp.chk('companies', 'paginação limit 3', $q$select count(*)::text from public.list_platform_admin_companies('SQLTEST',null,null,null,'name_asc',3,0)$q$, 'OK=3');
select pg_temp.chk('companies', 'detalhe: uso agregado', $q$select (public.get_platform_company_detail(pg_temp.co('t1'))->'usage'->>'customers')$q$, 'OK=0');
select pg_temp.chk('companies', 'detalhe de inexistente', $q$select public.get_platform_company_detail(gen_random_uuid())::text$q$, 'ERR=Empresa não encontrada');
select pg_temp.chk('companies', 'admin edita nome/tipo', $q$select public.admin_update_company(pg_temp.co('t1'), '[SQLTEST] t1 renomeada', 'bakery')::text$q$, 'OK');
select pg_temp.chk('companies', 'sem alteração recusado', $q$select public.admin_update_company(pg_temp.co('t1'), '[SQLTEST] t1 renomeada', 'bakery')::text$q$, 'ERR=Nenhuma alteração');
select pg_temp.chk('companies', 'nome vazio recusado', $q$select public.admin_update_company(pg_temp.co('t1'), ' ', 'bakery')::text$q$, 'ERR=Parâmetros inválidos');
select pg_temp.chk('companies', 'admin NÃO inativa empresa (super only)', $q$select status::text from public.set_platform_company_status(pg_temp.co('t1'), 'inactive')$q$, 'ERR=');

-- ---- acesso / dias / 30 dias
select pg_temp.chk('access', 'admin concede 7 dias', $q$select (public.admin_grant_access_days(pg_temp.co('t1'), 7, null, 'cortesia suporte'))->>'status'$q$, 'OK=active');
reset role;
select pg_temp.chk('access', '7 dias somados ao vencimento atual', $q$select (extract(epoch from (expires_at - now())) / 86400 between 26.9 and 27.1)::text from public.subscriptions where company_id = pg_temp.co('t1')$q$, 'OK=true');
set local role authenticated;
select pg_temp.chk('access', 'repetição <10s recusada', $q$select public.admin_grant_access_days(pg_temp.co('t1'), 7, null, 'cortesia suporte')::text$q$, 'ERR=Operação repetida');
select pg_temp.chk('access', 'admin acima do limite (31 > 30)', $q$select public.admin_grant_access_days(pg_temp.co('t2'), 31, null, 'excede')::text$q$, 'ERR=de 1 a 30 dias');
select pg_temp.chk('access', '0 dias recusado', $q$select public.admin_grant_access_days(pg_temp.co('t2'), 0, null, 'zero')::text$q$, 'ERR=');
select pg_temp.chk('access', 'dias negativos recusado', $q$select public.admin_grant_access_days(pg_temp.co('t2'), -5, null, 'neg')::text$q$, 'ERR=');
select pg_temp.chk('access', 'dias nulos recusado', $q$select public.admin_grant_access_days(pg_temp.co('t2'), null, null, 'nulo')::text$q$, 'ERR=');
select pg_temp.chk('access', 'sem motivo recusado', $q$select public.admin_grant_access_days(pg_temp.co('t2'), 5, null, '  ')::text$q$, 'ERR=Informe o motivo');
select pg_temp.chk('access', 'motivo > 500 recusado', $q$select public.admin_grant_access_days(pg_temp.co('t2'), 5, null, repeat('x', 501))::text$q$, 'ERR=Motivo muito longo');
select pg_temp.chk('access', 'empresa inexistente', $q$select public.admin_grant_access_days(gen_random_uuid(), 5, null, 'abc')::text$q$, 'ERR=Empresa não encontrada');
select pg_temp.chk('access', 'plano inativo recusado', $q$select public.admin_grant_access_days(pg_temp.co('t2'), 5, (select inactive_plan from ids), 'abc')::text$q$, 'ERR=plano selecionado está inativo');
select pg_temp.chk('access', 'plano inexistente recusado', $q$select public.admin_grant_access_days(pg_temp.co('t2'), 5, gen_random_uuid(), 'abc')::text$q$, 'ERR=Plano não encontrado');
select pg_temp.chk('access', 'empresa SEM assinatura exige plano', $q$select public.admin_grant_access_days(pg_temp.co('t14'), 5, null, 'nova')::text$q$, 'ERR=Informe o plano');
select pg_temp.chk('access', 'empresa SEM assinatura recebe plano + dias', $q$select (public.admin_grant_access_days(pg_temp.co('t14'), 5, (select monthly from ids), 'nova'))->>'status'$q$, 'OK=active');
reset role;
select pg_temp.chk('access', 'assinatura nasce com entitlements coerentes', $q$select count(*)::text from public.subscriptions s join public.company_entitlements e on e.company_id = s.company_id where s.company_id = pg_temp.co('t14') and e.plan_id = s.plan_id and e.status = s.status and e.access_expires_at = s.expires_at$q$, 'OK=1');
set local role authenticated;
select pg_temp.chk('access', 'liberar 30 dias', $q$select (d between 49.9 and 50.1)::text from (select extract(epoch from ((public.admin_release_30_days(pg_temp.co('t3'), null, 'acordo comercial'))->>'expires_at')::timestamptz - now()) / 86400 as d) x$q$, 'OK=true');
select pg_temp.chk('access', 'liberar 30 repetido <10s recusado', $q$select public.admin_release_30_days(pg_temp.co('t3'), null, 'acordo comercial')::text$q$, 'ERR=Operação repetida');
select pg_temp.chk('access', 'liberar 30 sem motivo', $q$select public.admin_release_30_days(pg_temp.co('t4'), null, '')::text$q$, 'ERR=Informe o motivo');
select pg_temp.chk('access', 'admin NÃO ajusta vencimento (super only)', $q$select public.admin_adjust_access_expiry(pg_temp.co('t4'), now() + interval '1 day', 'abc')::text$q$, 'ERR=not authorized');
select pg_temp.chk('access', 'admin NÃO cancela assinatura (super only)', $q$select public.admin_cancel_subscription(pg_temp.co('t4'), 'abc')::text$q$, 'ERR=not authorized');

-- ---- pagamento manual
select pg_temp.chk('manual_payment', 'registra e estende o acesso', $q$select ((public.admin_record_manual_payment(pg_temp.co('t5'), (select monthly from ids), 89, 'pix', 'REF-A', 'obs', null, true))->>'access_applied')$q$, 'OK=true');
reset role;
create temp table refs as select id, external_reference from public.subscription_payments where external_reference in ('REF-A', 'REF-B');
grant all on refs to authenticated;
select pg_temp.chk('manual_payment', 'pagamento ficou paid/manual com recorded_by e subscription_id', $q$select count(*)::text from public.subscription_payments where company_id = pg_temp.co('t5') and provider = 'manual' and status = 'paid' and recorded_by = '5280eb70-5ca1-47f2-b154-9a47dbe0b021' and amount = 89 and subscription_id is not null$q$, 'OK=1');
select pg_temp.chk('manual_payment', 'sem acesso estendido: pagamento sem subscription_id', $q$select (subscription_id is null)::text from public.subscription_payments where external_reference = 'REF-B'$q$, 'OK=true');
set local role authenticated;
select pg_temp.chk('manual_payment', 'sem estender o acesso', $q$select ((public.admin_record_manual_payment(pg_temp.co('t6'), (select monthly from ids), 50, 'cash', 'REF-B', null, null, false))->>'access_applied')$q$, 'OK=false');
select pg_temp.chk('manual_payment', 'valor negativo', $q$select public.admin_record_manual_payment(pg_temp.co('t7'), (select monthly from ids), -1, 'pix', 'R1', null, null, true)::text$q$, 'ERR=Valor inválido');
select pg_temp.chk('manual_payment', 'valor acima do máximo', $q$select public.admin_record_manual_payment(pg_temp.co('t7'), (select monthly from ids), 1000001, 'pix', 'R2', null, null, true)::text$q$, 'ERR=Valor inválido');
select pg_temp.chk('manual_payment', 'forma inválida', $q$select public.admin_record_manual_payment(pg_temp.co('t7'), (select monthly from ids), 10, 'bitcoin', 'R3', null, null, true)::text$q$, 'ERR=Forma de pagamento inválida');
select pg_temp.chk('manual_payment', 'data futura', $q$select public.admin_record_manual_payment(pg_temp.co('t7'), (select monthly from ids), 10, 'pix', 'R4', null, now() + interval '10 days', true)::text$q$, 'ERR=Data do pagamento fora');
select pg_temp.chk('manual_payment', 'data muito antiga', $q$select public.admin_record_manual_payment(pg_temp.co('t7'), (select monthly from ids), 10, 'pix', 'R5', null, now() - interval '500 days', true)::text$q$, 'ERR=Data do pagamento fora');
select pg_temp.chk('manual_payment', 'referência > 120', $q$select public.admin_record_manual_payment(pg_temp.co('t7'), (select monthly from ids), 10, 'pix', repeat('r', 121), null, null, true)::text$q$, 'ERR=Referência muito longa');
select pg_temp.chk('manual_payment', 'plano inativo', $q$select public.admin_record_manual_payment(pg_temp.co('t7'), (select inactive_plan from ids), 10, 'pix', 'R6', null, null, true)::text$q$, 'ERR=inativo');
select pg_temp.chk('manual_payment', 'empresa inexistente', $q$select public.admin_record_manual_payment(gen_random_uuid(), (select monthly from ids), 10, 'pix', 'R7', null, null, true)::text$q$, 'ERR=Empresa não encontrada');
select pg_temp.chk('manual_payment', 'admin NÃO anula pagamento', $q$select public.admin_void_manual_payment(gen_random_uuid(), 'abc')::text$q$, 'ERR=not authorized');

-- ---- plano / assinatura
select pg_temp.chk('plan_assign', 'admin troca de plano preservando vencimento', $q$select (public.admin_assign_plan(pg_temp.co('t8'), (select yearly from ids), null, 'upgrade'))->>'plan_code'$q$, 'OK=YEARLY');
reset role;
select pg_temp.chk('plan_assign', 'vencimento preservado (~20 dias)', $q$select (extract(epoch from (expires_at - now())) / 86400 between 19.9 and 20.1)::text from public.subscriptions where company_id = pg_temp.co('t8')$q$, 'OK=true');
set local role authenticated;
reset role;
select pg_temp.chk('plan_assign', 'entitlements acompanham o plano', $q$select count(*)::text from public.company_entitlements e join public.subscriptions s using (company_id) where s.company_id = pg_temp.co('t8') and e.plan_id = (select yearly from ids)$q$, 'OK=1');
set local role authenticated;
select pg_temp.chk('plan_assign', 'mesmo plano recusado', $q$select public.admin_assign_plan(pg_temp.co('t9'), (select monthly from ids), null, 'igual')::text$q$, 'ERR=já está neste plano');
select pg_temp.chk('plan_assign', 'plano inativo recusado', $q$select public.admin_assign_plan(pg_temp.co('t9'), (select inactive_plan from ids), null, 'x y z')::text$q$, 'ERR=inativo');
select pg_temp.chk('plan_assign', 'dias absurdos recusados', $q$select public.admin_assign_plan(pg_temp.co('t9'), (select yearly from ids), 99999, 'x y z')::text$q$, 'ERR=');
select pg_temp.chk('plan_assign', 'reativar assinatura já ativa', $q$select public.admin_reactivate_subscription(pg_temp.co('t9'), null, 'x y z')::text$q$, 'ERR=já está ativa');
select pg_temp.chk('plan_assign', 'reativar empresa sem assinatura', $q$select public.admin_reactivate_subscription(pg_temp.co('t15'), null, 'x y z')::text$q$, 'ERR=não possui assinatura');

-- ---- listas financeiras
select pg_temp.chk('lists', 'assinaturas: total', $q$select (total_count >= 14)::text from public.list_platform_subscriptions() limit 1$q$, 'OK=true');
select pg_temp.chk('lists', 'assinaturas: filtro estado inválido', $q$select count(*)::text from public.list_platform_subscriptions(null,'zzz')$q$, 'ERR=Filtro de estado inválido');
select pg_temp.chk('lists', 'assinaturas: janela inválida', $q$select count(*)::text from public.list_platform_subscriptions(null,null,null,null,9999)$q$, 'ERR=Janela de vencimento inválida');
select pg_temp.chk('lists', 'assinaturas: vencendo em 30 dias', $q$select (count(*) >= 0)::text from public.list_platform_subscriptions(null,null,null,null,30)$q$, 'OK=true');
select pg_temp.chk('lists', 'assinaturas: plano+estado+origem+vencimento combinados', $q$select (count(*) >= 0)::text from public.list_platform_subscriptions('SQLTEST','active','MONTHLY','manual',30,'expires_asc',25,0)$q$, 'OK=true');
select pg_temp.chk('lists', 'assinaturas: paginação', $q$select count(*)::text from public.list_platform_subscriptions('SQLTEST',null,null,null,null,'company_asc',5,0)$q$, 'OK=5');
select pg_temp.chk('lists', 'pagamentos: filtro provider manual', $q$select (count(*) = count(*) filter (where provider = 'manual'))::text from public.list_platform_payments(null,null,'manual')$q$, 'OK=true');
select pg_temp.chk('lists', 'pagamentos: resumo', $q$select (public.platform_payments_summary())->>'currency'$q$, 'OK=BRL');
select pg_temp.chk('lists', 'pagamentos: detalhe', $q$select (public.get_platform_payment_detail((select id from refs where external_reference = 'REF-A'))->'payment'->>'provider')$q$, 'OK=manual');
select pg_temp.chk('lists', 'planos: lista', $q$select (count(*) >= 5)::text from public.list_platform_plans()$q$, 'OK=true');

-- ---- auditoria
select pg_temp.chk('audit', 'admin vê só as próprias ações', $q$select (count(distinct actor_user_id) = 1)::text from public.list_platform_audit(null,null,null,null,null,null,100,0)$q$, 'OK=true');
select pg_temp.chk('audit', 'admin: categoria inválida', $q$select count(*)::text from public.list_platform_audit('NOPE')$q$, 'ERR=Categoria inválida');
select pg_temp.chk('audit', 'admin: filtro ACCESS_EXTENSION', $q$select (count(*) >= 3)::text from public.list_platform_audit('ACCESS_EXTENSION')$q$, 'OK=true');
select pg_temp.chk('audit', 'admin: filtro MANUAL_PAYMENT', $q$select (count(*) >= 2)::text from public.list_platform_audit('MANUAL_PAYMENT')$q$, 'OK=true');
select pg_temp.chk('audit', 'admin: filtro por período', $q$select (count(*) >= 1)::text from public.list_platform_audit(null,null,null,null,now() - interval '1 hour', now() + interval '1 hour')$q$, 'OK=true');
select pg_temp.chk('audit', 'metadata sem segredos', $q$select count(*)::text from public.list_platform_audit(null,null,null,null,null,null,100,0) where metadata::text ~* '(token|secret|password|jwt|authorization|api[_-]?key|cookie|payload)'$q$, 'OK=0');
select pg_temp.chk('audit', 'admin NÃO escreve auditoria direto', $q$select public.write_platform_audit_log('platform.admin.fake','profile', gen_random_uuid(), null, null, '{}'::jsonb)::text$q$, 'ERR=permission denied');
select pg_temp.chk('audit', 'admin NÃO insere em audit_logs', $q$insert into public.audit_logs(company_id, action, entity_type) values (pg_temp.co('t1'), 'x', 'y') returning 'inserido'$q$, 'ERR=');
select pg_temp.chk('audit', 'admin NÃO apaga audit_logs', $q$with d as (delete from public.audit_logs returning 1) select count(*)::text from d$q$, 'ERR=permission denied');

-- ---- dashboard / ferramentas / integrações
select pg_temp.chk('dashboard', 'dashboard: chaves', $q$select count(*)::text from jsonb_object_keys(public.get_platform_dashboard())$q$, 'OK=12');
select pg_temp.chk('dashboard', 'dashboard: séries de 30 dias', $q$select (jsonb_array_length(public.get_platform_dashboard()->'payments_by_day') = 30 and jsonb_array_length(public.get_platform_dashboard()->'signups_by_day') = 30)::text$q$, 'OK=true');
select pg_temp.chk('dashboard', 'dash_total', $q$select (public.get_platform_dashboard()->'users'->>'total')$q$, 'OK');
select pg_temp.chk('tools', 'busca global', $q$select (count(*) >= 1)::text from public.platform_global_search('SQLTEST')$q$, 'OK=true');
select pg_temp.chk('tools', 'busca curta recusada', $q$select count(*)::text from public.platform_global_search('a')$q$, 'ERR=Digite de 2 a 100');
select pg_temp.chk('tools', 'busca longa recusada', $q$select count(*)::text from public.platform_global_search(repeat('a', 101))$q$, 'ERR=Digite de 2 a 100');
select pg_temp.chk('tools', 'busca com curinga é literal', $q$select count(*)::text from public.platform_global_search('%%')$q$, 'OK=0');
select pg_temp.chk('tools', 'busca com aspas/SQL é inofensiva', $q$select count(*)::text from public.platform_global_search($s$'; drop table profiles; --$s$)$q$, 'OK=0');
select pg_temp.chk('tools', 'diagnósticos', $q$select count(*)::text from public.platform_diagnostics()$q$, 'OK=11');
select pg_temp.chk('tools', 'sincroniza entitlements', $q$select public.admin_sync_company_entitlements(pg_temp.co('t10'))::text$q$, 'OK');
select pg_temp.chk('tools', 'sincronizar sem assinatura', $q$select public.admin_sync_company_entitlements(pg_temp.co('t15'))::text$q$, 'ERR=não possui assinatura');
select pg_temp.chk('tools', 'marca vencidas como expiradas (idempotente)', $q$select public.admin_mark_expired_subscriptions()::text$q$, 'OK');
select pg_temp.chk('tools', 'segunda execução não encontra nada', $q$select public.admin_mark_expired_subscriptions()::text$q$, 'OK=0');
select pg_temp.chk('tools', 'auditoria de reverificação: resultado inválido', $q$select public.admin_audit_payment_reverify(gen_random_uuid(), 'hack')::text$q$, 'ERR=Resultado inválido');
select pg_temp.chk('tools', 'auditoria de reverificação: pagamento inexistente', $q$select public.admin_audit_payment_reverify(gen_random_uuid(), 'paid')::text$q$, 'ERR=Pagamento não encontrado');
select pg_temp.chk('integrations', 'status das integrações', $q$select string_agg(k, ',' order by k) from jsonb_object_keys(public.platform_integrations_status()) k$q$, 'OK=clerk,evopay,supabase');
select pg_temp.chk('integrations', 'entregas: filtro inválido', $q$select count(*)::text from public.list_platform_webhook_deliveries(null,'zzz')$q$, 'ERR=Filtro inválido');
select pg_temp.chk('integrations', 'entregas: lista', $q$select count(*)::text from public.list_platform_webhook_deliveries()$q$, 'OK');
select pg_temp.chk('integrations', 'eventos: lista', $q$select count(*)::text from public.list_platform_payment_events()$q$, 'OK');

-- ---- planos (admin só lê)
select pg_temp.chk('plans', 'admin NÃO cria plano', $q$select public.create_platform_plan('NOPE', 'Nope')::text$q$, 'ERR=not authorized');
select pg_temp.chk('plans', 'admin NÃO edita plano', $q$select public.update_platform_plan((select trial from ids), 'x', null, 0, 1, null, 0, true, false, false, false, false, 0)::text$q$, 'ERR=not authorized');
select pg_temp.chk('plans', 'admin NÃO muda status de plano', $q$select public.set_platform_plan_status((select monthly from ids), 'inactive')::text$q$, 'ERR=not authorized');

-- ---- DML direto (sem RPC): nada passa
select pg_temp.chk('direct_dml', 'admin NÃO altera planos direto', $q$with u as (update public.plans set price = 0 returning 1) select count(*)::text from u$q$, 'OK=0');
select pg_temp.chk('direct_dml', 'admin NÃO insere plano direto', $q$insert into public.plans(code, name) values ('HACK', 'Hack') returning 'inserido'$q$, 'ERR=');
select pg_temp.chk('direct_dml', 'admin NÃO altera assinaturas direto', $q$with u as (update public.subscriptions set expires_at = now() + interval '9999 days' returning 1) select count(*)::text from u$q$, 'OK=0');
select pg_temp.chk('direct_dml', 'admin NÃO insere assinatura direto', $q$insert into public.subscriptions(company_id, plan_id, status, starts_at, expires_at) values (gen_random_uuid(), (select monthly from ids), 'active', now(), now() + interval '1 day') returning 'inserido'$q$, 'ERR=');
select pg_temp.chk('direct_dml', 'admin NÃO altera entitlements direto', $q$with u as (update public.company_entitlements set max_additional_users = 999 returning 1) select count(*)::text from u$q$, 'OK=0');
select pg_temp.chk('direct_dml', 'admin NÃO insere pagamento direto', $q$insert into public.subscription_payments(company_id, plan_id, provider, status, amount) values (pg_temp.co('t1'), (select monthly from ids), 'manual', 'paid', 1) returning 'inserido'$q$, 'ERR=');
select pg_temp.chk('direct_dml', 'admin NÃO altera pagamentos direto', $q$with u as (update public.subscription_payments set amount = 0 returning 1) select count(*)::text from u$q$, 'OK=0');
select pg_temp.chk('direct_dml', 'admin NÃO lê platform_settings direto', $q$select count(*)::text from public.platform_settings$q$, 'ERR=permission denied');
select pg_temp.chk('direct_dml', 'admin NÃO escreve platform_settings direto', $q$insert into public.platform_settings(key, value) values ('x', '1') returning 'inserido'$q$, 'ERR=permission denied');
select pg_temp.chk('direct_dml', 'admin NÃO lê user_presence direto', $q$select count(*)::text from public.user_presence$q$, 'ERR=permission denied');
select pg_temp.chk('direct_dml', 'admin NÃO escreve user_presence direto', $q$insert into public.user_presence(user_id) values ('dc959a48-4136-496e-bbf9-fba7cebed805') returning 'inserido'$q$, 'ERR=permission denied');
select pg_temp.chk('direct_dml', 'admin NÃO lê webhook_deliveries direto', $q$select count(*)::text from public.webhook_deliveries$q$, 'ERR=permission denied');
select pg_temp.chk('direct_dml', 'admin NÃO escreve webhook_deliveries direto', $q$insert into public.webhook_deliveries(provider, outcome) values ('evopay', 'processed') returning 'inserido'$q$, 'ERR=permission denied');
select pg_temp.chk('direct_dml', 'admin NÃO se promove por UPDATE em profiles', $q$with u as (update public.profiles set role = 'super_admin' where user_id = '5280eb70-5ca1-47f2-b154-9a47dbe0b021' returning 1) select count(*)::text from u$q$, 'ERR=');
select pg_temp.chk('direct_dml', 'admin NÃO reativa suspenso por UPDATE em profiles', $q$with u as (update public.profiles set status = 'active' where user_id = '8445c8b7-3977-44df-a78f-a2f300567828' returning 1) select count(*)::text from u$q$, 'OK=0');
select pg_temp.chk('direct_dml', 'admin NÃO apaga profiles', $q$with d as (delete from public.profiles returning 1) select count(*)::text from d$q$, 'OK=0');

-- ================================================================ USUÁRIO COMUM
select set_config('request.jwt.claims', '{"sub":"ap_user","role":"authenticated"}', true);

select pg_temp.chk('user_denied', 'dashboard', $q$select public.get_platform_dashboard()::text$q$, 'ERR=not authorized');
select pg_temp.chk('user_denied', 'lista de usuários', $q$select count(*)::text from public.list_platform_admin_users()$q$, 'ERR=not authorized');
select pg_temp.chk('user_denied', 'detalhe de usuário (IDOR)', $q$select public.get_platform_user_detail('5280eb70-5ca1-47f2-b154-9a47dbe0b021')::text$q$, 'ERR=not authorized');
select pg_temp.chk('user_denied', 'lista de empresas', $q$select count(*)::text from public.list_platform_admin_companies()$q$, 'ERR=not authorized');
select pg_temp.chk('user_denied', 'detalhe de empresa (IDOR)', $q$select public.get_platform_company_detail(pg_temp.co('t1'))::text$q$, 'ERR=not authorized');
select pg_temp.chk('user_denied', 'assinaturas', $q$select count(*)::text from public.list_platform_subscriptions()$q$, 'ERR=not authorized');
select pg_temp.chk('user_denied', 'pagamentos', $q$select count(*)::text from public.list_platform_payments()$q$, 'ERR=not authorized');
select pg_temp.chk('user_denied', 'resumo de pagamentos', $q$select public.platform_payments_summary()::text$q$, 'ERR=not authorized');
select pg_temp.chk('user_denied', 'detalhe de pagamento (IDOR)', $q$select public.get_platform_payment_detail(gen_random_uuid())::text$q$, 'ERR=not authorized');
select pg_temp.chk('user_denied', 'planos (admin)', $q$select count(*)::text from public.list_platform_plans()$q$, 'ERR=not authorized');
select pg_temp.chk('user_denied', 'auditoria', $q$select count(*)::text from public.list_platform_audit()$q$, 'ERR=not authorized');
select pg_temp.chk('user_denied', 'busca global', $q$select count(*)::text from public.platform_global_search('abc')$q$, 'ERR=not authorized');
select pg_temp.chk('user_denied', 'diagnósticos', $q$select count(*)::text from public.platform_diagnostics()$q$, 'ERR=not authorized');
select pg_temp.chk('user_denied', 'integrações', $q$select public.platform_integrations_status()::text$q$, 'ERR=not authorized');
select pg_temp.chk('user_denied', 'entregas de webhook', $q$select count(*)::text from public.list_platform_webhook_deliveries()$q$, 'ERR=not authorized');
select pg_temp.chk('user_denied', 'eventos de pagamento', $q$select count(*)::text from public.list_platform_payment_events()$q$, 'ERR=not authorized');
select pg_temp.chk('user_denied', 'configurações (leitura)', $q$select count(*)::text from public.get_platform_settings()$q$, 'ERR=not authorized');
select pg_temp.chk('user_denied', 'configurações (escrita)', $q$select public.set_platform_setting('admin_max_free_days', 365, 'x')::text$q$, 'ERR=not authorized');
select pg_temp.chk('user_denied', 'conceder dias', $q$select public.admin_grant_access_days(pg_temp.co('t11'), 5, null, 'abc')::text$q$, 'ERR=not authorized');
select pg_temp.chk('user_denied', 'liberar 30 dias', $q$select public.admin_release_30_days(pg_temp.co('t11'), null, 'abc')::text$q$, 'ERR=not authorized');
select pg_temp.chk('user_denied', 'pagamento manual', $q$select public.admin_record_manual_payment(pg_temp.co('t11'), (select monthly from ids), 1, 'pix', null, null, null, true)::text$q$, 'ERR=not authorized');
select pg_temp.chk('user_denied', 'trocar plano', $q$select public.admin_assign_plan(pg_temp.co('t11'), (select yearly from ids), null, 'abc')::text$q$, 'ERR=not authorized');
select pg_temp.chk('user_denied', 'reativar', $q$select public.admin_reactivate_subscription(pg_temp.co('t11'), null, 'abc')::text$q$, 'ERR=not authorized');
select pg_temp.chk('user_denied', 'cancelar', $q$select public.admin_cancel_subscription(pg_temp.co('t11'), 'abc')::text$q$, 'ERR=not authorized');
select pg_temp.chk('user_denied', 'ajustar vencimento', $q$select public.admin_adjust_access_expiry(pg_temp.co('t11'), now() + interval '1 day', 'abc')::text$q$, 'ERR=not authorized');
select pg_temp.chk('user_denied', 'anular pagamento', $q$select public.admin_void_manual_payment(gen_random_uuid(), 'abc')::text$q$, 'ERR=not authorized');
select pg_temp.chk('user_denied', 'criar plano', $q$select public.create_platform_plan('NOPE', 'Nope')::text$q$, 'ERR=not authorized');
select pg_temp.chk('user_denied', 'editar usuário', $q$select public.admin_update_user_profile('5280eb70-5ca1-47f2-b154-9a47dbe0b021', 'Hack')::text$q$, 'ERR=not authorized');
select pg_temp.chk('user_denied', 'editar empresa', $q$select public.admin_update_company(pg_temp.co('t11'), 'Hack', 'other')::text$q$, 'ERR=not authorized');
select pg_temp.chk('user_denied', 'buscar por e-mail', $q$select email from public.admin_find_user_by_email('x@y.z')$q$, 'ERR=not authorized');
select pg_temp.chk('user_denied', 'sincronizar entitlements', $q$select public.admin_sync_company_entitlements(pg_temp.co('t11'))::text$q$, 'ERR=not authorized');
select pg_temp.chk('user_denied', 'marcar expiradas', $q$select public.admin_mark_expired_subscriptions()::text$q$, 'ERR=not authorized');
select pg_temp.chk('user_denied', 'auditar reverificação', $q$select public.admin_audit_payment_reverify(gen_random_uuid(), 'paid')::text$q$, 'ERR=not authorized');
select pg_temp.chk('user_denied', 'mudar papel de si mesmo', $q$select public.set_platform_user_role('dc959a48-4136-496e-bbf9-fba7cebed805', 'super_admin')::text$q$, 'ERR=');
select pg_temp.chk('user_denied', 'mudar status de outro', $q$select public.set_platform_user_status('5280eb70-5ca1-47f2-b154-9a47dbe0b021', 'suspended')::text$q$, 'ERR=');
select pg_temp.chk('user_denied', 'se auto-promover por UPDATE em profiles', $q$with u as (update public.profiles set role = 'super_admin' where user_id = 'dc959a48-4136-496e-bbf9-fba7cebed805' returning 1) select count(*)::text from u$q$, 'ERR=');
select pg_temp.chk('user_denied', 'listar administradores', $q$select count(*)::text from public.list_platform_administrators()$q$, 'ERR=');
select pg_temp.chk('user_denied', 'RLS: enxerga só o próprio perfil', $q$select count(*)::text from public.profiles$q$, 'OK=1');
select pg_temp.chk('user_denied', 'RLS: não vê assinaturas de outras empresas', $q$select count(*)::text from public.subscriptions where company_id = pg_temp.co('t1')$q$, 'OK=0');
select pg_temp.chk('user_denied', 'RLS: não vê pagamentos de outras empresas', $q$select count(*)::text from public.subscription_payments where company_id = pg_temp.co('t5')$q$, 'OK=0');
select pg_temp.chk('user_denied', 'RLS: não vê auditoria de outras empresas', $q$select count(*)::text from public.audit_logs where company_id = pg_temp.co('t1')$q$, 'OK=0');
select pg_temp.chk('presence', 'touch_presence do usuário ativo', $q$select public.touch_presence()::text$q$, 'OK');

-- ================================================================ SUSPENSO
select set_config('request.jwt.claims', '{"sub":"ap_susp","role":"authenticated"}', true);
select pg_temp.chk('suspended', 'touch_presence de suspenso não grava', $q$select public.touch_presence()::text$q$, 'OK');
select pg_temp.chk('suspended', 'suspenso não acessa o painel', $q$select public.get_platform_dashboard()::text$q$, 'ERR=not authorized');

-- ================================================================ ANON
set local role anon;
select pg_temp.chk('anon_denied', 'dashboard', $q$select public.get_platform_dashboard()::text$q$, 'ERR=permission denied');
select pg_temp.chk('anon_denied', 'lista de usuários', $q$select count(*)::text from public.list_platform_admin_users()$q$, 'ERR=permission denied');
select pg_temp.chk('anon_denied', 'conceder dias', $q$select public.admin_grant_access_days(pg_temp.co('t11'), 5, null, 'abc')::text$q$, 'ERR=permission denied');
select pg_temp.chk('anon_denied', 'pagamento manual', $q$select public.admin_record_manual_payment(pg_temp.co('t11'), (select monthly from ids), 1, 'pix', null, null, null, true)::text$q$, 'ERR=permission denied');
select pg_temp.chk('anon_denied', 'criar plano', $q$select public.create_platform_plan('NOPE', 'Nope')::text$q$, 'ERR=permission denied');
select pg_temp.chk('anon_denied', 'configurações', $q$select count(*)::text from public.get_platform_settings()$q$, 'ERR=permission denied');
select pg_temp.chk('anon_denied', 'presença', $q$select public.touch_presence()::text$q$, 'ERR=permission denied');
select pg_temp.chk('anon_denied', 'auditoria', $q$select count(*)::text from public.list_platform_audit()$q$, 'ERR=permission denied');
select pg_temp.chk('anon_denied', 'busca global', $q$select count(*)::text from public.platform_global_search('abc')$q$, 'ERR=permission denied');
select pg_temp.chk('anon_denied', 'tabela platform_settings', $q$select count(*)::text from public.platform_settings$q$, 'ERR=permission denied');
select pg_temp.chk('anon_denied', 'tabela webhook_deliveries', $q$select count(*)::text from public.webhook_deliveries$q$, 'ERR=permission denied');
select pg_temp.chk('anon_denied', 'planos públicos continuam legíveis', $q$select (count(*) > 0)::text from public.get_public_plans()$q$, 'OK=true');

-- ================================================================ SUPER ADMIN
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"ap_super","role":"authenticated"}', true);

select pg_temp.chk('settings', 'super lê configurações', $q$select count(*)::text from public.get_platform_settings()$q$, 'OK=3');
select pg_temp.chk('settings', 'super altera limite de dias para 10', $q$select public.set_platform_setting('admin_max_free_days', 10, 'teste')::text$q$, 'OK');
select pg_temp.chk('settings', 'valor persistido', $q$select value::text from public.get_platform_settings() where key = 'admin_max_free_days'$q$, 'OK=10');
select pg_temp.chk('settings', 'abaixo da faixa', $q$select public.set_platform_setting('admin_max_free_days', 0, 'x')::text$q$, 'ERR=');
select pg_temp.chk('settings', 'acima da faixa', $q$select public.set_platform_setting('admin_max_free_days', 366, 'x')::text$q$, 'ERR=');
select pg_temp.chk('settings', 'chave desconhecida', $q$select public.set_platform_setting('chave_inventada', 1, 'x')::text$q$, 'ERR=');
select pg_temp.chk('settings', 'coerência presença: recente deve exceder online', $q$select public.set_platform_setting('presence_recent_minutes', 5, 'x')::text from (select public.set_platform_setting('presence_online_seconds', 900, 'x')) s$q$, 'ERR=');
select set_config('request.jwt.claims', '{"sub":"ap_admin","role":"authenticated"}', true);
select pg_temp.chk('settings', 'admin respeita o NOVO limite (11 > 10)', $q$select public.admin_grant_access_days(pg_temp.co('t2'), 11, null, 'acima do novo limite')::text$q$, 'ERR=de 1 a 10 dias');
select pg_temp.chk('settings', 'admin dentro do novo limite (10)', $q$select (public.admin_grant_access_days(pg_temp.co('t2'), 10, null, 'dentro do novo limite'))->>'status'$q$, 'OK=active');
select set_config('request.jwt.claims', '{"sub":"ap_super","role":"authenticated"}', true);
select pg_temp.chk('users', 'super vê clerk_user_id', $q$select (public.get_platform_user_detail('5280eb70-5ca1-47f2-b154-9a47dbe0b021')->'profile'->>'clerk_user_id')$q$, 'OK=ap_admin');
select pg_temp.chk('users', 'super busca por e-mail (existente)', $q$select email from public.admin_find_user_by_email('TESTE-owner-b@primeges-teste.invalid')$q$, 'OK=teste-owner-b@primeges-teste.invalid');
select pg_temp.chk('users', 'super busca por e-mail (inexistente)', $q$select email from public.admin_find_user_by_email('naoexiste@x.y')$q$, 'ERR=Usuário não encontrado');
select pg_temp.chk('users', 'e-mail vazio', $q$select email from public.admin_find_user_by_email('  ')$q$, 'ERR=Parâmetros inválidos');
select pg_temp.chk('users', 'super edita nome de admin', $q$select public.admin_update_user_profile('e7f8ca46-a2a6-4cf7-8b6d-fb9c59700d0a', 'Admin Dois')::text$q$, 'OK');
select pg_temp.chk('access', 'super concede 100 dias', $q$select (d between 119.9 and 120.1)::text from (select extract(epoch from ((public.admin_grant_access_days(pg_temp.co('t12'), 100, null, 'bônus anual'))->>'expires_at')::timestamptz - now()) / 86400 as d) x$q$, 'OK=true');
select pg_temp.chk('access', 'super acima de 365', $q$select public.admin_grant_access_days(pg_temp.co('t2'), 366, null, 'abc')::text$q$, 'ERR=de 1 a 365');
select pg_temp.chk('access', 'super ajusta vencimento', $q$select (public.admin_adjust_access_expiry(pg_temp.co('t12'), now() + interval '5 days', 'correção'))->>'status'$q$, 'OK=active');
select pg_temp.chk('access', 'ajuste repetido <10s recusado', $q$select public.admin_adjust_access_expiry(pg_temp.co('t12'), now() + interval '6 days', 'correção')::text$q$, 'ERR=Operação repetida');
select pg_temp.chk('access', 'vencimento anterior ao início recusado', $q$select public.admin_adjust_access_expiry(pg_temp.co('t13'), now() - interval '100 days', 'abc')::text$q$, 'ERR=posterior ao início');
select pg_temp.chk('access', 'ajuste em empresa sem assinatura', $q$select public.admin_adjust_access_expiry(gen_random_uuid(), now() + interval '1 day', 'abc')::text$q$, 'ERR=');
select pg_temp.chk('subscription', 'super cancela', $q$select public.admin_cancel_subscription(pg_temp.co('t13'), 'inadimplência')::text$q$, 'OK');
reset role;
select pg_temp.chk('subscription', 'cancelada perde o acesso (guard do app)', $q$select (status in ('trialing','active') and expires_at > now())::text from public.subscriptions where company_id = pg_temp.co('t13')$q$, 'OK=false');
set local role authenticated;
reset role;
select pg_temp.chk('subscription', 'entitlements acompanham o cancelamento', $q$select status::text from public.company_entitlements where company_id = pg_temp.co('t13')$q$, 'OK=cancelled');
set local role authenticated;
select pg_temp.chk('subscription', 'cancelar de novo recusado', $q$select public.admin_cancel_subscription(pg_temp.co('t13'), 'inadimplência')::text$q$, 'ERR=já está cancelada');
select pg_temp.chk('subscription', 'cancelar sem assinatura', $q$select public.admin_cancel_subscription(pg_temp.co('t15'), 'x y z')::text$q$, 'ERR=não possui assinatura');
select pg_temp.chk('subscription', 'super reativa (ainda no período pago)', $q$select (public.admin_reactivate_subscription(pg_temp.co('t13'), null, 'voltou'))->>'status'$q$, 'OK=active');
select pg_temp.chk('manual_payment', 'super anula pagamento manual', $q$select public.admin_void_manual_payment((select id from refs where external_reference = 'REF-A'), 'erro de lançamento')::text$q$, 'OK');
select pg_temp.chk('manual_payment', 'anular de novo recusado', $q$select public.admin_void_manual_payment((select id from refs where external_reference = 'REF-A'), 'erro de lançamento')::text$q$, 'ERR=Somente pagamentos manuais pagos');
select pg_temp.chk('manual_payment', 'detalhe do pagamento (doc mascarado, sem QR)', $q$select (not (public.get_platform_payment_detail((select id from refs where external_reference = 'REF-A'))->'payment' ? 'pix_qr_code_text'))::text$q$, 'OK=true');
select pg_temp.chk('manual_payment', 'referência duplicada na mesma empresa', $q$select public.admin_record_manual_payment(pg_temp.co('t5'), (select monthly from ids), 89, 'pix', 'REF-A', null, null, true)::text$q$, 'ERR=Já existe um pagamento manual');
select pg_temp.chk('plans', 'super cria plano', $q$select public.create_platform_plan('SQLTEST_PLAN', 'Plano SQL Test', null, 49.9, 15, null, 2, false, true, false, false, false, 50)::text$q$, 'OK');
select pg_temp.chk('plans', 'código duplicado', $q$select public.create_platform_plan('SQLTEST_PLAN', 'Outro')::text$q$, 'ERR=Já existe um plano');
select pg_temp.chk('plans', 'código inválido', $q$select public.create_platform_plan('1bad', 'x')::text$q$, 'ERR=Código inválido');
select pg_temp.chk('plans', 'preço negativo', $q$select public.create_platform_plan('SQLTEST_NEG', 'Neg', null, -1)::text$q$, 'ERR=Preço inválido');
select pg_temp.chk('plans', 'duração zero', $q$select public.create_platform_plan('SQLTEST_Z', 'Z', null, 1, 0)::text$q$, 'ERR=Duração de acesso inválida');
select pg_temp.chk('plans', 'nome vazio', $q$select public.create_platform_plan('SQLTEST_N', ' ')::text$q$, 'ERR=Nome do plano inválido');
select pg_temp.chk('plans', 'super edita plano', $q$select public.update_platform_plan((select id from public.plans where code = 'SQLTEST_PLAN'), 'Plano SQL Test 2', null, 59.9, 20, null, 3, false, true, true, false, false, 60)::text$q$, 'OK');
select pg_temp.chk('plans', 'edição persistida', $q$select price::text from public.plans where code = 'SQLTEST_PLAN'$q$, 'OK=59.90');
select pg_temp.chk('plans', 'plano CUSTOM aceita preço/duração vazios', $q$select public.update_platform_plan((select id from public.plans where code = 'CUSTOM'), 'Sob medida', null, null, null, null, 0, false, true, true, true, true, 0)::text$q$, 'OK');
select pg_temp.chk('plans', 'plano comum NÃO aceita duração vazia', $q$select public.update_platform_plan((select id from public.plans where code = 'SQLTEST_PLAN'), 'x', null, 1, null, null, 0, false, false, false, false, false, 0)::text$q$, 'ERR=Duração de acesso obrigatória');
select pg_temp.chk('plans', 'não altera trial de plano já utilizado', $q$select public.update_platform_plan((select trial from ids), 'Teste grátis', null, 0, 1, null, 0, false, false, false, false, false, 0)::text$q$, 'ERR=Não é possível alterar o tipo');
select pg_temp.chk('plans', 'não desativa plano do sistema', $q$select public.set_platform_plan_status((select trial from ids), 'inactive')::text$q$, 'ERR=Planos do sistema');
select pg_temp.chk('plans', 'desativa plano criado', $q$select public.set_platform_plan_status((select id from public.plans where code = 'SQLTEST_PLAN'), 'inactive')::text$q$, 'OK');
select pg_temp.chk('plans', 'mesmo status recusado', $q$select public.set_platform_plan_status((select id from public.plans where code = 'SQLTEST_PLAN'), 'inactive')::text$q$, 'ERR=já está neste status');
select pg_temp.chk('plans', 'plano inativo não pode ser atribuído', $q$select public.admin_assign_plan(pg_temp.co('t9'), (select id from public.plans where code = 'SQLTEST_PLAN'), null, 'x y z')::text$q$, 'ERR=inativo');
select pg_temp.chk('plans', 'plano nunca é excluído (sem DELETE)', $q$with d as (delete from public.plans returning 1) select count(*)::text from d$q$, 'OK=0');
select pg_temp.chk('companies', 'super inativa empresa', $q$select status::text from public.set_platform_company_status(pg_temp.co('t2'), 'inactive')$q$, 'OK=inactive');
select pg_temp.chk('companies', 'super reativa empresa', $q$select status::text from public.set_platform_company_status(pg_temp.co('t2'), 'active')$q$, 'OK=active');
select pg_temp.chk('audit', 'super vê auditoria de vários atores', $q$select (count(distinct actor_user_id) >= 2)::text from public.list_platform_audit(null,null,null,null,null,null,100,0)$q$, 'OK=true');
select pg_temp.chk('audit', 'super: categorias presentes', $q$select string_agg(distinct category, ',' order by category) from public.list_platform_audit(null,null,null,null,null,null,100,0) where action like 'platform.%'$q$, 'OKLIKE=ACCESS_EXTENSION');
select pg_temp.chk('audit', 'super: PLAN_CHANGE', $q$select (count(*) >= 3)::text from public.list_platform_audit('PLAN_CHANGE')$q$, 'OK=true');
select pg_temp.chk('audit', 'super: SUBSCRIPTION_CHANGE', $q$select (count(*) >= 1)::text from public.list_platform_audit('SUBSCRIPTION_CHANGE')$q$, 'OK=true');
select pg_temp.chk('audit', 'super: ADMIN_ACTION', $q$select (count(*) >= 1)::text from public.list_platform_audit('ADMIN_ACTION')$q$, 'OK=true');
select pg_temp.chk('audit', 'super: busca por texto', $q$select (count(*) >= 1)::text from public.list_platform_audit(null,'manual_recorded')$q$, 'OK=true');
select pg_temp.chk('dashboard', 'super: dashboard', $q$select (public.get_platform_dashboard()->'revenue'->>'currency')$q$, 'OK=BRL');
select pg_temp.chk('administrators', 'lista administradores', $q$select (count(*) >= 3)::text from public.list_platform_administrators()$q$, 'OK=true');
select pg_temp.chk('administrators', 'super NÃO altera o próprio papel', $q$select public.set_platform_user_role('2068cbe0-ade1-41f6-8301-ddbe2cfcb1fb', 'user')::text$q$, 'ERR=');
select pg_temp.chk('administrators', 'super NÃO altera o próprio status', $q$select public.set_platform_user_status('2068cbe0-ade1-41f6-8301-ddbe2cfcb1fb', 'suspended')::text$q$, 'ERR=');
select pg_temp.chk('administrators', 'super promove usuário', $q$select public.set_platform_user_role('dc959a48-4136-496e-bbf9-fba7cebed805', 'admin')::text$q$, 'OK');
select pg_temp.chk('administrators', 'super rebaixa admin', $q$select public.set_platform_user_role('dc959a48-4136-496e-bbf9-fba7cebed805', 'user')::text$q$, 'OK');

-- ================================================================ ÚLTIMO SUPER_ADMIN (mesmo via service_role)
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select set_config('app.platform_profile_write', 'on', true);
-- deixa APENAS 2068... como super_admin ativo
update public.profiles set role = 'admin' where role = 'super_admin' and user_id <> '2068cbe0-ade1-41f6-8301-ddbe2cfcb1fb';
select pg_temp.chk('last_super', 'rebaixar o último super_admin (service_role)', $q$with u as (update public.profiles set role = 'user' where user_id = '2068cbe0-ade1-41f6-8301-ddbe2cfcb1fb' returning 1) select count(*)::text from u$q$, 'ERR=');
select pg_temp.chk('last_super', 'suspender o último super_admin (service_role)', $q$with u as (update public.profiles set status = 'suspended' where user_id = '2068cbe0-ade1-41f6-8301-ddbe2cfcb1fb' returning 1) select count(*)::text from u$q$, 'ERR=');
select pg_temp.chk('last_super', 'inativar o último super_admin (service_role)', $q$with u as (update public.profiles set status = 'inactive' where user_id = '2068cbe0-ade1-41f6-8301-ddbe2cfcb1fb' returning 1) select count(*)::text from u$q$, 'ERR=');
select pg_temp.chk('last_super', 'apagar o último super_admin (service_role)', $q$with d as (delete from public.profiles where user_id = '2068cbe0-ade1-41f6-8301-ddbe2cfcb1fb' returning 1) select count(*)::text from d$q$, 'ERR=');
select pg_temp.chk('last_super', 'ainda existe 1 super_admin ativo', $q$select count(*)::text from public.profiles where role = 'super_admin' and status = 'active'$q$, 'OK=1');
select set_config('app.platform_profile_write', 'off', true);

-- ================================================================ GRANTS / EXPOSIÇÃO / ESTADO FINAL
reset role;
select pg_temp.chk('dashboard', 'total de usuários do dashboard = linhas de profiles', $q$select ((select substr(got, 4)::int from r where label = 'dash_total') = (select count(*) from public.profiles))::text$q$, 'OK=true');
select pg_temp.chk('manual_payment', 'anulado = cancelled (linha preservada)', $q$select status::text from public.subscription_payments where external_reference = 'REF-A'$q$, 'OK=cancelled');
select pg_temp.chk('presence', 'usuário ativo tem presença gravada', $q$select count(*)::text from public.user_presence where user_id = 'dc959a48-4136-496e-bbf9-fba7cebed805'$q$, 'OK=1');
select pg_temp.chk('presence', 'suspenso NÃO grava presença', $q$select count(*)::text from public.user_presence where user_id = '8445c8b7-3977-44df-a78f-a2f300567828'$q$, 'OK=0');
select pg_temp.chk('consistency', 'subscriptions x entitlements coerentes em todas as empresas', $q$select count(*)::text from public.subscriptions s join public.company_entitlements e on e.company_id = s.company_id where e.plan_id <> s.plan_id or e.status <> s.status or e.access_expires_at <> s.expires_at$q$, 'OK=0');
select pg_temp.chk('audit_coverage', 'conceder dias', $q$select (count(*) >= 1)::text from public.audit_logs where action = 'platform.access.days_granted'$q$, 'OK=true');
select pg_temp.chk('audit_coverage', 'liberar 30 dias', $q$select (count(*) >= 1)::text from public.audit_logs where action = 'platform.access.thirty_days_released'$q$, 'OK=true');
select pg_temp.chk('audit_coverage', 'ajustar vencimento', $q$select (count(*) >= 1)::text from public.audit_logs where action = 'platform.access.expiry_adjusted'$q$, 'OK=true');
select pg_temp.chk('audit_coverage', 'pagamento manual', $q$select (count(*) >= 1)::text from public.audit_logs where action = 'platform.payment.manual_recorded'$q$, 'OK=true');
select pg_temp.chk('audit_coverage', 'anular pagamento', $q$select (count(*) >= 1)::text from public.audit_logs where action = 'platform.payment.manual_voided'$q$, 'OK=true');
select pg_temp.chk('audit_coverage', 'trocar plano', $q$select (count(*) >= 1)::text from public.audit_logs where action = 'platform.subscription.plan_changed'$q$, 'OK=true');
select pg_temp.chk('audit_coverage', 'cancelar assinatura', $q$select (count(*) >= 1)::text from public.audit_logs where action = 'platform.subscription.cancelled'$q$, 'OK=true');
select pg_temp.chk('audit_coverage', 'reativar assinatura', $q$select (count(*) >= 1)::text from public.audit_logs where action = 'platform.subscription.reactivated'$q$, 'OK=true');
select pg_temp.chk('audit_coverage', 'criar plano', $q$select (count(*) >= 1)::text from public.audit_logs where action = 'platform.plan.created'$q$, 'OK=true');
select pg_temp.chk('audit_coverage', 'editar plano', $q$select (count(*) >= 1)::text from public.audit_logs where action = 'platform.plan.updated'$q$, 'OK=true');
select pg_temp.chk('audit_coverage', 'status do plano', $q$select (count(*) >= 1)::text from public.audit_logs where action = 'platform.plan.status_changed'$q$, 'OK=true');
select pg_temp.chk('audit_coverage', 'editar empresa', $q$select (count(*) >= 1)::text from public.audit_logs where action = 'platform.company.updated'$q$, 'OK=true');
select pg_temp.chk('audit_coverage', 'editar perfil', $q$select (count(*) >= 1)::text from public.audit_logs where action = 'platform.user.profile_updated'$q$, 'OK=true');
select pg_temp.chk('audit_coverage', 'sincronizar entitlements', $q$select (count(*) >= 1)::text from public.audit_logs where action = 'platform.admin.entitlements_synced'$q$, 'OK=true');
select pg_temp.chk('audit_coverage', 'configuração', $q$select (count(*) >= 1)::text from public.audit_logs where action = 'platform.settings.updated'$q$, 'OK=true');
select pg_temp.chk('audit_coverage', 'papel', $q$select (count(*) >= 2)::text from public.audit_logs where action = 'platform.user.role_changed'$q$, 'OK=true');
select pg_temp.chk('audit_coverage', 'status do usuário', $q$select (count(*) >= 2)::text from public.audit_logs where action = 'platform.user.status_changed'$q$, 'OK=true');
select pg_temp.chk('audit_coverage', 'status da empresa', $q$select (count(*) >= 3)::text from public.audit_logs where action like 'platform.company%'$q$, 'OK=true');
select pg_temp.chk('consistency', 'toda operação gerou auditoria com ator', $q$select count(*)::text from public.audit_logs where action like 'platform.%' and actor_user_id is null$q$, 'OK=0');
select pg_temp.chk('grants', 'anon não executa NENHUMA função admin nova', $q$select count(*)::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and (p.proname like 'admin\_%' or p.proname like 'list\_platform%' or p.proname like 'get\_platform%' or p.proname like 'platform\_%' or p.proname like '%\_platform\_%') and has_function_privilege('anon', p.oid, 'execute')$q$, 'OK=0');
select pg_temp.chk('grants', 'helpers internos não são executáveis por authenticated', $q$select count(*)::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname in ('platform_apply_access','platform_extend_access_core','platform_assert_not_repeated','platform_assert_company','platform_clean_reason','platform_safe_metadata','platform_setting_int','platform_presence_status','platform_audit_category','platform_validate_plan_fields','write_platform_audit_log','platform_setting_definitions','protect_last_super_admin','webhook_deliveries_prune') and has_function_privilege('authenticated', p.oid, 'execute')$q$, 'OK=0');
select pg_temp.chk('grants', 'todas as funções admin são SECURITY DEFINER com search_path fixo', $q$select count(*)::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and (p.proname like 'admin\_%' or p.proname like 'list\_platform%' or p.proname like 'get\_platform%') and (not p.prosecdef or p.proconfig is null or not (p.proconfig::text like '%search_path=public%'))$q$, 'OK=0');
select pg_temp.chk('grants', 'tabelas novas com RLS ligada', $q$select count(*)::text from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname in ('platform_settings','user_presence','webhook_deliveries') and not c.relrowsecurity$q$, 'OK=0');
select pg_temp.chk('grants', 'tabelas novas sem policy (acesso só por RPC)', $q$select count(*)::text from pg_policies where schemaname = 'public' and tablename in ('platform_settings','user_presence','webhook_deliveries')$q$, 'OK=0');
select pg_temp.chk('grants', 'authenticated sem privilégio de tabela nas novas', $q$select count(*)::text from information_schema.role_table_grants where table_schema = 'public' and table_name in ('platform_settings','user_presence','webhook_deliveries') and grantee in ('anon','authenticated')$q$, 'OK=0');
select pg_temp.chk('grants', 'categorias de auditoria', $q$select string_agg(public.platform_audit_category(a), ',' order by a collate "C") from unnest(array['platform.user.role_changed','platform.user.status_changed','platform.user.profile_updated','platform.access.days_granted','platform.subscription.plan_changed','platform.plan.created','platform.subscription.cancelled','platform.payment.manual_recorded','platform.payment.reverified','platform.admin.entitlements_synced','platform.webhook.x','platform.integration.x','sale.completed']) a$q$,
  'OK=ACCESS_EXTENSION,ADMIN_ACTION,INTEGRATION,MANUAL_PAYMENT,PAYMENT,PLAN_CHANGE,SUBSCRIPTION_CHANGE,PLAN_CHANGE,USER_MANAGEMENT,ROLE_CHANGE,STATUS_CHANGE,WEBHOOK,SYSTEM');
select pg_temp.chk('grants', 'platform_safe_metadata remove chaves sensíveis', $q$select public.platform_safe_metadata('{"ok":1,"token":"x","api_key":"y","Authorization":"z","payload":{},"user_password":"p","cookie":"c","jwt":"j","secret":"s"}'::jsonb)::text$q$, 'OK={"ok": 1}');
select pg_temp.chk('grants', 'status de presença', $q$select public.platform_presence_status(now())||','||public.platform_presence_status(now() - interval '5 minutes')||','||public.platform_presence_status(now() - interval '5 hours')||','||coalesce(public.platform_presence_status(null), 'nulo')$q$, 'OK=online,recent,offline,offline');

-- ================================================================ RESULTADO
select jsonb_pretty(jsonb_build_object(
  'total', count(*),
  'pass', count(*) filter (where ok),
  'fail', count(*) filter (where not ok),
  'por_grupo', (select jsonb_object_agg(grp, jsonb_build_object('pass', p, 'fail', f)) from (select grp, count(*) filter (where ok) p, count(*) filter (where not ok) f from r group by grp) g),
  'falhas', coalesce((select jsonb_agg(jsonb_build_object('grupo', grp, 'teste', label, 'esperado', expect, 'obtido', got) order by n) from r where not ok), '[]'::jsonb)
)) as resultado from r;

rollback;
