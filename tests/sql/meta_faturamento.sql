-- =============================================================================
-- Bateria SQL — meta mensal de faturamento (20261126220000_meta_faturamento). Rodar em uma CÓPIA do banco.
-- Transação que termina em erro proposital (RESULT: ...): nada persiste.
-- =============================================================================
begin;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

insert into public.profiles (user_id, clerk_user_id, full_name, email, role, status) values
  ('aeaeaeae-0000-0000-0000-000000000001', 'mf_owner', 'MF Dono', 'mf-owner@example.invalid', 'user', 'active'),
  ('aeaeaeae-0000-0000-0000-000000000002', 'mf_admin', 'MF Admin', 'mf-admin@example.invalid', 'user', 'active'),
  ('aeaeaeae-0000-0000-0000-000000000003', 'mf_func', 'MF Func', 'mf-func@example.invalid', 'user', 'active'),
  ('aeaeaeae-0000-0000-0000-000000000004', 'mf_outro', 'MF Outro', 'mf-outro@example.invalid', 'user', 'active');
insert into public.companies (id, name, business_type, status) values
  ('aeaeaeae-1000-0000-0000-000000000001', '[MFTEST] A', 'other', 'active'),
  ('aeaeaeae-1000-0000-0000-000000000002', '[MFTEST] B', 'other', 'active');
alter table public.company_members disable trigger company_members_seat_limit;
insert into public.company_members (company_id, user_id, role) values
  ('aeaeaeae-1000-0000-0000-000000000001', 'aeaeaeae-0000-0000-0000-000000000001', 'owner'),
  ('aeaeaeae-1000-0000-0000-000000000001', 'aeaeaeae-0000-0000-0000-000000000002', 'admin'),
  ('aeaeaeae-1000-0000-0000-000000000001', 'aeaeaeae-0000-0000-0000-000000000003', 'employee'),
  ('aeaeaeae-1000-0000-0000-000000000002', 'aeaeaeae-0000-0000-0000-000000000004', 'owner');
insert into public.subscriptions (company_id, plan_id, status, starts_at, expires_at, provider)
  select c, (select id from public.plans order by created_at limit 1), 'active', now(), now() + interval '30 days', 'manual'
    from unnest(array['aeaeaeae-1000-0000-0000-000000000001', 'aeaeaeae-1000-0000-0000-000000000002']::uuid[]) c;

create temp table r (n serial, label text, ok boolean, got text);
grant all on r to authenticated, anon;
grant all on sequence r_n_seq to authenticated, anon;
create or replace function pg_temp.chk(l text, q text, e text) returns void language plpgsql as $$
declare v text; got text;
begin
  begin execute q into v; got := 'OK=' || coalesce(v, 'null');
  exception when others then got := 'ERR=' || sqlerrm; end;
  insert into r(label, got, ok) values (l, left(got, 200), case when e like 'ERR=%' then got like 'ERR=%' and position(substr(e, 5) in got) > 0 else got = e end);
end $$;
grant execute on function pg_temp.chk(text, text, text) to authenticated, anon;
create or replace function pg_temp.meta(v numeric) returns text language sql as $$
  select (public.set_revenue_goal('aeaeaeae-1000-0000-0000-000000000001', v)).target::text; $$;
create or replace function pg_temp.linhas() returns text language sql as $$
  select count(*)::text || ' ' || coalesce(max(target)::text, '-') from public.company_revenue_goals where company_id = 'aeaeaeae-1000-0000-0000-000000000001'; $$;
create or replace function pg_temp.historico() returns text language sql security definer as $$
  select string_agg(coalesce(metadata->>'before', '-') || '>' || (metadata->>'target'), ' ' order by created_at, metadata->>'target')
    from public.audit_logs where company_id = 'aeaeaeae-1000-0000-0000-000000000001' and action = 'revenue_goal.set'; $$;
grant execute on function pg_temp.meta(numeric), pg_temp.linhas(), pg_temp.historico() to authenticated, anon;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"mf_owner","role":"authenticated"}', true);
select pg_temp.chk('dono define', $q$select pg_temp.meta(5000.005)$q$, 'OK=5000.01');
select pg_temp.chk('mês é o atual de São Paulo, dia 1', $q$select (month = date_trunc('month', public.today_sao_paulo())::date)::text from public.company_revenue_goals where company_id = 'aeaeaeae-1000-0000-0000-000000000001'$q$, 'OK=true');
select set_config('request.jwt.claims', '{"sub":"mf_admin","role":"authenticated"}', true);
select pg_temp.chk('administrador troca no mesmo mês', $q$select pg_temp.meta(8000)$q$, 'OK=8000.00');
select pg_temp.chk('continua uma linha por mês', $q$select pg_temp.linhas()$q$, 'OK=1 8000.00');
select pg_temp.chk('negativa recusada', $q$select pg_temp.meta(-1)$q$, 'ERR=entre R$ 0,00');
select pg_temp.chk('acima do limite recusada', $q$select pg_temp.meta(1000000000)$q$, 'ERR=entre R$ 0,00');
select pg_temp.chk('gravação direta bloqueada', $q$update public.company_revenue_goals set target = 1 returning 'x'$q$, 'ERR=permission denied');
select pg_temp.chk('inserção direta bloqueada', $q$insert into public.company_revenue_goals(company_id, month, target) values ('aeaeaeae-1000-0000-0000-000000000001', '2020-01-01', 1) returning 'x'$q$, 'ERR=permission denied');
select pg_temp.chk('vazio remove a meta (grava zero)', $q$select pg_temp.meta(null)$q$, 'OK=0.00');
select pg_temp.chk('histórico guarda antes e depois', $q$select (pg_temp.historico() like '%->5000.01%' and pg_temp.historico() like '%5000.01>8000.00%' and pg_temp.historico() like '%8000.00>0.00%')::text$q$, 'OK=true');

select set_config('request.jwt.claims', '{"sub":"mf_func","role":"authenticated"}', true);
select pg_temp.chk('funcionário não define', $q$select pg_temp.meta(10)$q$, 'ERR=Apenas dono ou administrador');
select pg_temp.chk('funcionário não lê', $q$select pg_temp.linhas()$q$, 'OK=0 -');

select set_config('request.jwt.claims', '{"sub":"mf_outro","role":"authenticated"}', true);
select pg_temp.chk('outra empresa não define', $q$select pg_temp.meta(10)$q$, 'ERR=Apenas dono ou administrador');
select pg_temp.chk('outra empresa não lê', $q$select pg_temp.linhas()$q$, 'OK=0 -');

reset role;
set local role anon;
select pg_temp.chk('visitante não executa', $q$select pg_temp.meta(10)$q$, 'ERR=permission denied');
select pg_temp.chk('visitante não lê', $q$select pg_temp.linhas()$q$, 'ERR=permission denied');
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select pg_temp.chk('exclusão da empresa leva as metas', $q$delete from public.companies where id = 'aeaeaeae-1000-0000-0000-000000000001' returning 'sim'$q$, 'OK=sim');
select pg_temp.chk('sem sobras', $q$select pg_temp.linhas()$q$, 'OK=0 -');

do $$
declare bad text;
begin
  select string_agg(n || ' ' || label || ' => ' || got, E'\n' order by n) filter (where not ok) into bad from r;
  raise exception 'RESULT: % de % ok%', (select count(*) from r where ok), (select count(*) from r), coalesce(E'\nFALHAS:\n' || bad, '');
end $$;
rollback;
