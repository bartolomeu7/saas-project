-- =============================================================================
-- Bateria SQL — comissão (20261126240000_comissao). Rodar em uma CÓPIA do banco.
-- Transação que termina em erro proposital (RESULT: ...): nada persiste.
-- =============================================================================
begin;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

insert into public.profiles (user_id, clerk_user_id, full_name, email, role, status) values
  ('afafafaf-0000-0000-0000-000000000001', 'cm_owner', 'CM Dono', 'cm-owner@example.invalid', 'user', 'active'),
  ('afafafaf-0000-0000-0000-000000000002', 'cm_func', 'CM Func', 'cm-func@example.invalid', 'user', 'active'),
  ('afafafaf-0000-0000-0000-000000000003', 'cm_outro', 'CM Outro', 'cm-outro@example.invalid', 'user', 'active');
insert into public.companies (id, name, business_type, status) values
  ('afafafaf-1000-0000-0000-000000000001', '[CMTEST] A', 'other', 'active'),
  ('afafafaf-1000-0000-0000-000000000002', '[CMTEST] B', 'other', 'active');
alter table public.company_members disable trigger company_members_seat_limit;
insert into public.company_members (id, company_id, user_id, role) values
  ('afafafaf-1100-0000-0000-000000000001', 'afafafaf-1000-0000-0000-000000000001', 'afafafaf-0000-0000-0000-000000000001', 'owner'),
  ('afafafaf-1100-0000-0000-000000000002', 'afafafaf-1000-0000-0000-000000000001', 'afafafaf-0000-0000-0000-000000000002', 'employee'),
  ('afafafaf-1100-0000-0000-000000000003', 'afafafaf-1000-0000-0000-000000000002', 'afafafaf-0000-0000-0000-000000000003', 'owner');
insert into public.subscriptions (company_id, plan_id, status, starts_at, expires_at, provider)
  select c, (select id from public.plans order by created_at limit 1), 'active', now(), now() + interval '30 days', 'manual'
    from unnest(array['afafafaf-1000-0000-0000-000000000001', 'afafafaf-1000-0000-0000-000000000002']::uuid[]) c;
delete from public.professional_profiles where company_id::text like 'afafafaf-%';
insert into public.professional_profiles (id, company_id, company_member_id, display_name) values
  ('afafafaf-6000-0000-0000-000000000001', 'afafafaf-1000-0000-0000-000000000001', 'afafafaf-1100-0000-0000-000000000001', 'CM Ana'),
  ('afafafaf-6000-0000-0000-000000000002', 'afafafaf-1000-0000-0000-000000000001', 'afafafaf-1100-0000-0000-000000000002', 'CM Bia'),
  ('afafafaf-6000-0000-0000-000000000003', 'afafafaf-1000-0000-0000-000000000002', 'afafafaf-1100-0000-0000-000000000003', 'CM Alheio');
insert into public.services (id, company_id, name) values
  ('afafafaf-4000-0000-0000-000000000001', 'afafafaf-1000-0000-0000-000000000001', 'CM Corte');
insert into public.products (id, company_id, name, cost_price, sale_price, stock_quantity, status) values
  ('afafafaf-3000-0000-0000-000000000001', 'afafafaf-1000-0000-0000-000000000001', 'CM Gel', 1, 20, 9, 'active');

-- Março/2019. V1: serviço 80 + produto 20, desconto 10 na venda (serviço vale 72), paga em 02/03 e 05/03.
-- V2: serviço 50 sem atendimento, paga em março. V3: serviço 100 só parte paga (pendente). V4: cancelada.
-- V5: serviço 60 concluída em março, quitada em abril. V6: serviço 40 concluída em fevereiro, quitada em março.
insert into public.sales (id, company_id, user_id, status, subtotal, discount_amount, total_amount, sold_at)
select ('afafafaf-5000-0000-0000-00000000000' || n)::uuid, 'afafafaf-1000-0000-0000-000000000001', 'afafafaf-0000-0000-0000-000000000001', 'draft', s, d, s - d, q::timestamptz
  from (values (1, 100, 10, '2019-03-01 15:00+00'), (2, 50, 0, '2019-03-03 15:00+00'), (3, 100, 0, '2019-03-04 15:00+00'),
               (4, 70, 0, '2019-03-06 15:00+00'), (5, 60, 0, '2019-03-07 15:00+00'), (6, 40, 0, '2019-02-10 15:00+00')) x(n, s, d, q);
insert into public.sale_items (id, company_id, sale_id, item_type, service_id, product_id, description, quantity, unit_price, subtotal, total_amount)
select ('afafafaf-7000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid, 'afafafaf-1000-0000-0000-000000000001', ('afafafaf-5000-0000-0000-00000000000' || v)::uuid,
       t::public.sale_item_type, case when t = 'service' then 'afafafaf-4000-0000-0000-000000000001'::uuid end,
       case when t = 'product' then 'afafafaf-3000-0000-0000-000000000001'::uuid end, d, 1, p, p, p
  from (values (11, 1, 'service', 'CM Corte V1', 80), (12, 1, 'product', 'CM Gel', 20), (21, 2, 'service', 'CM Corte V2', 50),
               (31, 3, 'service', 'CM Corte V3', 100), (41, 4, 'service', 'CM Corte V4', 70), (51, 5, 'service', 'CM Corte V5', 60),
               (61, 6, 'service', 'CM Corte V6', 40)) x(n, v, t, d, p);
update public.sales set status = 'completed', completed_at = sold_at where id::text like 'afafafaf-5000-%' and id <> 'afafafaf-5000-0000-0000-000000000004';
update public.sales set status = 'cancelled', cancelled_at = sold_at, cancelled_reason = 'teste' where id = 'afafafaf-5000-0000-0000-000000000004';
insert into public.sale_payments (company_id, sale_id, method, amount, status, paid_at)
select 'afafafaf-1000-0000-0000-000000000001', ('afafafaf-5000-0000-0000-00000000000' || v)::uuid, 'pix', a, 'paid', q::timestamptz
  from (values (1, 50, '2019-03-02 15:00+00'), (1, 40, '2019-03-05 15:00+00'), (2, 50, '2019-03-03 15:00+00'),
               (3, 30, '2019-03-04 15:00+00'), (5, 60, '2019-04-02 15:00+00'), (6, 40, '2019-03-08 15:00+00')) x(v, a, q);
-- V1, V3 e V6 vieram da agenda com a Ana
insert into public.appointments (company_id, service_id, professional_id, starts_at, ends_at, duration_minutes, status, sale_id)
select 'afafafaf-1000-0000-0000-000000000001', 'afafafaf-4000-0000-0000-000000000001', 'afafafaf-6000-0000-0000-000000000001',
       q::timestamptz, q::timestamptz + interval '30 minutes', 30, 'completed', ('afafafaf-5000-0000-0000-00000000000' || v)::uuid
  from (values (1, '2019-03-01 14:00+00'), (3, '2019-03-04 14:00+00'), (6, '2019-02-10 14:00+00')) x(v, q);

create temp table r (n serial, label text, ok boolean, got text);
grant all on r to authenticated, anon;
grant all on sequence r_n_seq to authenticated, anon;
create or replace function pg_temp.chk(l text, q text, e text) returns void language plpgsql as $$
declare v text; got text;
begin
  begin execute q into v; got := 'OK=' || coalesce(v, 'null');
  exception when others then got := 'ERR=' || sqlerrm; end;
  insert into r(label, got, ok) values (l, left(got, 260), case when e like 'ERR=%' then got like 'ERR=%' and position(substr(e, 5) in got) > 0 else got = e end);
end $$;
grant execute on function pg_temp.chk(text, text, text) to authenticated, anon;
create or replace function pg_temp.rep() returns jsonb language sql as $$
  select public.report_commission('afafafaf-1000-0000-0000-000000000001', '2019-03-01 03:00+00', '2019-04-01 02:59:59.999+00'); $$;
create or replace function pg_temp.por() returns text language sql as $$
  select coalesce(string_agg(concat_ws(':', coalesce(p->>'name', 'sem'), p->>'services', p->>'base', p->>'commission', p->>'pending_base', p->>'pending_commission'), ' | ' order by coalesce(p->>'name', 'zz')), '-')
    from jsonb_array_elements(pg_temp.rep()->'professionals') p; $$;
create or replace function pg_temp.taxa(p int, v numeric, d date) returns text language sql as $$
  select public.set_commission_rate(('afafafaf-6000-0000-0000-00000000000' || p)::uuid, v, d); select 'ok'; $$;
create or replace function pg_temp.escolhe(item int, p int) returns text language sql as $$
  select public.set_sale_item_professional(('afafafaf-7000-0000-0000-0000000000' || item)::uuid, case when p > 0 then ('afafafaf-6000-0000-0000-00000000000' || p)::uuid end); select 'ok'; $$;
grant execute on function pg_temp.rep(), pg_temp.por(), pg_temp.taxa(int, numeric, date), pg_temp.escolhe(int, int) to authenticated, anon;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"cm_owner","role":"authenticated"}', true);

select pg_temp.chk('sem percentual: base certa e comissão zero', $q$select pg_temp.por()$q$, 'OK=CM Ana:2:112.00:0.00:100.00:0.00 | sem:1:50.00:0.00:0:0');
select pg_temp.chk('Ana 10% desde 2019', $q$select pg_temp.taxa(1, 10, '2019-01-01')$q$, 'OK=ok');
select pg_temp.chk('desconto rateado, parcial fica pendente, abril e cancelada fora', $q$select pg_temp.por()$q$, 'OK=CM Ana:2:112.00:11.20:100.00:10.00 | sem:1:50.00:0.00:0:0');
select pg_temp.chk('data é a do último pagamento', $q$select string_agg((i->>'description') || ':' || (i->>'date'), ' ' order by i->>'description') from jsonb_array_elements(pg_temp.rep()->'items') i$q$, 'OK=CM Corte V1:2019-03-05 CM Corte V2:2019-03-03 CM Corte V6:2019-03-08');
select pg_temp.chk('sem profissional vem primeiro na lista', $q$select pg_temp.rep()->'items'->0->>'description'$q$, 'OK=CM Corte V2');
select pg_temp.chk('troca de percentual vale da data em diante', $q$select pg_temp.taxa(1, 20, '2019-03-06')$q$, 'OK=ok');
select pg_temp.chk('V1 em 10% e V6 em 20%', $q$select string_agg((i->>'description') || ':' || (i->>'percent') || ':' || (i->>'commission'), ' ' order by i->>'description') from jsonb_array_elements(pg_temp.rep()->'items') i where i->>'professional' is not null$q$, 'OK=CM Corte V1:10.00:7.20 CM Corte V6:20.00:8.00');
select pg_temp.chk('Bia 50%', $q$select pg_temp.taxa(2, 50, '2019-01-01')$q$, 'OK=ok');
select pg_temp.chk('escolher Bia no serviço sem profissional', $q$select pg_temp.escolhe(21, 2)$q$, 'OK=ok');
select pg_temp.chk('escolher Bia por cima da agenda', $q$select pg_temp.escolhe(11, 2)$q$, 'OK=ok');
select pg_temp.chk('escolha manual vale', $q$select pg_temp.por()$q$, 'OK=CM Ana:1:40.00:8.00:100.00:20.00 | CM Bia:2:122.00:61.00:0:0');
select pg_temp.chk('tirar a escolha volta à agenda', $q$select pg_temp.escolhe(11, 0)$q$, 'OK=ok');
select pg_temp.chk('conferência depois de tirar', $q$select pg_temp.por()$q$, 'OK=CM Ana:2:112.00:15.20:100.00:20.00 | CM Bia:1:50.00:25.00:0:0');
select pg_temp.chk('equipe com o último percentual', $q$select string_agg((t->>'name') || ':' || (t->>'percent') || ':' || (t->>'valid_from'), ' ') from jsonb_array_elements(pg_temp.rep()->'team') t$q$, 'OK=CM Ana:20.00:2019-03-06 CM Bia:50.00:2019-01-01');
select pg_temp.chk('produto não aceita profissional', $q$select pg_temp.escolhe(12, 1)$q$, 'ERR=só para serviços');
select pg_temp.chk('profissional de outra empresa recusado', $q$select pg_temp.escolhe(21, 3)$q$, 'ERR=Profissional não encontrado');
select pg_temp.chk('percentual acima de 100 recusado', $q$select pg_temp.taxa(1, 101, '2019-01-01')$q$, 'ERR=entre 0 e 100');
select pg_temp.chk('percentual negativo recusado', $q$select pg_temp.taxa(1, -1, '2019-01-01')$q$, 'ERR=entre 0 e 100');
select pg_temp.chk('data absurda recusada', $q$select pg_temp.taxa(1, 10, '1990-01-01')$q$, 'ERR=data válida');
select pg_temp.chk('gravação direta bloqueada', $q$update public.professional_commission_rates set percent = 99 returning 'x'$q$, 'ERR=permission denied');
select pg_temp.chk('vendas e itens intactos', $q$select sum(total_amount)::text from public.sale_items where company_id = 'afafafaf-1000-0000-0000-000000000001'$q$, 'OK=420.00');

select set_config('request.jwt.claims', '{"sub":"cm_func","role":"authenticated"}', true);
select pg_temp.chk('funcionário não define percentual', $q$select pg_temp.taxa(2, 90, '2019-01-01')$q$, 'ERR=Apenas dono ou administrador');
select pg_temp.chk('funcionário não escolhe profissional', $q$select pg_temp.escolhe(21, 2)$q$, 'ERR=Apenas dono ou administrador');
select pg_temp.chk('funcionário não lê percentuais', $q$select count(*)::text from public.professional_commission_rates$q$, 'OK=0');

select set_config('request.jwt.claims', '{"sub":"cm_outro","role":"authenticated"}', true);
select pg_temp.chk('outra empresa não define', $q$select pg_temp.taxa(1, 90, '2019-01-01')$q$, 'ERR=Apenas dono ou administrador');
select pg_temp.chk('outra empresa não escolhe', $q$select pg_temp.escolhe(21, 3)$q$, 'ERR=Apenas dono ou administrador');
select pg_temp.chk('outra empresa não enxerga nada', $q$select (r->>'professionals') || (r->>'items') || (r->>'team') from (select pg_temp.rep() r) x$q$, 'OK=[][][]');

reset role;
set local role anon;
select pg_temp.chk('visitante não executa o relatório', $q$select pg_temp.rep()::text$q$, 'ERR=permission denied');
select pg_temp.chk('visitante não define', $q$select pg_temp.taxa(1, 1, '2019-01-01')$q$, 'ERR=permission denied');
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select pg_temp.chk('exclusão da empresa continua funcionando', $q$delete from public.companies where id = 'afafafaf-1000-0000-0000-000000000001' returning 'sim'$q$, 'OK=sim');
select pg_temp.chk('sem sobras', $q$select (select count(*) from public.professional_commission_rates where company_id::text like 'afafafaf-%')::text || ' ' || (select count(*) from public.sale_item_professionals where company_id::text like 'afafafaf-%')::text$q$, 'OK=0 0');

do $$
declare bad text;
begin
  select string_agg(n || ' ' || label || ' => ' || got, E'\n' order by n) filter (where not ok) into bad from r;
  raise exception 'RESULT: % de % ok%', (select count(*) from r where ok), (select count(*) from r), coalesce(E'\nFALHAS:\n' || bad, '');
end $$;
rollback;
