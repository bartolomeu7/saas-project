-- =============================================================================
-- Bateria SQL — concluir atendimento gera a venda (20261108150000_complete_appointment_with_sale).
-- Roda SOMENTE no projeto TEST. Transação que termina em erro proposital (RESULT: ...): nada persiste.
-- =============================================================================
begin;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

insert into public.profiles (user_id, clerk_user_id, full_name, email, role, status) values
  ('ffffffff-0000-0000-0000-0000000000c1', 'ca_owner', 'CA Dono', 'ca-owner@example.invalid', 'user', 'active'),
  ('ffffffff-0000-0000-0000-0000000000c2', 'ca_emp', 'CA Funcionario', 'ca-emp@example.invalid', 'user', 'active'),
  ('ffffffff-0000-0000-0000-0000000000c3', 'ca_other', 'CA Outro Dono', 'ca-other@example.invalid', 'user', 'active');
insert into public.companies (id, name, business_type, status) values
  ('ffffffff-1000-0000-0000-0000000000c1', '[CATEST] Empresa', 'bakery', 'active'),
  ('ffffffff-1000-0000-0000-0000000000c3', '[CATEST] Outra', 'bakery', 'active');
alter table public.company_members disable trigger company_members_seat_limit;
insert into public.company_members (company_id, user_id, role) values
  ('ffffffff-1000-0000-0000-0000000000c1', 'ffffffff-0000-0000-0000-0000000000c1', 'owner'),
  ('ffffffff-1000-0000-0000-0000000000c1', 'ffffffff-0000-0000-0000-0000000000c2', 'employee'),
  ('ffffffff-1000-0000-0000-0000000000c3', 'ffffffff-0000-0000-0000-0000000000c3', 'owner');
insert into public.subscriptions (company_id, plan_id, status, starts_at, expires_at, provider)
  select c, (select id from public.plans order by created_at limit 1), 'active', now(), now() + interval '30 days', 'manual'
  from (values ('ffffffff-1000-0000-0000-0000000000c1'::uuid), ('ffffffff-1000-0000-0000-0000000000c3'::uuid)) v(c);

insert into public.customers (id, company_id, name) values
  ('ffffffff-3000-0000-0000-0000000000c1', 'ffffffff-1000-0000-0000-0000000000c1', 'CA Cliente');
insert into public.services (id, company_id, name, sale_price, cost_price) values
  ('ffffffff-2000-0000-0000-0000000000c1', 'ffffffff-1000-0000-0000-0000000000c1', 'CA Servico', 280, 45);
insert into public.loyalty_settings (company_id, enabled, grant_on, points_per_currency_unit, first_purchase_bonus_points,
                                     birthday_bonus_points, min_purchase_amount_for_points, points_expire)
  values ('ffffffff-1000-0000-0000-0000000000c1', true, 'completion', 2, 50, 0, 0, false)
  on conflict (company_id) do update set enabled = true, grant_on = 'completion', points_per_currency_unit = 2,
    first_purchase_bonus_points = 50, birthday_bonus_points = 0, min_purchase_amount_for_points = 0, points_expire = false;

-- atendimentos (todos da empresa 1, cliente CA Cliente)
insert into public.appointments (id, company_id, customer_id, service_id, starts_at, ends_at, duration_minutes, price, status) values
  ('ffffffff-7000-0000-0000-0000000000a1', 'ffffffff-1000-0000-0000-0000000000c1', 'ffffffff-3000-0000-0000-0000000000c1', 'ffffffff-2000-0000-0000-0000000000c1', now() - interval '3 hours', now() - interval '2 hours', 60, 280, 'scheduled'),
  ('ffffffff-7000-0000-0000-0000000000a2', 'ffffffff-1000-0000-0000-0000000000c1', 'ffffffff-3000-0000-0000-0000000000c1', 'ffffffff-2000-0000-0000-0000000000c1', now() - interval '3 hours', now() - interval '2 hours', 60, 280, 'confirmed'),
  ('ffffffff-7000-0000-0000-0000000000a3', 'ffffffff-1000-0000-0000-0000000000c1', 'ffffffff-3000-0000-0000-0000000000c1', 'ffffffff-2000-0000-0000-0000000000c1', now() - interval '3 hours', now() - interval '2 hours', 60, 280, 'scheduled'),
  ('ffffffff-7000-0000-0000-0000000000a4', 'ffffffff-1000-0000-0000-0000000000c1', null, 'ffffffff-2000-0000-0000-0000000000c1', now() - interval '3 hours', now() - interval '2 hours', 60, 280, 'cancelled'),
  ('ffffffff-7000-0000-0000-0000000000a5', 'ffffffff-1000-0000-0000-0000000000c1', null, 'ffffffff-2000-0000-0000-0000000000c1', now() - interval '3 hours', now() - interval '2 hours', 60, 0, 'scheduled'),
  ('ffffffff-7000-0000-0000-0000000000a6', 'ffffffff-1000-0000-0000-0000000000c1', null, 'ffffffff-2000-0000-0000-0000000000c1', now() - interval '3 hours', now() - interval '2 hours', 60, 280, 'scheduled'),
  ('ffffffff-7000-0000-0000-0000000000a7', 'ffffffff-1000-0000-0000-0000000000c1', null, 'ffffffff-2000-0000-0000-0000000000c1', now() - interval '3 hours', now() - interval '2 hours', 60, 280, 'scheduled'),
  ('ffffffff-7000-0000-0000-0000000000a8', 'ffffffff-1000-0000-0000-0000000000c1', null, 'ffffffff-2000-0000-0000-0000000000c1', now() - interval '3 hours', now() - interval '2 hours', 60, 100, 'scheduled'),
  ('ffffffff-7000-0000-0000-0000000000a9', 'ffffffff-1000-0000-0000-0000000000c1', null, 'ffffffff-2000-0000-0000-0000000000c1', now() - interval '3 hours', now() - interval '2 hours', 60, 280, 'completed'),
  ('ffffffff-7000-0000-0000-0000000000b0', 'ffffffff-1000-0000-0000-0000000000c1', null, 'ffffffff-2000-0000-0000-0000000000c1', now() - interval '3 hours', now() - interval '2 hours', 60, 280, 'no_show');

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

-- ================================================= dono conclui SEM forma de pagamento (cobrar depois)
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"ca_owner","role":"authenticated"}', true);

select pg_temp.chk('concluir', 'dono conclui o atendimento sem pagamento',
  $q$select (public.complete_appointment('ffffffff-7000-0000-0000-0000000000a1')).status::text$q$, 'OK=completed');
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

select pg_temp.chk('venda', 'o atendimento ficou ligado a uma venda',
  $q$select (sale_id is not null)::text from public.appointments where id = 'ffffffff-7000-0000-0000-0000000000a1'$q$, 'OK=true');
select pg_temp.chk('venda', 'venda concluída, total 280, custo 45, cliente do atendimento',
  $q$select s.status::text || '|' || s.total_amount::text || '|' || s.total_cost::text || '|' || (s.customer_id = 'ffffffff-3000-0000-0000-0000000000c1')::text
       from public.sales s join public.appointments a on a.sale_id = s.id where a.id = 'ffffffff-7000-0000-0000-0000000000a1'$q$, 'OK=completed|280.00|45.00|true');
select pg_temp.chk('venda', 'um item de serviço com o preço do atendimento',
  $q$select count(*)::text || '|' || coalesce(sum(si.total_amount), 0)::text from public.sale_items si join public.appointments a on a.sale_id = si.sale_id
       where a.id = 'ffffffff-7000-0000-0000-0000000000a1' and si.item_type = 'service' and si.service_id = 'ffffffff-2000-0000-0000-0000000000c1'$q$, 'OK=1|280.00');
select pg_temp.chk('venda', 'sem pagamento: venda fica a receber (pending) e sem lançamento no financeiro',
  $q$select s.payment_status::text || '|' || (select count(*) from public.sale_payments where sale_id = s.id)::text
       from public.sales s join public.appointments a on a.sale_id = s.id where a.id = 'ffffffff-7000-0000-0000-0000000000a1'$q$, 'OK=pending|0');
select pg_temp.chk('venda', 'observação identifica o atendimento',
  $q$select (s.notes like 'Atendimento de %')::text from public.sales s join public.appointments a on a.sale_id = s.id where a.id = 'ffffffff-7000-0000-0000-0000000000a1'$q$, 'OK=true');
select pg_temp.chk('fidelidade', 'concluir gera pontos: 560 da venda + 50 de primeira compra',
  $q$select coalesce(sum(points), 0)::text from public.loyalty_transactions where customer_id = 'ffffffff-3000-0000-0000-0000000000c1' and type = 'ganho'$q$, 'OK=610');
select pg_temp.chk('auditoria', 'ficou registrado em auditoria',
  $q$select count(*)::text from public.audit_logs where entity_type = 'appointment' and action = 'appointment.completed' and entity_id = 'ffffffff-7000-0000-0000-0000000000a1'$q$, 'OK=1');

-- ================================================= idempotência
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"ca_owner","role":"authenticated"}', true);
select pg_temp.chk('idempotencia', 'concluir de novo devolve o mesmo atendimento',
  $q$select (public.complete_appointment('ffffffff-7000-0000-0000-0000000000a1')).status::text$q$, 'OK=completed');
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select pg_temp.chk('idempotencia', 'continua existindo UMA venda para o atendimento (nada duplicado)',
  $q$select count(*)::text from public.sales where notes like 'Atendimento de %' and company_id = 'ffffffff-1000-0000-0000-0000000000c1' and id = (select sale_id from public.appointments where id = 'ffffffff-7000-0000-0000-0000000000a1')$q$, 'OK=1');
select pg_temp.chk('idempotencia', 'e os pontos não foram dados duas vezes',
  $q$select coalesce(sum(points), 0)::text from public.loyalty_transactions where customer_id = 'ffffffff-3000-0000-0000-0000000000c1' and type = 'ganho'$q$, 'OK=610');

-- ================================================= com pagamento total (PIX) e caixa aberto
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"ca_owner","role":"authenticated"}', true);
select pg_temp.chk('caixa', 'dono abre o caixa', $q$select (public.open_cash_register(100, null)).status::text$q$, 'OK=open');
select pg_temp.chk('pagamento', 'conclui com PIX no valor total',
  $q$select (public.complete_appointment('ffffffff-7000-0000-0000-0000000000a2', 'pix'::public.sale_payment_method)).status::text$q$, 'OK=completed');
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select pg_temp.chk('pagamento', 'venda paga: 1 pagamento de 280 e payment_status = paid',
  $q$select s.payment_status::text || '|' || (select coalesce(sum(amount), 0) from public.sale_payments where sale_id = s.id and status = 'paid')::text
       from public.sales s join public.appointments a on a.sale_id = s.id where a.id = 'ffffffff-7000-0000-0000-0000000000a2'$q$, 'OK=paid|280.00');
select pg_temp.chk('pagamento', 'PIX entrou no caixa aberto (entrada de 280)',
  $q$select count(*)::text from public.cash_movements cm join public.sale_payments sp on sp.id = cm.sale_payment_id
       join public.appointments a on a.sale_id = sp.sale_id where a.id = 'ffffffff-7000-0000-0000-0000000000a2' and cm.direction = 'in' and cm.amount = 280$q$, 'OK=1');
select pg_temp.chk('pagamento', 'e no financeiro (receita de venda de 280)',
  $q$select count(*)::text from public.financial_entries fe join public.sale_payments sp on sp.id = fe.source_id
       join public.appointments a on a.sale_id = sp.sale_id where a.id = 'ffffffff-7000-0000-0000-0000000000a2' and fe.source_type = 'sale_payment' and fe.amount = 280$q$, 'OK=1');

-- ================================================= pagamento parcial
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"ca_owner","role":"authenticated"}', true);
select pg_temp.chk('parcial', 'conclui com PIX de apenas 100',
  $q$select (public.complete_appointment('ffffffff-7000-0000-0000-0000000000a3', 'pix'::public.sale_payment_method, 100)).status::text$q$, 'OK=completed');
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select pg_temp.chk('parcial', 'pagou 100 de 280: venda continua a receber (pending)',
  $q$select s.payment_status::text || '|' || (select coalesce(sum(amount), 0) from public.sale_payments where sale_id = s.id and status = 'paid')::text
       from public.sales s join public.appointments a on a.sale_id = s.id where a.id = 'ffffffff-7000-0000-0000-0000000000a3'$q$, 'OK=pending|100.00');

-- ================================================= preço zero
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"ca_owner","role":"authenticated"}', true);
select pg_temp.chk('zero', 'atendimento de R$ 0 conclui mesmo com forma de pagamento (sem pagamento a registrar)',
  $q$select (public.complete_appointment('ffffffff-7000-0000-0000-0000000000a5', 'pix'::public.sale_payment_method)).status::text$q$, 'OK=completed');
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select pg_temp.chk('zero', 'venda de R$ 0 concluída e sem pagamento',
  $q$select s.status::text || '|' || s.total_amount::text || '|' || (select count(*) from public.sale_payments where sale_id = s.id)::text
       from public.sales s join public.appointments a on a.sale_id = s.id where a.id = 'ffffffff-7000-0000-0000-0000000000a5'$q$, 'OK=completed|0.00|0');

-- ================================================= funcionário pode concluir (e o dinheiro entra no caixa aberto)
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"ca_emp","role":"authenticated"}', true);
select pg_temp.chk('papel', 'funcionário conclui com dinheiro',
  $q$select (public.complete_appointment('ffffffff-7000-0000-0000-0000000000a8', 'cash'::public.sale_payment_method)).status::text$q$, 'OK=completed');
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select pg_temp.chk('papel', 'venda do funcionário: 100 em dinheiro, paga',
  $q$select s.payment_status::text || '|' || s.total_amount::text from public.sales s join public.appointments a on a.sale_id = s.id where a.id = 'ffffffff-7000-0000-0000-0000000000a8'$q$, 'OK=paid|100.00');

-- ================================================= erros (e nada persiste neles)
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"ca_owner","role":"authenticated"}', true);
select pg_temp.chk('erro', 'atendimento cancelado não conclui',
  $q$select (public.complete_appointment('ffffffff-7000-0000-0000-0000000000a4')).status::text$q$, 'ERR=agendado ou confirmado');
select pg_temp.chk('erro', 'não compareceu não conclui',
  $q$select (public.complete_appointment('ffffffff-7000-0000-0000-0000000000b0')).status::text$q$, 'ERR=agendado ou confirmado');
select pg_temp.chk('erro', 'concluído antes da integração (sem venda) orienta a registrar em Vendas',
  $q$select (public.complete_appointment('ffffffff-7000-0000-0000-0000000000a9')).status::text$q$, 'ERR=antes da integração');
select pg_temp.chk('erro', 'valor sem forma de pagamento é recusado',
  $q$select (public.complete_appointment('ffffffff-7000-0000-0000-0000000000a7', null, 100)).status::text$q$, 'ERR=forma de pagamento');
select pg_temp.chk('erro', 'valor maior que o total é recusado',
  $q$select (public.complete_appointment('ffffffff-7000-0000-0000-0000000000a6', 'cash'::public.sale_payment_method, 400)).status::text$q$, 'ERR=excede');
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select pg_temp.chk('erro', 'erro de valor maior NÃO deixou venda nem mudou o atendimento (tudo ou nada)',
  $q$select a.status::text || '|' || (a.sale_id is null)::text from public.appointments a where a.id = 'ffffffff-7000-0000-0000-0000000000a6'$q$, 'OK=scheduled|true');

-- dono de OUTRA empresa e sem login
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"ca_other","role":"authenticated"}', true);
select pg_temp.chk('seguranca', 'dono de outra empresa recebe "não encontrado"',
  $q$select (public.complete_appointment('ffffffff-7000-0000-0000-0000000000a7')).status::text$q$, 'ERR=não encontrado');
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select pg_temp.chk('seguranca', 'sem usuário autenticado é recusado',
  $q$select (public.complete_appointment('ffffffff-7000-0000-0000-0000000000a7')).status::text$q$, 'ERR=não autenticado');
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select pg_temp.chk('seguranca', 'anon não pode executar a função',
  $q$select has_function_privilege('anon', 'public.complete_appointment(uuid, public.sale_payment_method, numeric)', 'execute')::text$q$, 'OK=false');
select pg_temp.chk('seguranca', 'authenticated pode executar a função',
  $q$select has_function_privilege('authenticated', 'public.complete_appointment(uuid, public.sale_payment_method, numeric)', 'execute')::text$q$, 'OK=true');

do $result$
declare v jsonb;
begin
  select jsonb_build_object(
    'total', count(*),
    'pass', count(*) filter (where ok),
    'fail', count(*) filter (where not ok),
    'falhas', coalesce((select jsonb_agg(jsonb_build_object('grupo', grp, 'teste', label, 'esperado', expect, 'obtido', got) order by n) from r where not ok), '[]'::jsonb)
  ) into v from r;
  raise exception 'RESULT: %', v::text;
end
$result$;
