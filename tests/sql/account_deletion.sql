-- =============================================================================
-- Bateria SQL da exclusão da própria conta — roda SOMENTE no projeto TEST.
--
-- PRÉ-REQUISITO: a migration 20261022000000_account_self_deletion já aplicada no TEST, OU este arquivo
-- concatenado depois do corpo da migration (sem o begin/commit dela).
-- Tudo dentro de UMA transação que termina em erro proposital (RESULT: {json}): nada persiste.
-- NÃO rode em Production.
-- =============================================================================
begin;

select set_config('request.jwt.claims', '{"role":"service_role"}', true);

insert into public.profiles (user_id, clerk_user_id, full_name, email, role, status) values
  ('dddddddd-0000-0000-0000-000000000001', 'ad_u1', 'U1 Dono Sozinho', 'u1@example.invalid', 'user', 'active'),
  ('dddddddd-0000-0000-0000-000000000002', 'ad_u2', 'U2 Dono com Equipe', 'u2@example.invalid', 'user', 'active'),
  ('dddddddd-0000-0000-0000-000000000003', 'ad_u3', 'U3 Funcionario', 'u3@example.invalid', 'user', 'active'),
  ('dddddddd-0000-0000-0000-000000000004', 'ad_u4', 'U4 Ex-sozinho', 'u4@example.invalid', 'user', 'active'),
  ('dddddddd-0000-0000-0000-000000000006', 'ad_u6', 'U6 Admin', 'u6@example.invalid', 'user', 'active'),
  ('dddddddd-0000-0000-0000-000000000007', 'ad_u7', 'U7 Sem Empresa', 'u7@example.invalid', 'user', 'active'),
  ('dddddddd-0000-0000-0000-000000000008', 'ad_u8', 'U8 Co-dono A', 'u8@example.invalid', 'user', 'active'),
  ('dddddddd-0000-0000-0000-000000000009', 'ad_u9', 'U9 Co-dono B', 'u9@example.invalid', 'user', 'active');
select set_config('app.platform_profile_write', 'on', true);
update public.profiles set role = 'admin' where user_id = 'dddddddd-0000-0000-0000-000000000006';
select set_config('app.platform_profile_write', 'off', true);

insert into public.companies (id, name, business_type) values
  ('cccccccc-0000-0000-0000-000000000001', 'AD Empresa 1 (U1 sozinho)', 'other'),
  ('cccccccc-0000-0000-0000-000000000002', 'AD Empresa 2 (U2 + U3)', 'other'),
  ('cccccccc-0000-0000-0000-000000000004', 'AD Empresa 4 (U8 + U9 donos)', 'other');
-- o limite de vagas não é o assunto desta bateria: desligado só dentro desta transação (que termina em erro)
alter table public.company_members disable trigger company_members_seat_limit;
insert into public.company_members (company_id, user_id, role) values
  ('cccccccc-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000001', 'owner'),
  ('cccccccc-0000-0000-0000-000000000002', 'dddddddd-0000-0000-0000-000000000002', 'owner'),
  ('cccccccc-0000-0000-0000-000000000002', 'dddddddd-0000-0000-0000-000000000003', 'employee'),
  ('cccccccc-0000-0000-0000-000000000004', 'dddddddd-0000-0000-0000-000000000008', 'owner'),
  ('cccccccc-0000-0000-0000-000000000004', 'dddddddd-0000-0000-0000-000000000009', 'owner');

-- dados de negócio
insert into public.customers (company_id, name) values
  ('cccccccc-0000-0000-0000-000000000001', 'Cliente da Empresa 1'),
  ('cccccccc-0000-0000-0000-000000000002', 'Cliente da Empresa 2');
-- venda criada pelo funcionário U3 na empresa 2 (a empresa continua depois que ele sai)
insert into public.sales (company_id, user_id)
  values ('cccccccc-0000-0000-0000-000000000002', 'dddddddd-0000-0000-0000-000000000003');
-- pagamento pago com dados do pagador (não podem sobreviver na cópia retida)
insert into public.subscription_payments (company_id, plan_id, provider, provider_transaction_id, status, amount, currency, payer_name, payer_document, paid_at)
  select 'cccccccc-0000-0000-0000-000000000001', (select id from public.plans limit 1), 'evopay', 'ad-tx-1', 'paid', 50, 'BRL', 'Fulano Pagador', '12345678900', now();
-- aceite dos termos do U1 (append-only; precisa continuar existindo)
insert into public.user_consents (user_id, consent_type, document_type, document_version_id, document_hash, context)
  select 'dddddddd-0000-0000-0000-000000000001', 'TERMS_OF_USE_ACCEPTANCE', 'TERMS_OF_USE', id, content_hash, 'SIGNUP'
    from public.legal_document_versions where document_type = 'TERMS_OF_USE' limit 1;
insert into public.user_preferences (user_id) values ('dddddddd-0000-0000-0000-000000000001');

create temp table r (n serial, grp text, label text, expect text, got text, ok boolean);
grant all on r to authenticated, anon;
grant all on sequence r_n_seq to authenticated, anon;

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
  insert into r(grp, label, expect, got, ok) values (g, l, e, left(got, 200), pass);
end $$;
grant execute on function pg_temp.chk(text, text, text, text) to authenticated, anon;

-- ============================================================ PRÉVIA E IMPEDIMENTOS
select pg_temp.chk('previa', 'U1 (único membro): empresa será apagada, sem impedimento', $q$select coalesce(p ->> 'blocked_reason', 'nenhum') || '/' || (p -> 'companies' -> 0 ->> 'will_delete') from (select public.account_deletion_preview('dddddddd-0000-0000-0000-000000000001') p) s$q$, 'OK=nenhum/true');
select pg_temp.chk('previa', 'U2 (único owner com equipe): bloqueado', $q$select public.account_deletion_preview('dddddddd-0000-0000-0000-000000000002') ->> 'blocked_reason'$q$, 'OK=OWNS_TEAM_COMPANY');
select pg_temp.chk('previa', 'U3 (funcionário): sem impedimento, empresa NÃO será apagada', $q$select coalesce(p ->> 'blocked_reason', 'nenhum') || '/' || (p -> 'companies' -> 0 ->> 'will_delete') from (select public.account_deletion_preview('dddddddd-0000-0000-0000-000000000003') p) s$q$, 'OK=nenhum/false');
select pg_temp.chk('previa', 'U8 (co-dono): sem impedimento', $q$select coalesce(public.account_deletion_preview('dddddddd-0000-0000-0000-000000000008') ->> 'blocked_reason', 'nenhum')$q$, 'OK=nenhum');
select pg_temp.chk('previa', 'admin da plataforma: bloqueado', $q$select public.account_deletion_preview('dddddddd-0000-0000-0000-000000000006') ->> 'blocked_reason'$q$, 'OK=PLATFORM_ADMIN');
select pg_temp.chk('previa', 'id inexistente: found=false', $q$select public.account_deletion_preview(gen_random_uuid()) ->> 'found'$q$, 'OK=false');

select pg_temp.chk('bloqueio', 'excluir U2 (único owner com equipe) é recusado', $q$select public.delete_account_data('dddddddd-0000-0000-0000-000000000002')$q$, 'ERR=ACCOUNT_DELETE_BLOCKED:OWNS_TEAM_COMPANY');
select pg_temp.chk('bloqueio', 'excluir admin da plataforma é recusado', $q$select public.delete_account_data('dddddddd-0000-0000-0000-000000000006')$q$, 'ERR=ACCOUNT_DELETE_BLOCKED:PLATFORM_ADMIN');
select pg_temp.chk('bloqueio', 'recusa não apagou nada (U2 intacto)', $q$select count(*)::text from public.profiles where user_id = 'dddddddd-0000-0000-0000-000000000002' and anonymized_at is null and email is not null$q$, 'OK=1');

-- ============================================================ U1: dono sozinho
select pg_temp.chk('u1', 'exclusão devolve contagens e o id do Clerk', $q$select (x ->> 'companies_deleted') || '/' || (x ->> 'companies_left') || '/' || (x ->> 'clerk_user_id') from (select public.delete_account_data('dddddddd-0000-0000-0000-000000000001') x) s$q$, 'OK=1/0/ad_u1');
select pg_temp.chk('u1', 'empresa apagada', $q$select count(*)::text from public.companies where id = 'cccccccc-0000-0000-0000-000000000001'$q$, 'OK=0');
select pg_temp.chk('u1', 'clientes da empresa apagados (cascata)', $q$select count(*)::text from public.customers where company_id = 'cccccccc-0000-0000-0000-000000000001'$q$, 'OK=0');
select pg_temp.chk('u1', 'pagamentos da empresa apagados', $q$select count(*)::text from public.subscription_payments where company_id = 'cccccccc-0000-0000-0000-000000000001'$q$, 'OK=0');
select pg_temp.chk('u1', 'cobrança guardada: 1 linha, 5 anos', $q$select count(*)::text from public.retained_billing_records where former_user_id = 'dddddddd-0000-0000-0000-000000000001' and provider_transaction_id = 'ad-tx-1' and retain_until >= (now() + interval '4 years 364 days')::date$q$, 'OK=1');
select pg_temp.chk('u1', 'a cópia retida NÃO tem colunas de nome/documento do pagador', $q$select count(*)::text from information_schema.columns where table_schema = 'public' and table_name = 'retained_billing_records' and column_name in ('payer_name','payer_document','pix_qr_code_text')$q$, 'OK=0');
select pg_temp.chk('u1', 'perfil anonimizado (sem nome, e-mail, foto, Clerk) e inativo', $q$select count(*)::text from public.profiles where user_id = 'dddddddd-0000-0000-0000-000000000001' and full_name is null and email is null and avatar_url is null and clerk_user_id is null and status = 'inactive' and anonymized_at is not null$q$, 'OK=1');
select pg_temp.chk('u1', 'aceite dos termos preservado (evidência)', $q$select count(*)::text from public.user_consents where user_id = 'dddddddd-0000-0000-0000-000000000001'$q$, 'OK=1');
select pg_temp.chk('u1', 'preferências apagadas', $q$select count(*)::text from public.user_preferences where user_id = 'dddddddd-0000-0000-0000-000000000001'$q$, 'OK=0');
select pg_temp.chk('u1', 'auditoria registrada sem dados pessoais', $q$select (metadata ->> 'companies_deleted') from public.audit_logs where entity_type = 'account' and entity_id = 'dddddddd-0000-0000-0000-000000000001' and action = 'account.self_deleted'$q$, 'OK=1');
select pg_temp.chk('u1', 'segunda exclusão: conta não encontrada', $q$select public.delete_account_data('dddddddd-0000-0000-0000-000000000001')$q$, 'ERR=ACCOUNT_NOT_FOUND');
select pg_temp.chk('u1', 'o id do Clerk não resolve mais para nenhum perfil', $q$select count(*)::text from public.profiles where clerk_user_id = 'ad_u1'$q$, 'OK=0');

-- ============================================================ U3: funcionário sai, empresa continua
select pg_temp.chk('u3', 'funcionário sai: 0 apagadas / 1 saída', $q$select (x ->> 'companies_deleted') || '/' || (x ->> 'companies_left') from (select public.delete_account_data('dddddddd-0000-0000-0000-000000000003') x) s$q$, 'OK=0/1');
select pg_temp.chk('u3', 'empresa 2 continua', $q$select count(*)::text from public.companies where id = 'cccccccc-0000-0000-0000-000000000002'$q$, 'OK=1');
select pg_temp.chk('u3', 'dados da empresa 2 continuam (cliente)', $q$select count(*)::text from public.customers where company_id = 'cccccccc-0000-0000-0000-000000000002'$q$, 'OK=1');
select pg_temp.chk('u3', 'vínculo removido', $q$select count(*)::text from public.company_members where user_id = 'dddddddd-0000-0000-0000-000000000003'$q$, 'OK=0');
select pg_temp.chk('u3', 'venda que ele criou continua, apontando para perfil anônimo', $q$select count(*)::text from public.sales s join public.profiles p on p.user_id = s.user_id where s.user_id = 'dddddddd-0000-0000-0000-000000000003' and p.email is null and p.anonymized_at is not null$q$, 'OK=1');
select pg_temp.chk('u3', 'sem pagamento: nada copiado para cobrança retida', $q$select count(*)::text from public.retained_billing_records where former_user_id = 'dddddddd-0000-0000-0000-000000000003'$q$, 'OK=0');

-- ============================================================ U2: agora sozinho, pode sair e apaga a empresa
select pg_temp.chk('u2', 'depois que a equipe saiu, U2 não é mais bloqueado', $q$select coalesce(public.account_deletion_preview('dddddddd-0000-0000-0000-000000000002') ->> 'blocked_reason', 'nenhum')$q$, 'OK=nenhum');
select pg_temp.chk('u2', 'exclusão apaga a empresa 2', $q$select (x ->> 'companies_deleted') from (select public.delete_account_data('dddddddd-0000-0000-0000-000000000002') x) s$q$, 'OK=1');
select pg_temp.chk('u2', 'empresa 2 e seus dados sumiram (inclusive a venda do ex-funcionário)', $q$select ((select count(*) from public.companies where id = 'cccccccc-0000-0000-0000-000000000002') + (select count(*) from public.sales where company_id = 'cccccccc-0000-0000-0000-000000000002') + (select count(*) from public.customers where company_id = 'cccccccc-0000-0000-0000-000000000002'))::text$q$, 'OK=0');

-- ============================================================ U7: sem empresa
select pg_temp.chk('u7', 'conta sem empresa: 0/0', $q$select (x ->> 'companies_deleted') || '/' || (x ->> 'companies_left') from (select public.delete_account_data('dddddddd-0000-0000-0000-000000000007') x) s$q$, 'OK=0/0');

-- ============================================================ U8: co-dono sai, empresa continua com U9
select pg_temp.chk('u8', 'co-dono sai: 0/1', $q$select (x ->> 'companies_deleted') || '/' || (x ->> 'companies_left') from (select public.delete_account_data('dddddddd-0000-0000-0000-000000000008') x) s$q$, 'OK=0/1');
select pg_temp.chk('u8', 'empresa 4 continua com U9', $q$select count(*)::text from public.company_members where company_id = 'cccccccc-0000-0000-0000-000000000004' and user_id = 'dddddddd-0000-0000-0000-000000000009'$q$, 'OK=1');

-- ============================================================ PERMISSÕES (usuário comum não chama)
set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"ad_u9"}', true);
select pg_temp.chk('permissao', 'authenticated NÃO executa delete_account_data', $q$select public.delete_account_data('dddddddd-0000-0000-0000-000000000009')$q$, 'ERR=permission denied');
select pg_temp.chk('permissao', 'authenticated NÃO executa a prévia', $q$select public.account_deletion_preview('dddddddd-0000-0000-0000-000000000009')$q$, 'ERR=permission denied');
select pg_temp.chk('permissao', 'authenticated NÃO lê a cobrança retida', $q$select count(*)::text from public.retained_billing_records$q$, 'ERR=permission denied');
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select pg_temp.chk('permissao', 'anon NÃO executa delete_account_data', $q$select public.delete_account_data('dddddddd-0000-0000-0000-000000000009')$q$, 'ERR=permission denied');
reset role;

do $result$
declare v jsonb;
begin
  select jsonb_build_object(
    'total', count(*),
    'pass', count(*) filter (where ok),
    'fail', count(*) filter (where not ok),
    'por_grupo', (select jsonb_object_agg(grp, jsonb_build_object('pass', p, 'fail', f)) from (select grp, count(*) filter (where ok) p, count(*) filter (where not ok) f from r group by grp) g),
    'falhas', coalesce((select jsonb_agg(jsonb_build_object('grupo', grp, 'teste', label, 'esperado', expect, 'obtido', got) order by n) from r where not ok), '[]'::jsonb)
  ) into v from r;
  raise exception 'RESULT: %', v::text;
end
$result$;
