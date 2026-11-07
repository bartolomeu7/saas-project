-- =============================================================================
-- Bateria SQL — verificação em duas etapas própria (20261107000000_two_factor). Roda SOMENTE no projeto TEST.
-- Transação que termina em erro proposital (RESULT: ...): nada persiste. NÃO rode em Production.
-- =============================================================================
begin;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

insert into public.profiles (user_id, clerk_user_id, full_name, email, role, status) values
  ('ffffffff-0000-0000-0000-000000000001', 'tf_u1',    'TF Com 2FA',   'tf-u1@example.invalid',    'user', 'active'),
  ('ffffffff-0000-0000-0000-000000000002', 'tf_u2',    'TF Sem 2FA',   'tf-u2@example.invalid',    'user', 'active'),
  ('ffffffff-0000-0000-0000-000000000003', 'tf_u3',    'TF Pendente',  'tf-u3@example.invalid',    'user', 'active'),
  ('ffffffff-0000-0000-0000-000000000004', 'tf_admin', 'TF Admin',     'tf-admin@example.invalid', 'user', 'active'),
  ('ffffffff-0000-0000-0000-000000000005', 'tf_super', 'TF Super',     'tf-super@example.invalid', 'user', 'active'),
  ('ffffffff-0000-0000-0000-000000000006', 'tf_super2','TF Super 2',   'tf-super2@example.invalid','user', 'active');
select set_config('app.platform_profile_write', 'on', true);
update public.profiles set role = 'admin' where user_id = 'ffffffff-0000-0000-0000-000000000004';
update public.profiles set role = 'super_admin' where user_id in ('ffffffff-0000-0000-0000-000000000005', 'ffffffff-0000-0000-0000-000000000006');
select set_config('app.platform_profile_write', 'off', true);

insert into public.user_two_factor (user_id, secret_enc, enabled, enabled_at) values
  ('ffffffff-0000-0000-0000-000000000001', 'v1.x.y.z', true, now()),
  ('ffffffff-0000-0000-0000-000000000003', 'v1.x.y.z', false, null);
insert into public.user_two_factor_backup_codes (user_id, code_hash) values ('ffffffff-0000-0000-0000-000000000001', 'hash-a');
insert into public.two_factor_session_verifications (clerk_session_id, user_id) values ('sess_ok', 'ffffffff-0000-0000-0000-000000000001');

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
create or replace function pg_temp.rows_of(uid text) returns text language sql security definer as $$
  select (select count(*) from public.user_two_factor where user_id = uid::uuid)::text || '/' ||
         (select count(*) from public.user_two_factor_backup_codes where user_id = uid::uuid)::text || '/' ||
         (select count(*) from public.two_factor_session_verifications where user_id = uid::uuid)::text $$;
grant execute on function pg_temp.rows_of(text) to authenticated, anon;
create or replace function pg_temp.audits(uid text) returns text language sql security definer as $$
  select count(*)::text from public.audit_logs where action = 'platform.user.two_factor_reset' and target_user_id = uid::uuid $$;
grant execute on function pg_temp.audits(text) to authenticated, anon;

-- ================================================= gate
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"tf_u1","role":"authenticated"}', true);
select pg_temp.chk('gate', 'com 2FA ativo e sessão NÃO verificada: exige e não está verificada', $q$select ((public.two_factor_gate_status('sess_nova')) ->> 'required') || '/' || ((public.two_factor_gate_status('sess_nova')) ->> 'verified')$q$, 'OK=true/false');
select pg_temp.chk('gate', 'sessão verificada passa', $q$select (public.two_factor_gate_status('sess_ok')) ->> 'verified'$q$, 'OK=true');
select pg_temp.chk('gate', 'a verificação de uma sessão não vale para outra', $q$select (public.two_factor_gate_status('sess_outra')) ->> 'verified'$q$, 'OK=false');
select set_config('request.jwt.claims', '{"sub":"tf_u2","role":"authenticated"}', true);
select pg_temp.chk('gate', 'sem 2FA: nada é exigido', $q$select ((public.two_factor_gate_status('qualquer')) ->> 'required') || '/' || ((public.two_factor_gate_status('qualquer')) ->> 'verified')$q$, 'OK=false/true');
select set_config('request.jwt.claims', '{"sub":"tf_u3","role":"authenticated"}', true);
select pg_temp.chk('gate', 'configuração PENDENTE (não confirmada) não bloqueia o login', $q$select (public.two_factor_gate_status('qualquer')) ->> 'required'$q$, 'OK=false');
select set_config('request.jwt.claims', '{"sub":"ninguem","role":"authenticated"}', true);
select pg_temp.chk('gate', 'sem perfil (primeiro acesso): nada exigido', $q$select (public.two_factor_gate_status('qualquer')) ->> 'required'$q$, 'OK=false');
select set_config('request.jwt.claims', '{"sub":"tf_u2","role":"authenticated"}', true);
select pg_temp.chk('gate', 'um usuário NÃO enxerga o estado de outro (a função só olha o próprio)', $q$select (public.two_factor_gate_status('sess_ok')) ->> 'required'$q$, 'OK=false');

-- ================================================= as tabelas são fechadas para o usuário comum
select set_config('request.jwt.claims', '{"sub":"tf_u1","role":"authenticated"}', true);
select pg_temp.chk('tabelas', 'authenticated NÃO lê user_two_factor', $q$select count(*)::text from public.user_two_factor$q$, 'ERR=permission denied');
select pg_temp.chk('tabelas', 'authenticated NÃO lê os códigos de backup', $q$select count(*)::text from public.user_two_factor_backup_codes$q$, 'ERR=permission denied');
select pg_temp.chk('tabelas', 'authenticated NÃO lê as verificações de sessão', $q$select count(*)::text from public.two_factor_session_verifications$q$, 'ERR=permission denied');
select pg_temp.chk('tabelas', 'authenticated NÃO se auto-verifica (insert)', $q$insert into public.two_factor_session_verifications (clerk_session_id, user_id) values ('sess_forjada', 'ffffffff-0000-0000-0000-000000000001')$q$, 'ERR=permission denied');
select pg_temp.chk('tabelas', 'authenticated NÃO desliga o próprio 2FA (update)', $q$update public.user_two_factor set enabled = false$q$, 'ERR=permission denied');
select pg_temp.chk('tabelas', 'authenticated NÃO apaga o próprio 2FA (delete)', $q$delete from public.user_two_factor$q$, 'ERR=permission denied');
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select pg_temp.chk('tabelas', 'anon NÃO executa o gate', $q$select public.two_factor_gate_status('x')::text$q$, 'ERR=permission denied');
select pg_temp.chk('tabelas', 'anon NÃO lê user_two_factor', $q$select count(*)::text from public.user_two_factor$q$, 'ERR=permission denied');
reset role;

-- ================================================= recuperação por super administrador
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"tf_u2","role":"authenticated"}', true);
select pg_temp.chk('reset', 'usuário comum NÃO remove o 2FA de ninguém', $q$select public.admin_reset_two_factor('ffffffff-0000-0000-0000-000000000001')::text$q$, 'ERR=not authorized');
select set_config('request.jwt.claims', '{"sub":"tf_admin","role":"authenticated"}', true);
select pg_temp.chk('reset', 'admin comum (não super) NÃO remove o 2FA de ninguém', $q$select public.admin_reset_two_factor('ffffffff-0000-0000-0000-000000000001')::text$q$, 'ERR=not authorized');
select set_config('request.jwt.claims', '{"sub":"tf_super","role":"authenticated"}', true);
select pg_temp.chk('reset', 'super admin NÃO remove o próprio', $q$select public.admin_reset_two_factor('ffffffff-0000-0000-0000-000000000005')::text$q$, 'ERR=própria verificação');
select pg_temp.chk('reset', 'usuário inexistente', $q$select public.admin_reset_two_factor(gen_random_uuid())::text$q$, 'ERR=Usuário não encontrado');
select pg_temp.chk('reset', 'antes: 1 segredo, 1 código de backup, 1 sessão verificada', $q$select pg_temp.rows_of('ffffffff-0000-0000-0000-000000000001')$q$, 'OK=1/1/1');
select pg_temp.chk('reset', 'super admin remove o 2FA do usuário', $q$select public.admin_reset_two_factor('ffffffff-0000-0000-0000-000000000001')::text$q$, 'OK=');
select pg_temp.chk('reset', 'depois: tudo apagado', $q$select pg_temp.rows_of('ffffffff-0000-0000-0000-000000000001')$q$, 'OK=0/0/0');
select pg_temp.chk('reset', 'auditado', $q$select pg_temp.audits('ffffffff-0000-0000-0000-000000000001')$q$, 'OK=1');
select set_config('request.jwt.claims', '{"sub":"tf_u1","role":"authenticated"}', true);
select pg_temp.chk('reset', 'depois do reset o gate não exige mais nada', $q$select (public.two_factor_gate_status('sess_nova')) ->> 'required'$q$, 'OK=false');
reset role;

-- ================================================= limite de tentativas (atômico)
insert into public.profiles (user_id, clerk_user_id, full_name, email, role, status) values
  ('ffffffff-0000-0000-0000-0000000000a1', 'tf_att', 'TF Tentativas', 'tf-att@example.invalid', 'user', 'active');
insert into public.user_two_factor (user_id, secret_enc, enabled, enabled_at) values ('ffffffff-0000-0000-0000-0000000000a1', 'v1.x.y.z', true, now());
create temp table res (n serial, v text);
do $t$
declare i int; x timestamptz;
begin
  for i in 1..7 loop
    x := public.two_factor_reserve_attempt('ffffffff-0000-0000-0000-0000000000a1');
    insert into res(v) values (case when x is null then 'livre' else 'bloqueado' end);
  end loop;
end $t$;
select pg_temp.chk('tentativas', '5 tentativas livres e a 6ª e 7ª bloqueadas', $q$select string_agg(v, ',' order by n) from res$q$, 'OK=livre,livre,livre,livre,livre,bloqueado,bloqueado');
update public.user_two_factor set locked_until = now() - interval '1 minute' where user_id = 'ffffffff-0000-0000-0000-0000000000a1';
select pg_temp.chk('tentativas', 'bloqueio expirado libera de novo', $q$select (public.two_factor_reserve_attempt('ffffffff-0000-0000-0000-0000000000a1') is null)::text$q$, 'OK=true');
select pg_temp.chk('tentativas', 'e recomeça a contagem do zero (1 falha)', $q$select failed_attempts::text from public.user_two_factor where user_id = 'ffffffff-0000-0000-0000-0000000000a1'$q$, 'OK=1');
select pg_temp.chk('tentativas', 'usuário sem 2FA configurado: erro claro', $q$select public.two_factor_reserve_attempt('ffffffff-0000-0000-0000-000000000002')::text$q$, 'ERR=two_factor_not_configured');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"tf_u1","role":"authenticated"}', true);
select pg_temp.chk('tentativas', 'authenticated NÃO chama o limitador', $q$select public.two_factor_reserve_attempt('ffffffff-0000-0000-0000-0000000000a1')::text$q$, 'ERR=permission denied');
reset role;

do $result$
declare v jsonb;
begin
  select jsonb_build_object('total', count(*), 'pass', count(*) filter (where ok), 'fail', count(*) filter (where not ok),
    'falhas', coalesce((select jsonb_agg(jsonb_build_object('teste', label, 'esperado', expect, 'obtido', got) order by n) from r where not ok), '[]'::jsonb)) into v from r;
  raise exception 'RESULT: %', v::text;
end
$result$;
