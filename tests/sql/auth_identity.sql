-- =============================================================================
-- Bateria SQL de identidade (Clerk -> perfil interno) — roda SOMENTE no projeto TEST.
-- Uma transação que termina em erro proposital (RESULT: ...): nada persiste.
-- Simula o JWT do Clerk pelo claim `sub` + `role=authenticated`. O login/logout/renovação reais dependem de uma
-- sessão do Clerk (não coberta aqui). Cobre: perfil novo sem duplicar, suspenso/inativo nunca recriado nem reativado,
-- JWT sem claims, papel anon.
-- =============================================================================
begin;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
insert into public.profiles (user_id, clerk_user_id, full_name, email, role, status) values
  ('bbbbbbbb-0000-0000-0000-000000000001', 'au_susp', 'AU Susp', 'au-susp@example.invalid', 'user', 'active'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'au_inact', 'AU Inact', 'au-inact@example.invalid', 'user', 'active');
select set_config('app.platform_profile_write', 'on', true);
update public.profiles set status = 'suspended' where user_id = 'bbbbbbbb-0000-0000-0000-000000000001';
update public.profiles set status = 'inactive' where user_id = 'bbbbbbbb-0000-0000-0000-000000000002';
select set_config('app.platform_profile_write', 'off', true);
create temp table r (n serial, label text, got text);
grant all on r to authenticated, anon; grant all on sequence r_n_seq to authenticated, anon;
create or replace function pg_temp.try(l text, q text) returns void language plpgsql as $$
declare v text;
begin
  begin execute q into v; insert into r(label, got) values (l, 'OK=' || coalesce(v, 'null'));
  exception when others then insert into r(label, got) values (l, 'ERR=' || left(sqlerrm, 110)); end;
end $$;
grant execute on function pg_temp.try(text, text) to authenticated, anon;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"au_new","role":"authenticated"}', true);
select pg_temp.try('novo sub: ensure_profile cria perfil e devolve o UUID interno (esperado OK=true)', $q$select (public.ensure_profile('Novo Usuario', 'au-new@example.invalid') is not null)::text$q$);
select pg_temp.try('novo sub: segunda chamada devolve o MESMO UUID (esperado OK=true)', $q$select (public.ensure_profile('Outro Nome', 'outro@example.invalid') = (select user_id from public.profiles where clerk_user_id = 'au_new'))::text$q$);
select pg_temp.try('novo sub: exatamente 1 perfil (esperado OK=1)', $q$select count(*)::text from public.profiles where clerk_user_id = 'au_new'$q$);
select pg_temp.try('novo sub: nasce user/active (esperado OK=user/active)', $q$select (role::text || '/' || status::text) from public.profiles where clerk_user_id = 'au_new'$q$);
select pg_temp.try('novo sub: nome inválido recusado (esperado ERR=Nome invalido)', $q$select public.ensure_profile(repeat('x', 161), 'a@b.co')::text$q$);
select pg_temp.try('novo sub: e-mail inválido recusado (esperado ERR=E-mail invalido)', $q$select public.ensure_profile('Ok', 'sem-arroba')::text$q$);

select set_config('request.jwt.claims', '{"sub":"au_susp","role":"authenticated"}', true);
select pg_temp.try('suspenso: o perfil é visível ao middleware (esperado OK=suspended)', $q$select status::text from public.profiles$q$);
select pg_temp.try('suspenso: ensure_profile não recria nem reativa (esperado OK=null)', $q$select coalesce(public.ensure_profile('X', 'x@x.co')::text, 'null')$q$);
select pg_temp.try('suspenso: current_profile_user_id() nulo (esperado OK=null)', $q$select coalesce(public.current_profile_user_id()::text, 'null')$q$);
select pg_temp.try('suspenso: continua 1 perfil suspended (esperado OK=1/suspended)', $q$select (select count(*) from public.profiles where clerk_user_id = 'au_susp')::text || '/' || (select status::text from public.profiles where clerk_user_id = 'au_susp')$q$);
select pg_temp.try('suspenso: não se reativa por UPDATE (esperado OK=0)', $q$with u as (update public.profiles set status = 'active' where clerk_user_id = 'au_susp' returning 1) select count(*)::text from u$q$);
select pg_temp.try('suspenso: RPC de negócio recusada (esperado ERR=Usuário não autenticado)', $q$select public.open_cash_register(1, 'x')::text$q$);
select pg_temp.try('suspenso: consentimento recusado (esperado ERR=not authenticated)', $q$select public.get_my_legal_consent_status()::text$q$);
select set_config('request.jwt.claims', '{"sub":"au_inact","role":"authenticated"}', true);
select pg_temp.try('inativo: ensure_profile não reativa (esperado OK=null)', $q$select coalesce(public.ensure_profile('X', 'x@x.co')::text, 'null')$q$);
select pg_temp.try('inativo: continua inactive (esperado OK=inactive)', $q$select status::text from public.profiles$q$);

select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select pg_temp.try('JWT authenticated SEM sub: ensure_profile recusado (esperado ERR=Usuario nao autenticado)', $q$select public.ensure_profile('X', 'x@x.co')::text$q$);
select pg_temp.try('JWT authenticated SEM sub: current_profile_user_id() nulo (esperado OK=null)', $q$select coalesce(public.current_profile_user_id()::text, 'null')$q$);
select pg_temp.try('JWT authenticated SEM sub: profiles vazio (esperado OK=0)', $q$select count(*)::text from public.profiles$q$);
select pg_temp.try('JWT authenticated SEM sub: consentimento recusado (esperado ERR=not authenticated)', $q$select public.get_my_legal_consent_status()::text$q$);
select set_config('request.jwt.claims', '{"sub":"au_new","role":"anon"}', true);
set local role anon;
select pg_temp.try('role=anon com sub válido: ensure_profile negado (esperado ERR=permission denied)', $q$select public.ensure_profile('X', 'x@x.co')::text$q$);
select pg_temp.try('role=anon com sub válido: profiles negado (esperado ERR=permission denied)', $q$select count(*)::text from public.profiles$q$);
reset role;
do $result$ declare v text; begin select string_agg(label || ' => ' || got, E'\n' order by n) into v from r; raise exception E'RESULT:\n%', v; end $result$;
