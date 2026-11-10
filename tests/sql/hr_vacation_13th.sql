-- =============================================================================
-- Bateria SQL — RH fase 3: férias e 13º (20261108180000_hr_vacation_13th).
-- Roda SOMENTE no projeto TEST, depois das fases 1 e 2. Transação que termina em erro proposital (RESULT: ...).
-- =============================================================================
begin;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

insert into public.profiles (user_id, clerk_user_id, full_name, email, role, status) values
  ('ffffffff-0000-0000-0000-0000000000d1', 'hv_owner', 'HV Dono', 'hv-owner@example.invalid', 'user', 'active'),
  ('ffffffff-0000-0000-0000-0000000000d3', 'hv_emp', 'HV Funcionario', 'hv-emp@example.invalid', 'user', 'active'),
  ('ffffffff-0000-0000-0000-0000000000d4', 'hv_other', 'HV Outro Dono', 'hv-other@example.invalid', 'user', 'active');
insert into public.companies (id, name, business_type, status) values
  ('ffffffff-1000-0000-0000-0000000000d1', '[HVTEST] Empresa', 'bakery', 'active'),
  ('ffffffff-1000-0000-0000-0000000000d4', '[HVTEST] Outra', 'bakery', 'active');
alter table public.company_members disable trigger company_members_seat_limit;
insert into public.company_members (company_id, user_id, role) values
  ('ffffffff-1000-0000-0000-0000000000d1', 'ffffffff-0000-0000-0000-0000000000d1', 'owner'),
  ('ffffffff-1000-0000-0000-0000000000d1', 'ffffffff-0000-0000-0000-0000000000d3', 'employee'),
  ('ffffffff-1000-0000-0000-0000000000d4', 'ffffffff-0000-0000-0000-0000000000d4', 'owner');
insert into public.subscriptions (company_id, plan_id, status, starts_at, expires_at, provider)
  select c, (select id from public.plans order by created_at limit 1), 'active', now(), now() + interval '30 days', 'manual'
  from (values ('ffffffff-1000-0000-0000-0000000000d1'::uuid), ('ffffffff-1000-0000-0000-0000000000d4'::uuid)) v(c);

-- informal da empresa (para provar que férias/13º recusam não-CLT)
insert into public.hr_employees (id, company_id, full_name, base_amount, rate_kind, pay_frequency, pay_weekday)
  values ('ffffffff-8000-0000-0000-0000000000d5', 'ffffffff-1000-0000-0000-0000000000d1', 'Informal Teste Silva', 100, 'per_day', 'weekly', 5);

create temp table r (n serial, grp text, label text, expect text, got text, ok boolean);
create temp table ctx (k text primary key, v text);
grant all on r, ctx to authenticated, anon;
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
  insert into r(grp, label, expect, got, ok) values (g, l, e, left(got, 220), pass);
end $$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"hv_owner","role":"authenticated"}', true);

-- funcionário CLT admitido em 15/01/2020, salário 3000 (períodos aquisitivos começam em 15/01 de cada ano)
select pg_temp.chk('setup', 'cadastra CLT admitido em 2020-01-15 (salário 3000)',
  $q$insert into ctx values ('c1', (public.hr_save_clt_employee(null, 'Vera Ferias Teste Souza', null, null, null, null, 3000, 5::smallint, date '2020-01-15', null, 44, 'indefinite', null, null, 0::smallint, false, null)).id::text) returning 'ok'$q$, 'OK=ok');
select pg_temp.chk('setup', 'cadastra CLT sem data de admissão',
  $q$insert into ctx values ('c2', (public.hr_save_clt_employee(null, 'Davi Sem Admissao Teste', null, null, null, null, 2000, 5::smallint, null, null, 44, 'indefinite', null, null, 0::smallint, false, null)).id::text) returning 'ok'$q$, 'OK=ok');

-- ================================================= papéis e isolamento
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"hv_emp","role":"authenticated"}', true);
select pg_temp.chk('rls', 'funcionário (employee) não programa férias',
  $q$select (public.hr_schedule_vacation((select v::uuid from ctx where k = 'c1'), date '2024-01-15', date '2025-03-10', 14::smallint)).id::text$q$, 'ERR=Acesso negado');
select pg_temp.chk('rls', 'funcionário (employee) não gera 13º',
  $q$select (public.hr_close_thirteenth((select v::uuid from ctx where k = 'c1'), extract(year from public.today_sao_paulo())::integer, 1::smallint, 12::smallint, 0, 0, null, false, null, '{}'::jsonb)).id::text$q$, 'ERR=Acesso negado');
select pg_temp.chk('rls', 'funcionário (employee) não lê férias',
  $q$select count(*)::text from public.hr_vacations$q$, 'OK=0');
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"hv_other","role":"authenticated"}', true);
select pg_temp.chk('isolamento', 'outra empresa não programa férias de funcionário alheio',
  $q$select (public.hr_schedule_vacation((select v::uuid from ctx where k = 'c1'), date '2024-01-15', date '2025-03-10', 14::smallint)).id::text$q$, 'ERR=Funcionário não encontrado');
select pg_temp.chk('isolamento', 'outra empresa não gera 13º de funcionário alheio',
  $q$select (public.hr_close_thirteenth((select v::uuid from ctx where k = 'c1'), extract(year from public.today_sao_paulo())::integer, 1::smallint, 12::smallint, 0, 0, null, false, null, '{}'::jsonb)).id::text$q$, 'ERR=Funcionário não encontrado');
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"hv_owner","role":"authenticated"}', true);

-- ================================================= programar férias
select pg_temp.chk('ferias', 'férias são só para CLT',
  $q$select (public.hr_schedule_vacation('ffffffff-8000-0000-0000-0000000000d5', date '2024-01-15', date '2025-03-10', 14::smallint)).id::text$q$, 'ERR=só para funcionário CLT');
select pg_temp.chk('ferias', 'sem data de admissão não programa férias',
  $q$select (public.hr_schedule_vacation((select v::uuid from ctx where k = 'c2'), date '2024-01-15', date '2025-03-10', 14::smallint)).id::text$q$, 'ERR=data de admissão');
select pg_temp.chk('ferias', 'período aquisitivo fora do aniversário da admissão é recusado',
  $q$select (public.hr_schedule_vacation((select v::uuid from ctx where k = 'c1'), date '2024-02-01', date '2025-03-10', 14::smallint)).id::text$q$, 'ERR=Período aquisitivo inválido');
select pg_temp.chk('ferias', 'período aquisitivo antes da admissão é recusado',
  $q$select (public.hr_schedule_vacation((select v::uuid from ctx where k = 'c1'), date '2019-01-15', date '2025-03-10', 14::smallint)).id::text$q$, 'ERR=Período aquisitivo inválido');
select pg_temp.chk('ferias', 'férias só começam depois de fechar o período aquisitivo',
  $q$select (public.hr_schedule_vacation((select v::uuid from ctx where k = 'c1'), date '2024-01-15', date '2024-12-01', 14::smallint)).id::text$q$, 'ERR=só podem começar depois');
select pg_temp.chk('ferias', 'menos de 5 dias é recusado',
  $q$select (public.hr_schedule_vacation((select v::uuid from ctx where k = 'c1'), date '2024-01-15', date '2025-03-10', 4::smallint)).id::text$q$, 'ERR=pelo menos 5');
select pg_temp.chk('ferias', 'faltas demais (33) tiram o direito',
  $q$select (public.hr_schedule_vacation((select v::uuid from ctx where k = 'c1'), date '2024-01-15', date '2025-03-10', 14::smallint, 33::smallint)).id::text$q$, 'ERR=Sem direito');
select pg_temp.chk('ferias', 'programa 14 dias (direito de 30)',
  $q$insert into ctx values ('v1', (public.hr_schedule_vacation((select v::uuid from ctx where k = 'c1'), date '2024-01-15', date '2025-03-10', 14::smallint)).id::text) returning 'ok'$q$, 'OK=ok');
select pg_temp.chk('ferias', 'ficou com direito de 30 dias e fim do período aquisitivo em 14/01/2025',
  $q$select entitled_days::text || '|' || days::text || '|' || acquisition_end::text from public.hr_vacations where id = (select v::uuid from ctx where k = 'v1')$q$, 'OK=30|14|2025-01-14');
select pg_temp.chk('ferias', '14 + 14 deixaria 2 dias soltos: recusado',
  $q$select (public.hr_schedule_vacation((select v::uuid from ctx where k = 'c1'), date '2024-01-15', date '2025-06-02', 14::smallint)).id::text$q$, 'ERR=Sobrariam');
select pg_temp.chk('ferias', 'sobrepor outro período programado é recusado',
  $q$select (public.hr_schedule_vacation((select v::uuid from ctx where k = 'c1'), date '2024-01-15', date '2025-03-15', 5::smallint)).id::text$q$, 'ERR=se sobrepõem');
select pg_temp.chk('ferias', 'passar dos 30 dias é recusado',
  $q$select (public.hr_schedule_vacation((select v::uuid from ctx where k = 'c1'), date '2024-01-15', date '2025-06-02', 17::smallint)).id::text$q$, 'ERR=Passa dos 30');
select pg_temp.chk('ferias', 'programa o 2º período (16 dias)',
  $q$insert into ctx values ('v2', (public.hr_schedule_vacation((select v::uuid from ctx where k = 'c1'), date '2024-01-15', date '2025-06-02', 16::smallint)).id::text) returning 'ok'$q$, 'OK=ok');
select pg_temp.chk('ferias', 'cancelar férias sem pagamento funciona',
  $q$select (public.hr_cancel_vacation((select v::uuid from ctx where k = 'v2'))).canceled_at is not null$q$, 'OK=true');
select pg_temp.chk('ferias', 'depois de cancelar dá para programar de novo o 2º período',
  $q$insert into ctx values ('v2b', (public.hr_schedule_vacation((select v::uuid from ctx where k = 'c1'), date '2024-01-15', date '2025-06-02', 16::smallint)).id::text) returning 'ok'$q$, 'OK=ok');

-- três períodos todos menores que 14 dias não valem (período aquisitivo seguinte)
select pg_temp.chk('ferias', 'período seguinte: 10 dias agora é aceito (dá para ter 20 depois)',
  $q$select (public.hr_schedule_vacation((select v::uuid from ctx where k = 'c1'), date '2025-01-15', date '2026-03-01', 10::smallint)).days::text$q$, 'OK=10');
select pg_temp.chk('ferias', 'segundo de 10 dias deixaria 10 sem período de 14: recusado',
  $q$select (public.hr_schedule_vacation((select v::uuid from ctx where k = 'c1'), date '2025-01-15', date '2026-05-01', 10::smallint)).id::text$q$, 'ERR=14 dias');
select pg_temp.chk('ferias', 'faltas reduzem o direito (7 faltas = 24 dias) e ficam gravadas',
  $q$select (public.hr_schedule_vacation((select v::uuid from ctx where k = 'c1'), date '2023-01-15', date '2024-05-01', 24::smallint, 7::smallint)).entitled_days::text$q$, 'OK=24');

-- ================================================= pagamento das férias
select pg_temp.chk('pagamento', 'INSS acima de 20% do bruto é recusado',
  $q$select (public.hr_close_vacation_pay((select v::uuid from ctx where k = 'v1'), 900, 0, null, null, '{}'::jsonb)).id::text$q$, 'ERR=INSS acima');
select pg_temp.chk('pagamento', 'cálculo nulo é recusado',
  $q$select (public.hr_close_vacation_pay((select v::uuid from ctx where k = 'v1'), 100, 0, null, null, null)).id::text$q$, 'ERR=Cálculo inválido');
select pg_temp.chk('pagamento', 'gera o pagamento das férias de 14 dias',
  $q$insert into ctx values ('pv1', (public.hr_close_vacation_pay((select v::uuid from ctx where k = 'v1'), 140, 0, null, null, '{"estimate":true}'::jsonb)).id::text) returning 'ok'$q$, 'OK=ok');
select pg_temp.chk('pagamento', 'bruto 1866,67 (1400 + 1/3), descontos 140, líquido 1726,67, tipo vacation, vence 2 dias antes',
  $q$select gross_amount::text || '|' || deductions_amount::text || '|' || net_amount::text || '|' || kind || '|' || due_on::text || '|' || period_start::text || '|' || period_end::text
       from public.hr_payments where id = (select v::uuid from ctx where k = 'pv1')$q$, 'OK=1866.67|140.00|1726.67|vacation|2025-03-08|2025-03-10|2025-03-23');
select pg_temp.chk('pagamento', 'o retrato guarda os números do banco',
  $q$select (calc->'db'->>'days_amount') || '|' || (calc->'db'->>'one_third') || '|' || (calc->'db'->>'net') from public.hr_payments where id = (select v::uuid from ctx where k = 'pv1')$q$, 'OK=1400.00|466.67|1726.67');
select pg_temp.chk('pagamento', 'as férias ficaram ligadas ao pagamento',
  $q$select (payment_id = (select v::uuid from ctx where k = 'pv1'))::text from public.hr_vacations where id = (select v::uuid from ctx where k = 'v1')$q$, 'OK=true');
select pg_temp.chk('pagamento', 'não gera o pagamento duas vezes',
  $q$select (public.hr_close_vacation_pay((select v::uuid from ctx where k = 'v1'), 140, 0, null, null, '{}'::jsonb)).id::text$q$, 'ERR=já têm pagamento');
select pg_temp.chk('pagamento', 'férias com pagamento não podem ser canceladas',
  $q$select (public.hr_cancel_vacation((select v::uuid from ctx where k = 'v1'))).id::text$q$, 'ERR=já têm pagamento');
select pg_temp.chk('pagamento', 'pagamento de férias não bloqueia a folha de março/2025 (outro tipo)',
  $q$select (public.hr_close_payroll((select v::uuid from ctx where k = 'c1'), date '2025-03-01', 0, 0, 14, 0, 0, 0, null, null, '{}'::jsonb)).net_amount::text$q$, 'OK=1600.00');
select pg_temp.chk('pagamento', 'paga as férias em Pix: despesa em Pessoal com descrição de férias',
  $q$select (public.hr_pay_payment((select v::uuid from ctx where k = 'pv1'), 'pix')).status::text$q$, 'OK=paid');
select pg_temp.chk('pagamento', 'despesa de 1726,67 em Pessoal, descrição "Férias — ..."',
  $q$select fe.amount::text || '|' || fc.name || '|' || (fe.description like 'Férias — Vera Ferias Teste Souza (10/03 a 23/03)')::text
       from public.financial_entries fe join public.financial_categories fc on fc.id = fe.category_id where fe.description like 'Férias —%'$q$, 'OK=1726.67|Pessoal|true');
select pg_temp.chk('pagamento', 'gera pagamento do 2º período e cancela: as férias ficam livres de novo',
  $q$insert into ctx values ('pv2', (public.hr_close_vacation_pay((select v::uuid from ctx where k = 'v2b'), 100, 0, null, null, '{}'::jsonb)).id::text) returning 'ok'$q$, 'OK=ok');
select pg_temp.chk('pagamento', 'cancelar o pagamento pendente',
  $q$select (public.hr_cancel_payment((select v::uuid from ctx where k = 'pv2'))).status::text$q$, 'OK=canceled');
select pg_temp.chk('pagamento', 'férias do 2º período sem pagamento de novo',
  $q$select (payment_id is null)::text from public.hr_vacations where id = (select v::uuid from ctx where k = 'v2b')$q$, 'OK=true');

-- ================================================= 13º salário
select pg_temp.chk('13o', 'ano futuro é recusado',
  $q$select (public.hr_close_thirteenth((select v::uuid from ctx where k = 'c1'), extract(year from public.today_sao_paulo())::integer + 1, 1::smallint, 12::smallint, 0, 0, null, false, null, '{}'::jsonb)).id::text$q$, 'ERR=Ano inválido');
select pg_temp.chk('13o', 'parcela 3 é recusada',
  $q$select (public.hr_close_thirteenth((select v::uuid from ctx where k = 'c1'), extract(year from public.today_sao_paulo())::integer, 3::smallint, 12::smallint, 0, 0, null, false, null, '{}'::jsonb)).id::text$q$, 'ERR=Parcela inválida');
select pg_temp.chk('13o', 'avos 13 é recusado',
  $q$select (public.hr_close_thirteenth((select v::uuid from ctx where k = 'c1'), extract(year from public.today_sao_paulo())::integer, 1::smallint, 13::smallint, 0, 0, null, false, null, '{}'::jsonb)).id::text$q$, 'ERR=Avos inválidos');
select pg_temp.chk('13o', '13º só para CLT',
  $q$select (public.hr_close_thirteenth('ffffffff-8000-0000-0000-0000000000d5', extract(year from public.today_sao_paulo())::integer, 1::smallint, 12::smallint, 0, 0, null, false, null, '{}'::jsonb)).id::text$q$, 'ERR=só para funcionário CLT');
select pg_temp.chk('13o', '2ª parcela sem a 1ª é recusada',
  $q$select (public.hr_close_thirteenth((select v::uuid from ctx where k = 'c1'), extract(year from public.today_sao_paulo())::integer, 2::smallint, 12::smallint, 248.6, 0, null, false, null, '{}'::jsonb)).id::text$q$, 'ERR=Gere antes a 1ª parcela');
select pg_temp.chk('13o', '1ª parcela não aceita descontos',
  $q$select (public.hr_close_thirteenth((select v::uuid from ctx where k = 'c1'), extract(year from public.today_sao_paulo())::integer, 1::smallint, 12::smallint, 10, 0, null, false, null, '{}'::jsonb)).id::text$q$, 'ERR=não tem descontos');
select pg_temp.chk('13o', 'gera a 1ª parcela (12 avos de 3000: 1500, sem descontos)',
  $q$insert into ctx values ('t1', (public.hr_close_thirteenth((select v::uuid from ctx where k = 'c1'), extract(year from public.today_sao_paulo())::integer, 1::smallint, 12::smallint, 0, 0, null, false, null, '{"estimate":true}'::jsonb)).id::text) returning 'ok'$q$, 'OK=ok');
select pg_temp.chk('13o', '1ª parcela: bruto 1500, líquido 1500, vence em 30/11, tipo thirteenth',
  $q$select gross_amount::text || '|' || net_amount::text || '|' || kind || '|' || to_char(due_on, 'MM-DD') || '|' || (calc->>'installment') || '|' || (calc->>'avos') || '|' || (calc->'db'->>'total')
       from public.hr_payments where id = (select v::uuid from ctx where k = 't1')$q$, 'OK=1500.00|1500.00|thirteenth|11-30|1|12|3000.00');
select pg_temp.chk('13o', 'não gera a mesma parcela duas vezes',
  $q$select (public.hr_close_thirteenth((select v::uuid from ctx where k = 'c1'), extract(year from public.today_sao_paulo())::integer, 1::smallint, 12::smallint, 0, 0, null, false, null, '{}'::jsonb)).id::text$q$, 'ERR=já foi gerada');
select pg_temp.chk('13o', '2ª parcela com avos diferentes da 1ª é recusada',
  $q$select (public.hr_close_thirteenth((select v::uuid from ctx where k = 'c1'), extract(year from public.today_sao_paulo())::integer, 2::smallint, 11::smallint, 200, 0, null, false, null, '{}'::jsonb)).id::text$q$, 'ERR=devem ser os mesmos');
select pg_temp.chk('13o', 'INSS acima de 20% do total é recusado na 2ª parcela',
  $q$select (public.hr_close_thirteenth((select v::uuid from ctx where k = 'c1'), extract(year from public.today_sao_paulo())::integer, 2::smallint, 12::smallint, 900, 0, null, false, null, '{}'::jsonb)).id::text$q$, 'ERR=INSS acima');
select pg_temp.chk('13o', 'gera a 2ª parcela (bruto 1500, INSS 248,60: líquido 1251,40, vence em 20/12)',
  $q$insert into ctx values ('t2', (public.hr_close_thirteenth((select v::uuid from ctx where k = 'c1'), extract(year from public.today_sao_paulo())::integer, 2::smallint, 12::smallint, 248.6, 0, null, false, null, '{"estimate":true}'::jsonb)).id::text) returning 'ok'$q$, 'OK=ok');
select pg_temp.chk('13o', '2ª parcela: números',
  $q$select gross_amount::text || '|' || deductions_amount::text || '|' || net_amount::text || '|' || to_char(due_on, 'MM-DD') from public.hr_payments where id = (select v::uuid from ctx where k = 't2')$q$, 'OK=1500.00|248.60|1251.40|12-20');
select pg_temp.chk('13o', '2ª parcela de ano anterior com 1ª paga fora do sistema é aceita',
  $q$select (public.hr_close_thirteenth((select v::uuid from ctx where k = 'c1'), extract(year from public.today_sao_paulo())::integer - 1, 2::smallint, 12::smallint, 248.6, 0, null, true, null, '{}'::jsonb)).net_amount::text$q$, 'OK=1251.40');
select pg_temp.chk('13o', 'paga a 1ª parcela: despesa "13º salário (1ª parcela)"',
  $q$select (public.hr_pay_payment((select v::uuid from ctx where k = 't1'), 'pix')).status::text$q$, 'OK=paid');
select pg_temp.chk('13o', 'descrição e valor no Financeiro',
  $q$select fe.amount::text || '|' || fc.name || '|' || (fe.description like '13º salário (1ª parcela) — Vera Ferias Teste Souza (%')::text
       from public.financial_entries fe join public.financial_categories fc on fc.id = fe.category_id where fe.description like '13º salário%'$q$, 'OK=1500.00|Pessoal|true');
select pg_temp.chk('13o', '13º não bloqueia a folha do mês corrente (outro tipo)',
  $q$select (public.hr_close_payroll((select v::uuid from ctx where k = 'c1'), date_trunc('month', public.today_sao_paulo())::date, 0, 0, 0, 0, 0, 0, null, null, '{}'::jsonb)).net_amount::text$q$, 'OK=3000.00');
select pg_temp.chk('13o', 'o período por dias recusa CLT mesmo com 13º',
  $q$select (public.hr_close_period((select v::uuid from ctx where k = 'c1'), public.today_sao_paulo() - 3, public.today_sao_paulo())).id::text$q$, 'ERR=feche a folha do mês');
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- ================================================= segurança
select pg_temp.chk('seguranca', 'anon não executa as funções novas',
  $q$select (has_function_privilege('anon', 'public.hr_schedule_vacation(uuid, date, date, smallint, smallint, text)', 'execute')
          or has_function_privilege('anon', 'public.hr_cancel_vacation(uuid)', 'execute')
          or has_function_privilege('anon', 'public.hr_close_vacation_pay(uuid, numeric, numeric, date, text, jsonb)', 'execute')
          or has_function_privilege('anon', 'public.hr_close_thirteenth(uuid, integer, smallint, smallint, numeric, numeric, date, boolean, text, jsonb)', 'execute'))::text$q$, 'OK=false');
select pg_temp.chk('seguranca', 'anon não lê férias; authenticated não escreve em férias',
  $q$select (has_table_privilege('anon', 'public.hr_vacations', 'select') or has_table_privilege('authenticated', 'public.hr_vacations', 'insert') or has_table_privilege('authenticated', 'public.hr_vacations', 'update'))::text$q$, 'OK=false');

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
