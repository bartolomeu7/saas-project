-- =============================================================================
-- Bateria SQL — Relatórios, Clientes/Agenda/Orçamentos (20261126200000). Rodar em uma CÓPIA do banco.
-- Transação que termina em erro proposital (RESULT: ...): nada persiste.
-- =============================================================================
begin;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

insert into public.profiles (user_id, clerk_user_id, full_name, email, role, status) values
  ('adadadad-0000-0000-0000-000000000001', 'rc_owner', 'RC Dono', 'rc-owner@example.invalid', 'user', 'active'),
  ('adadadad-0000-0000-0000-000000000003', 'rc_outro', 'RC Outro', 'rc-outro@example.invalid', 'user', 'active');
insert into public.companies (id, name, business_type, status) values
  ('adadadad-1000-0000-0000-000000000001', '[RCTEST] A', 'other', 'active'),
  ('adadadad-1000-0000-0000-000000000002', '[RCTEST] B', 'other', 'active');
alter table public.company_members disable trigger company_members_seat_limit;
insert into public.company_members (company_id, user_id, role) values
  ('adadadad-1000-0000-0000-000000000001', 'adadadad-0000-0000-0000-000000000001', 'owner'),
  ('adadadad-1000-0000-0000-000000000002', 'adadadad-0000-0000-0000-000000000003', 'owner');
insert into public.subscriptions (company_id, plan_id, status, starts_at, expires_at, provider)
  select c, (select id from public.plans order by created_at limit 1), 'active', now(), now() + interval '30 days', 'manual'
    from unnest(array['adadadad-1000-0000-0000-000000000001', 'adadadad-1000-0000-0000-000000000002']::uuid[]) c;

-- Clientes: Nova (1ª compra em março), Antiga (comprou em 2017 e em março), Parada (só 2017),
-- Inativa (desativada, comprou em 2017: fora dos "sem comprar"), Nunca (sem compra).
insert into public.customers (id, company_id, name, status, created_at) values
  ('adadadad-2000-0000-0000-000000000001', 'adadadad-1000-0000-0000-000000000001', 'RC Nova', 'active', '2018-03-02 12:00+00'),
  ('adadadad-2000-0000-0000-000000000002', 'adadadad-1000-0000-0000-000000000001', 'RC Antiga', 'active', '2017-01-01 12:00+00'),
  ('adadadad-2000-0000-0000-000000000003', 'adadadad-1000-0000-0000-000000000001', 'RC Parada', 'active', '2017-01-01 12:00+00'),
  ('adadadad-2000-0000-0000-000000000004', 'adadadad-1000-0000-0000-000000000001', 'RC Inativa', 'inactive', '2017-01-01 12:00+00'),
  ('adadadad-2000-0000-0000-000000000005', 'adadadad-1000-0000-0000-000000000001', 'RC Nunca', 'active', '2017-01-01 12:00+00');
insert into public.sales (id, company_id, user_id, customer_id, status, subtotal, total_amount, sold_at)
select ('adadadad-5000-0000-0000-00000000000' || n)::uuid, 'adadadad-1000-0000-0000-000000000001', 'adadadad-0000-0000-0000-000000000001',
       case when c = 0 then null else ('adadadad-2000-0000-0000-00000000000' || c)::uuid end, 'draft', v, v, d::timestamptz
  from (values (1, 1, 100, '2018-03-05 15:00+00'), (2, 1, 20, '2018-03-20 15:00+00'), (3, 2, 70, '2018-03-10 15:00+00'),
               (4, 2, 30, '2017-05-01 15:00+00'), (5, 3, 500, '2017-06-01 15:00+00'), (6, 4, 900, '2017-06-01 15:00+00'),
               (7, 0, 15, '2018-03-11 15:00+00')) x(n, c, v, d);
update public.sales set status = 'completed', completed_at = sold_at where id::text like 'adadadad-5000-%';

-- Agenda de março: profissional Ana (concluído com venda 1, falta, cancelado, marcado no passado) e um sem profissional.
insert into public.professional_profiles (id, company_id, company_member_id, display_name)
select 'adadadad-6000-0000-0000-000000000001', company_id, id, 'RC Ana' from public.company_members
 where company_id = 'adadadad-1000-0000-0000-000000000001'
on conflict (company_member_id) do update set id = excluded.id, display_name = excluded.display_name;
insert into public.services (id, company_id, name) values ('adadadad-4000-0000-0000-000000000001', 'adadadad-1000-0000-0000-000000000001', 'RC Serviço');
insert into public.appointments (company_id, service_id, professional_id, starts_at, ends_at, duration_minutes, status, sale_id)
select 'adadadad-1000-0000-0000-000000000001', 'adadadad-4000-0000-0000-000000000001',
       case when p then 'adadadad-6000-0000-0000-000000000001'::uuid end, d::timestamptz, d::timestamptz + interval '30 minutes', 30, s::public.appointment_status,
       case when v > 0 then ('adadadad-5000-0000-0000-00000000000' || v)::uuid end
  from (values (true, '2018-03-05 14:00+00', 'completed', 1), (true, '2018-03-06 14:00+00', 'no_show', 0),
               (true, '2018-03-07 14:00+00', 'cancelled', 0), (true, '2018-03-08 14:00+00', 'scheduled', 0),
               (false, '2018-03-09 14:00+00', 'completed', 3), (false, '2018-04-09 14:00+00', 'completed', 0)) x(p, d, s, v);

-- Orçamentos emitidos em março: rascunho, enviado vencido, aprovado, recusado, convertido (venda 3) e um de abril.
insert into public.quotes (company_id, number, seq, year, status, customer_name, issued_on, valid_until, subtotal, total_amount, sale_id)
select 'adadadad-1000-0000-0000-000000000001', 'RC-' || n, n, 2018, s, 'RC Cliente', d::date, d::date + 10, v, v,
       case when venda > 0 then ('adadadad-5000-0000-0000-00000000000' || venda)::uuid end
  from (values (1, 'draft', '2018-03-01', 10, 0), (2, 'sent', '2018-03-02', 20, 0), (3, 'approved', '2018-03-03', 30, 0),
               (4, 'rejected', '2018-03-04', 40, 0), (5, 'converted', '2018-03-31', 70, 3), (6, 'approved', '2018-04-01', 999, 0)) x(n, s, d, v, venda);

create temp table r (n serial, label text, ok boolean, got text);
grant all on r to authenticated, anon;
grant all on sequence r_n_seq to authenticated, anon;
create or replace function pg_temp.chk(l text, q text, e text) returns void language plpgsql as $$
declare v text; got text;
begin
  begin execute q into v; got := 'OK=' || coalesce(v, 'null');
  exception when others then got := 'ERR=' || sqlerrm; end;
  insert into r(label, got, ok) values (l, left(got, 240), case when e like 'ERR=%' then got like 'ERR=%' and position(substr(e, 5) in got) > 0 else got = e end);
end $$;
grant execute on function pg_temp.chk(text, text, text) to authenticated, anon;
create or replace function pg_temp.c(dias int default 30) returns jsonb language sql as $$
  select public.report_customers('adadadad-1000-0000-0000-000000000001', '2018-03-01 03:00+00', '2018-04-01 02:59:59.999+00', dias); $$;
create or replace function pg_temp.a() returns jsonb language sql as $$
  select public.report_agenda('adadadad-1000-0000-0000-000000000001', '2018-03-01 03:00+00', '2018-04-01 02:59:59.999+00'); $$;
create or replace function pg_temp.q() returns jsonb language sql as $$
  select public.report_quotes('adadadad-1000-0000-0000-000000000001', '2018-03-01', '2018-03-31'); $$;
grant execute on function pg_temp.c(int), pg_temp.a(), pg_temp.q() to authenticated, anon;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"rc_owner","role":"authenticated"}', true);

select pg_temp.chk('cli novos, recorrentes e sem cliente', $q$select concat_ws(' ', r->'new'->>'customers', r->'new'->>'sales', r->'new'->>'revenue', r->'returning'->>'customers', r->'returning'->>'sales', r->'returning'->>'revenue', r->'without_customer'->>'sales', r->'without_customer'->>'revenue') from (select pg_temp.c() r) x$q$, 'OK=1 2 120.00 1 1 70.00 1 15.00');
select pg_temp.chk('cli soma bate com o faturamento geral', $q$select (public.report_summary('adadadad-1000-0000-0000-000000000001', '2018-03-01 03:00+00', '2018-04-01 02:59:59.999+00', now())->>'revenue')$q$, 'OK=205.00');
select pg_temp.chk('cli cadastrados no período', $q$select pg_temp.c()->>'registered'$q$, 'OK=1');
select pg_temp.chk('cli maiores compradores', $q$select string_agg((t->>'name') || ':' || (t->>'revenue') || ':' || (t->>'new'), ' | ') from jsonb_array_elements(pg_temp.c()->'top') t$q$, 'OK=RC Nova:120.00:true | RC Antiga:70.00:false');
select pg_temp.chk('cli sem comprar: só ativos que já compraram, maior gasto primeiro', $q$select (pg_temp.c()->>'inactive_total') || ' ' || string_agg((t->>'name') || ':' || (t->>'spent'), ' | ') from jsonb_array_elements(pg_temp.c()->'inactive') t$q$, 'OK=3 RC Parada:500.00 | RC Nova:120.00 | RC Antiga:100.00');
select pg_temp.chk('cli corte de dias', $q$select concat_ws(' ', r->>'inactive_30', r->>'inactive_90', r->>'inactive_total', (r->'inactive')::text) from (select pg_temp.c(100000) r) x$q$, 'OK=3 3 0 []');
select pg_temp.chk('cli nunca compraram', $q$select pg_temp.c()->>'never_bought'$q$, 'OK=1');

select pg_temp.chk('agenda por profissional', $q$select string_agg(concat_ws(':', coalesce(p->>'name', 'sem'), p->>'total', p->>'completed', p->>'no_show', p->>'cancelled', p->>'upcoming', p->>'unsettled', p->>'sales', p->>'revenue'), ' | ') from jsonb_array_elements(pg_temp.a()->'professionals') p$q$, 'OK=RC Ana:4:1:1:1:0:1:1:100.00 | sem:1:1:0:0:0:0:1:70.00');

select pg_temp.chk('orc por situação', $q$select string_agg(k || ':' || (v->>'count') || ':' || (v->>'amount'), ' ' order by k) from jsonb_each(pg_temp.q()->'by_status') e(k, v)$q$, 'OK=approved:1:30.00 converted:1:70.00 draft:1:10.00 expired:1:20.00 rejected:1:40.00');
select pg_temp.chk('orc vendido', $q$select pg_temp.q()->>'sold'$q$, 'OK=70.00');

select set_config('request.jwt.claims', '{"sub":"rc_outro","role":"authenticated"}', true);
select pg_temp.chk('outra empresa não enxerga clientes', $q$select concat_ws(' ', r->'new'->>'customers', r->>'registered', r->>'inactive_total', r->>'never_bought') from (select pg_temp.c() r) x$q$, 'OK=0 0 0 0');
select pg_temp.chk('outra empresa não enxerga agenda', $q$select (pg_temp.a()->'professionals')::text$q$, 'OK=[]');
select pg_temp.chk('outra empresa não enxerga orçamentos', $q$select pg_temp.q()::text$q$, 'OK={"sold": 0, "by_status": {}}');

reset role;
set local role anon;
select pg_temp.chk('visitante não executa clientes', $q$select pg_temp.c()::text$q$, 'ERR=permission denied');
select pg_temp.chk('visitante não executa agenda', $q$select pg_temp.a()::text$q$, 'ERR=permission denied');
select pg_temp.chk('visitante não executa orçamentos', $q$select pg_temp.q()::text$q$, 'ERR=permission denied');
reset role;

do $$
declare bad text;
begin
  select string_agg(n || ' ' || label || ' => ' || got, E'\n' order by n) filter (where not ok) into bad from r;
  raise exception 'RESULT: % de % ok%', (select count(*) from r where ok), (select count(*) from r), coalesce(E'\nFALHAS:\n' || bad, '');
end $$;
rollback;
