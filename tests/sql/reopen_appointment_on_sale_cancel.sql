-- Bateria SQL — cancelar a venda reabre o agendamento (20261110180000). Roda SOMENTE no TEST; termina em erro proposital.
begin;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
insert into public.profiles (user_id, clerk_user_id, full_name, email, role, status) values
  ('ffffffff-0000-0000-0000-0000000000d1', 'ro_owner', 'RO Dono', 'ro@example.invalid', 'user', 'active');
insert into public.companies (id, name, business_type, status) values
  ('ffffffff-1000-0000-0000-0000000000d1', '[RO] Empresa', 'bakery', 'active');
alter table public.company_members disable trigger company_members_seat_limit;
insert into public.company_members (company_id, user_id, role) values
  ('ffffffff-1000-0000-0000-0000000000d1', 'ffffffff-0000-0000-0000-0000000000d1', 'owner');
insert into public.subscriptions (company_id, plan_id, status, starts_at, expires_at, provider)
  values ('ffffffff-1000-0000-0000-0000000000d1', (select id from public.plans order by created_at limit 1), 'active', now(), now() + interval '30 days', 'manual');
insert into public.services (id, company_id, name, sale_price, cost_price) values
  ('ffffffff-2000-0000-0000-0000000000d1', 'ffffffff-1000-0000-0000-0000000000d1', 'RO Servico', 100, 10);
insert into public.appointments (id, company_id, service_id, starts_at, ends_at, duration_minutes, price, status) values
  ('ffffffff-7000-0000-0000-0000000000d1', 'ffffffff-1000-0000-0000-0000000000d1', 'ffffffff-2000-0000-0000-0000000000d1', now() - interval '3 hours', now() - interval '2 hours', 60, 100, 'scheduled'),
  ('ffffffff-7000-0000-0000-0000000000d2', 'ffffffff-1000-0000-0000-0000000000d1', 'ffffffff-2000-0000-0000-0000000000d1', now() - interval '5 hours', now() - interval '4 hours', 60, 100, 'cancelled');

create temp table r (n serial, caso text, resultado text, ok boolean);
grant all on r to authenticated;
grant all on sequence r_n_seq to authenticated;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"ro_owner","role":"authenticated"}', true);
select public.complete_appointment('ffffffff-7000-0000-0000-0000000000d1');
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
insert into r(caso, resultado, ok)
select 'A) concluído tem venda ligada', status::text || '|' || (sale_id is not null)::text, status = 'completed' and sale_id is not null
from public.appointments where id = 'ffffffff-7000-0000-0000-0000000000d1';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"ro_owner","role":"authenticated"}', true);
select public.cancel_sale((select sale_id from public.appointments where id = 'ffffffff-7000-0000-0000-0000000000d1'), 'teste');
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
insert into r(caso, resultado, ok)
select 'B) cancelar a venda reabre o agendamento', status::text || '|sale=' || coalesce(sale_id::text, 'null'), status = 'scheduled' and sale_id is null
from public.appointments where id = 'ffffffff-7000-0000-0000-0000000000d1';
insert into r(caso, resultado, ok)
select 'C) agendamento cancelado de outro não é tocado', status::text, status = 'cancelled'
from public.appointments where id = 'ffffffff-7000-0000-0000-0000000000d2';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"ro_owner","role":"authenticated"}', true);
select public.complete_appointment('ffffffff-7000-0000-0000-0000000000d1');
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
insert into r(caso, resultado, ok)
select 'D) dá para concluir de novo (nova venda)', a.status::text || '|' || s.status::text, a.status = 'completed' and s.status = 'completed'
from public.appointments a join public.sales s on s.id = a.sale_id where a.id = 'ffffffff-7000-0000-0000-0000000000d1';

insert into r(caso, resultado, ok)
select 'E) função do gatilho não é executável por anon/authenticated',
  has_function_privilege('anon','public.reopen_appointment_on_sale_cancel()','execute')::text || '/' || has_function_privilege('authenticated','public.reopen_appointment_on_sale_cancel()','execute')::text,
  not has_function_privilege('anon','public.reopen_appointment_on_sale_cancel()','execute') and not has_function_privilege('authenticated','public.reopen_appointment_on_sale_cancel()','execute');

do $result$
declare v jsonb;
begin
  select jsonb_build_object('total', count(*), 'pass', count(*) filter (where ok), 'fail', count(*) filter (where not ok),
    'falhas', coalesce((select jsonb_agg(jsonb_build_object('caso', caso, 'obtido', resultado) order by n) from r where not ok), '[]'::jsonb)) into v from r;
  raise exception 'RESULT: %', v::text;
end
$result$;
