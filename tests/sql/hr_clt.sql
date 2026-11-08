-- =============================================================================
-- Bateria SQL — RH fase 2 / modo CLT (20261108170000_hr_clt).
-- Roda SOMENTE no projeto TEST, depois da fase 1 (20261108160000_hr_informal). Transação que termina em erro
-- proposital (RESULT: ...): nada persiste.
-- =============================================================================
begin;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

insert into public.profiles (user_id, clerk_user_id, full_name, email, role, status) values
  ('ffffffff-0000-0000-0000-0000000000f1', 'hc_owner', 'HC Dono', 'hc-owner@example.invalid', 'user', 'active'),
  ('ffffffff-0000-0000-0000-0000000000f2', 'hc_admin', 'HC Admin', 'hc-admin@example.invalid', 'user', 'active'),
  ('ffffffff-0000-0000-0000-0000000000f3', 'hc_emp', 'HC Funcionario', 'hc-emp@example.invalid', 'user', 'active'),
  ('ffffffff-0000-0000-0000-0000000000f4', 'hc_other', 'HC Outro Dono', 'hc-other@example.invalid', 'user', 'active');
insert into public.companies (id, name, business_type, status) values
  ('ffffffff-1000-0000-0000-0000000000f1', '[HCTEST] Empresa', 'bakery', 'active'),
  ('ffffffff-1000-0000-0000-0000000000f4', '[HCTEST] Outra', 'bakery', 'active');
alter table public.company_members disable trigger company_members_seat_limit;
insert into public.company_members (company_id, user_id, role) values
  ('ffffffff-1000-0000-0000-0000000000f1', 'ffffffff-0000-0000-0000-0000000000f1', 'owner'),
  ('ffffffff-1000-0000-0000-0000000000f1', 'ffffffff-0000-0000-0000-0000000000f2', 'admin'),
  ('ffffffff-1000-0000-0000-0000000000f1', 'ffffffff-0000-0000-0000-0000000000f3', 'employee'),
  ('ffffffff-1000-0000-0000-0000000000f4', 'ffffffff-0000-0000-0000-0000000000f4', 'owner');
insert into public.subscriptions (company_id, plan_id, status, starts_at, expires_at, provider)
  select c, (select id from public.plans order by created_at limit 1), 'active', now(), now() + interval '30 days', 'manual'
  from (values ('ffffffff-1000-0000-0000-0000000000f1'::uuid), ('ffffffff-1000-0000-0000-0000000000f4'::uuid)) v(c);

-- funcionário informal da empresa (para provar que a folha recusa não-CLT) e CLT da outra empresa
insert into public.hr_employees (id, company_id, full_name, base_amount, rate_kind, pay_frequency, pay_weekday)
  values ('ffffffff-8000-0000-0000-0000000000f5', 'ffffffff-1000-0000-0000-0000000000f1', 'Informal Teste Silva', 100, 'per_day', 'weekly', 5);
insert into public.hr_employees (id, company_id, full_name, mode, rate_kind, base_amount, pay_frequency, pay_day_of_month)
  values ('ffffffff-8000-0000-0000-0000000000f9', 'ffffffff-1000-0000-0000-0000000000f4', 'Clt Da Outra Empresa', 'clt', 'fixed', 2000, 'monthly', 5);

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

-- ================================================= tabelas de impostos
select pg_temp.chk('tabelas', 'seed 2026: INSS, IRRF e parâmetros existem desde 01/01/2026',
  $q$select string_agg(kind || ':' || valid_from::text, ',' order by kind) from public.hr_tax_tables where valid_from = date '2026-01-01'$q$,
  'OK=inss:2026-01-01,irrf:2026-01-01,params:2026-01-01');
select pg_temp.chk('tabelas', 'INSS tem as 4 faixas e o teto de 8.475,55',
  $q$select jsonb_array_length(data->'brackets')::text || '|' || (data->'brackets'->3->>'upto') from public.hr_tax_tables where kind = 'inss' and valid_from = date '2026-01-01'$q$,
  'OK=4|8475.55');
select pg_temp.chk('tabelas', 'IRRF: dedução por dependente 189.59, simplificado 607.20, redução até 5.000',
  $q$select (data->>'dependent_deduction') || '|' || (data->>'simplified_discount') || '|' || (data->'reduction'->>'zero_until') from public.hr_tax_tables where kind = 'irrf' and valid_from = date '2026-01-01'$q$,
  'OK=189.59|607.20|5000.00');
select pg_temp.chk('tabelas', 'parâmetros: salário mínimo 1621, FGTS 8%, VT 6%',
  $q$select (data->>'minimum_wage') || '|' || (data->>'fgts_rate') || '|' || (data->>'vt_employee_rate') from public.hr_tax_tables where kind = 'params' and valid_from = date '2026-01-01'$q$,
  'OK=1621.00|0.08|0.06');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"hc_owner","role":"authenticated"}', true);
select pg_temp.chk('tabelas', 'dono lê as tabelas',
  $q$select count(*)::text from public.hr_tax_tables$q$, 'OK=3');
select pg_temp.chk('tabelas', 'ninguém grava nas tabelas de impostos',
  $q$insert into public.hr_tax_tables (kind, valid_from, data, source) values ('inss', date '2030-01-01', '{}'::jsonb, 'x')$q$, 'ERR=permission denied');
select pg_temp.chk('tabelas', 'ninguém altera as tabelas de impostos',
  $q$update public.hr_tax_tables set data = '{}'::jsonb$q$, 'ERR=permission denied');
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"hc_emp","role":"authenticated"}', true);
select pg_temp.chk('tabelas', 'funcionário (employee) não lê as tabelas',
  $q$select count(*)::text from public.hr_tax_tables$q$, 'OK=0');
select pg_temp.chk('clt', 'funcionário (employee) não cadastra CLT',
  $q$select (public.hr_save_clt_employee(null, 'Clt Falso Teste', null, null, null, null, 2000, 5::smallint, null, null, 44, 'indefinite', null, null, 0::smallint, false, null)).id::text$q$, 'ERR=Acesso negado');
select pg_temp.chk('clt', 'funcionário (employee) não salva configurações',
  $q$select employer_regime from public.hr_save_settings('mei', null)$q$, 'ERR=Acesso negado');
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- ================================================= cadastro CLT
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"hc_owner","role":"authenticated"}', true);

select pg_temp.chk('clt', 'dono cadastra funcionário CLT (salário 3000, 44 h, 1 dependente, VT)',
  $q$insert into ctx values ('clt1', (public.hr_save_clt_employee(null, 'Ana Clt Teste Souza', date '1992-03-10', '11999990000', 'Atendente', null, 3000, 5::smallint, date '2026-01-05', null, 44, 'indefinite', null, null, 1::smallint, true, 250)).id::text) returning 'ok'$q$, 'OK=ok');
select pg_temp.chk('clt', 'ficou como CLT, mensal, salário em base_amount',
  $q$select mode::text || '|' || rate_kind::text || '|' || pay_frequency::text || '|' || base_amount::text || '|' || pay_day_of_month::text from public.hr_employees where id = (select v::uuid from ctx where k = 'clt1')$q$,
  'OK=clt|fixed|monthly|3000.00|5');
select pg_temp.chk('clt', 'dados do contrato gravados',
  $q$select weekly_hours::text || '|' || contract_type || '|' || dependents::text || '|' || vt_enabled::text || '|' || vt_monthly_cost::text from public.hr_employee_clt where employee_id = (select v::uuid from ctx where k = 'clt1')$q$,
  'OK=44.0|indefinite|1|true|250.00');
select pg_temp.chk('clt', 'edição atualiza salário e contrato (upsert)',
  $q$select (public.hr_save_clt_employee((select v::uuid from ctx where k = 'clt1'), 'Ana Clt Teste Souza', date '1992-03-10', '11999990000', 'Atendente Sênior', null, 3000, 5::smallint, date '2026-01-05', null, 40, 'indefinite', null, null, 1::smallint, true, 250)).role_title$q$, 'OK=Atendente Sênior');
select pg_temp.chk('clt', 'jornada ficou 40 h e continua 1 linha de contrato',
  $q$select weekly_hours::text || '|' || (select count(*) from public.hr_employee_clt where employee_id = (select v::uuid from ctx where k = 'clt1'))::text from public.hr_employee_clt where employee_id = (select v::uuid from ctx where k = 'clt1')$q$, 'OK=40.0|1');
select pg_temp.chk('clt', 'salário zero é recusado',
  $q$select (public.hr_save_clt_employee(null, 'Clt Sem Salario', null, null, null, null, 0, 5::smallint, null, null, 44, 'indefinite', null, null, 0::smallint, false, null)).id::text$q$, 'ERR=Informe o salário');
select pg_temp.chk('clt', 'jornada acima de 44 h é recusada',
  $q$select (public.hr_save_clt_employee(null, 'Clt Jornada Longa', null, null, null, null, 2000, 5::smallint, null, null, 50, 'indefinite', null, null, 0::smallint, false, null)).id::text$q$, 'ERR=entre 1 e 44');
select pg_temp.chk('clt', 'experiência sem dias é recusada',
  $q$select (public.hr_save_clt_employee(null, 'Clt Experiencia', null, null, null, null, 2000, 5::smallint, null, null, 44, 'experience', null, null, 0::smallint, false, null)).id::text$q$, 'ERR=de 1 a 90 dias');
select pg_temp.chk('clt', 'experiência de 91 dias é recusada',
  $q$select (public.hr_save_clt_employee(null, 'Clt Experiencia', null, null, null, null, 2000, 5::smallint, null, null, 44, 'experience', 91::smallint, null, 0::smallint, false, null)).id::text$q$, 'ERR=de 1 a 90 dias');
select pg_temp.chk('clt', 'experiência de 45 dias é aceita',
  $q$select (public.hr_save_clt_employee(null, 'Clt Experiencia Ok', null, null, null, null, 1700, 5::smallint, null, null, 44, 'experience', 45::smallint, null, 0::smallint, false, null)).full_name$q$, 'OK=Clt Experiencia Ok');
select pg_temp.chk('clt', 'dia de pagamento 0 é recusado',
  $q$select (public.hr_save_clt_employee(null, 'Clt Dia Zero', null, null, null, null, 2000, 0::smallint, null, null, 44, 'indefinite', null, null, 0::smallint, false, null)).id::text$q$, 'ERR=dia do mês');
select pg_temp.chk('clt', 'dependentes negativos são recusados',
  $q$select (public.hr_save_clt_employee(null, 'Clt Dependentes', null, null, null, null, 2000, 5::smallint, null, null, 44, 'indefinite', null, null, (-1)::smallint, false, null)).id::text$q$, 'ERR=dependentes');
select pg_temp.chk('clt', 'não edita funcionário informal como CLT',
  $q$select (public.hr_save_clt_employee('ffffffff-8000-0000-0000-0000000000f5', 'Informal Teste Silva', null, null, null, null, 2000, 5::smallint, null, null, 44, 'indefinite', null, null, 0::smallint, false, null)).id::text$q$, 'ERR=não é CLT');
select pg_temp.chk('clt', 'não edita funcionário de outra empresa',
  $q$select (public.hr_save_clt_employee('ffffffff-8000-0000-0000-0000000000f9', 'Clt Da Outra Empresa', null, null, null, null, 2000, 5::smallint, null, null, 44, 'indefinite', null, null, 0::smallint, false, null)).id::text$q$, 'ERR=Funcionário não encontrado');
select pg_temp.chk('clt', 'CLT com frequência semanal direto na tabela é recusado (forma do CLT)',
  $q$insert into public.hr_employees (company_id, full_name, mode, rate_kind, base_amount, pay_frequency, pay_weekday)
     values ('ffffffff-1000-0000-0000-0000000000f1', 'Clt Forma Errada', 'clt', 'fixed', 2000, 'weekly', 5)$q$, 'ERR=hr_employees_clt_shape');
select pg_temp.chk('clt', 'escrita direta no contrato é negada',
  $q$update public.hr_employee_clt set dependents = 5$q$, 'ERR=permission denied');
select pg_temp.chk('clt', 'cadastro de CLT gerou auditoria',
  $q$select count(*)::text from public.audit_logs where action = 'hr.employee_created' and company_id = 'ffffffff-1000-0000-0000-0000000000f1'$q$, 'OK=3');

-- ================================================= configurações
select pg_temp.chk('config', 'regime inválido é recusado',
  $q$select employer_regime from public.hr_save_settings('lucro', null)$q$, 'ERR=Regime inválido');
select pg_temp.chk('config', 'outro regime exige o percentual',
  $q$select employer_regime from public.hr_save_settings('other', null)$q$, 'ERR=percentual');
select pg_temp.chk('config', 'percentual acima de 50% é recusado',
  $q$select employer_regime from public.hr_save_settings('other', 0.6)$q$, 'ERR=percentual');
select pg_temp.chk('config', 'salva regime MEI (taxa zerada)',
  $q$select employer_regime || '|' || employer_inss_rate::text from public.hr_save_settings('mei', 0.2)$q$, 'OK=mei|0.0000');
select pg_temp.chk('config', 'salva outro regime com 20,8%',
  $q$select employer_regime || '|' || employer_inss_rate::text from public.hr_save_settings('other', 0.208)$q$, 'OK=other|0.2080');
select pg_temp.chk('config', 'configuração fica uma linha só por empresa',
  $q$select count(*)::text from public.hr_settings where company_id = 'ffffffff-1000-0000-0000-0000000000f1'$q$, 'OK=1');
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"hc_other","role":"authenticated"}', true);
select pg_temp.chk('config', 'outra empresa não enxerga a configuração alheia',
  $q$select count(*)::text from public.hr_settings$q$, 'OK=0');
select pg_temp.chk('isolamento', 'outra empresa não fecha folha de funcionário alheio',
  $q$select (public.hr_close_payroll((select v::uuid from ctx where k = 'clt1'), date '2026-11-01', 0, 0, 0, 0, 0, 0, null, null, '{}'::jsonb)).id::text$q$, 'ERR=Funcionário não encontrado');
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- ================================================= folha
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"hc_owner","role":"authenticated"}', true);

select pg_temp.chk('folha', 'período por dias não serve para CLT',
  $q$select (public.hr_close_period((select v::uuid from ctx where k = 'clt1'), public.today_sao_paulo() - 3, public.today_sao_paulo())).id::text$q$, 'ERR=feche a folha do mês');
select pg_temp.chk('folha', 'folha mensal não serve para informal',
  $q$select (public.hr_close_payroll('ffffffff-8000-0000-0000-0000000000f5', date_trunc('month', public.today_sao_paulo())::date, 0, 0, 0, 0, 0, 0, null, null, '{}'::jsonb)).id::text$q$, 'ERR=só para funcionário CLT');
select pg_temp.chk('folha', 'mês futuro é recusado',
  $q$select (public.hr_close_payroll((select v::uuid from ctx where k = 'clt1'), (date_trunc('month', public.today_sao_paulo()) + interval '2 months')::date, 0, 0, 0, 0, 0, 0, null, null, '{}'::jsonb)).id::text$q$, 'ERR=ainda não começou');
select pg_temp.chk('folha', 'horas extras absurdas são recusadas',
  $q$select (public.hr_close_payroll((select v::uuid from ctx where k = 'clt1'), date_trunc('month', public.today_sao_paulo())::date, 500, 0, 0, 0, 0, 0, null, null, '{}'::jsonb)).id::text$q$, 'ERR=Horas extras inválidas');
select pg_temp.chk('folha', 'cálculo vazio (nulo) é recusado',
  $q$select (public.hr_close_payroll((select v::uuid from ctx where k = 'clt1'), date_trunc('month', public.today_sao_paulo())::date, 0, 0, 0, 0, 0, 0, null, null, null)).id::text$q$, 'ERR=Cálculo inválido');

-- lançamentos em aberto do mês: bônus 50, desconto 20, vale 200 (Pix)
select pg_temp.chk('folha', 'bônus de 50 em aberto',
  $q$select (public.hr_add_adjustment((select v::uuid from ctx where k = 'clt1'), 'bonus', 50, null, 'Gratificação')).amount::text$q$, 'OK=50.00');
select pg_temp.chk('folha', 'desconto de 20 em aberto',
  $q$select (public.hr_add_adjustment((select v::uuid from ctx where k = 'clt1'), 'deduction', 20, null, 'Desconto')).amount::text$q$, 'OK=20.00');
select pg_temp.chk('folha', 'vale de 200 em Pix',
  $q$select (public.hr_add_adjustment((select v::uuid from ctx where k = 'clt1'), 'advance', 200, null, null, 'pix')).amount::text$q$, 'OK=200.00');

-- salário 3000, jornada 40 h (divisor 200 → hora 15,00): 10 h extras 50% = 225,00; 4 h 100% = 120,00; 1 falta = 100,00
-- bruto = 3000 + 225 + 120 + 50 − 100 = 3295,00 ; descontos = INSS 270,00 + IRRF 0 + VT 120,00 + desconto 20 = 410,00
-- líquido = 3295 − 410 − vale 200 = 2685,00
select pg_temp.chk('folha', 'sanidade: INSS acima de 20% do bruto é recusado',
  $q$select (public.hr_close_payroll((select v::uuid from ctx where k = 'clt1'), date_trunc('month', public.today_sao_paulo())::date, 10, 4, 1, 900, 0, 120, null, null, '{}'::jsonb)).id::text$q$, 'ERR=INSS acima');
select pg_temp.chk('folha', 'sanidade: IRRF acima de 30% do bruto é recusado',
  $q$select (public.hr_close_payroll((select v::uuid from ctx where k = 'clt1'), date_trunc('month', public.today_sao_paulo())::date, 10, 4, 1, 270, 1500, 120, null, null, '{}'::jsonb)).id::text$q$, 'ERR=IRRF acima');
select pg_temp.chk('folha', 'sanidade: VT acima de 10% do salário é recusado',
  $q$select (public.hr_close_payroll((select v::uuid from ctx where k = 'clt1'), date_trunc('month', public.today_sao_paulo())::date, 10, 4, 1, 270, 0, 400, null, null, '{}'::jsonb)).id::text$q$, 'ERR=vale-transporte acima');
select pg_temp.chk('folha', 'fecha a folha do mês',
  $q$insert into ctx values ('pr1', (public.hr_close_payroll((select v::uuid from ctx where k = 'clt1'), date_trunc('month', public.today_sao_paulo())::date, 10, 4, 1, 270, 0, 120, null, 'Folha teste', '{"tables":{"inss":"2026-01-01"}}'::jsonb)).id::text) returning 'ok'$q$, 'OK=ok');
select pg_temp.chk('folha', 'bruto 3295,00; descontos 410,00; vales 200,00; líquido 2685,00',
  $q$select gross_amount::text || '|' || deductions_amount::text || '|' || advances_amount::text || '|' || net_amount::text || '|' || kind || '|' || status::text
       from public.hr_payments where id = (select v::uuid from ctx where k = 'pr1')$q$, 'OK=3295.00|410.00|200.00|2685.00|payroll|pending');
select pg_temp.chk('folha', 'período = mês inteiro e mês de referência gravado',
  $q$select (period_start = date_trunc('month', public.today_sao_paulo())::date)::text || '|' || (period_end = (date_trunc('month', public.today_sao_paulo()) + interval '1 month - 1 day')::date)::text || '|' || (reference_month = period_start)::text
       from public.hr_payments where id = (select v::uuid from ctx where k = 'pr1')$q$, 'OK=true|true|true');
select pg_temp.chk('folha', 'retrato guarda o cálculo do app e os números do banco',
  $q$select (calc->'tables'->>'inss') || '|' || (calc->'db'->>'hourly_rate') || '|' || (calc->'db'->>'overtime50') || '|' || (calc->'db'->>'overtime100') || '|' || (calc->'db'->>'absences') || '|' || (calc->'db'->>'bonus')
       from public.hr_payments where id = (select v::uuid from ctx where k = 'pr1')$q$, 'OK=2026-01-01|15.00|225.00|120.00|100.00|50.00');
select pg_temp.chk('folha', 'bônus, desconto e vale ficaram presos à folha',
  $q$select count(*)::text from public.hr_adjustments where payment_id = (select v::uuid from ctx where k = 'pr1')$q$, 'OK=3');
select pg_temp.chk('folha', 'não fecha o mesmo mês duas vezes',
  $q$select (public.hr_close_payroll((select v::uuid from ctx where k = 'clt1'), date_trunc('month', public.today_sao_paulo())::date, 0, 0, 0, 0, 0, 0, null, null, '{}'::jsonb)).id::text$q$, 'ERR=neste mês');
select pg_temp.chk('folha', 'auditoria da folha',
  $q$select count(*)::text from public.audit_logs where action = 'hr.payroll_created'$q$, 'OK=1');

-- pagar a folha: reaproveita hr_pay_payment (despesa em Pessoal)
select pg_temp.chk('pagar', 'paga a folha em Pix',
  $q$select (public.hr_pay_payment((select v::uuid from ctx where k = 'pr1'), 'pix')).status::text$q$, 'OK=paid');
select pg_temp.chk('pagar', 'virou despesa de 2685,00 em Pessoal (descrição com o mês)',
  $q$select fe.amount::text || '|' || fc.name || '|' || fe.source_type || '|' || (fe.description like 'Pagamento RH — Ana Clt Teste Souza (%')::text
       from public.financial_entries fe join public.financial_categories fc on fc.id = fe.category_id where fe.source_type = 'hr_payment'$q$, 'OK=2685.00|Pessoal|hr_payment|true');

-- cancelar libera lançamentos (usa o outro funcionário CLT de experiência)
select pg_temp.chk('cancelar', 'cadastra outro CLT para o teste de cancelamento',
  $q$insert into ctx values ('clt2', (public.hr_save_clt_employee(null, 'Bia Clt Cancelamento', null, null, null, null, 2000, 10::smallint, null, null, 44, 'indefinite', null, null, 0::smallint, false, null)).id::text) returning 'ok'$q$, 'OK=ok');
select pg_temp.chk('cancelar', 'bônus de 100 para o segundo funcionário',
  $q$select (public.hr_add_adjustment((select v::uuid from ctx where k = 'clt2'), 'bonus', 100)).amount::text$q$, 'OK=100.00');
select pg_temp.chk('cancelar', 'fecha a folha do segundo',
  $q$insert into ctx values ('pr2', (public.hr_close_payroll((select v::uuid from ctx where k = 'clt2'), date_trunc('month', public.today_sao_paulo())::date, 0, 0, 0, 0, 0, 0, null, null, '{}'::jsonb)).id::text) returning 'ok'$q$, 'OK=ok');
select pg_temp.chk('cancelar', 'líquido 2100,00 (2000 + 100 de bônus, sem descontos informados)',
  $q$select net_amount::text from public.hr_payments where id = (select v::uuid from ctx where k = 'pr2')$q$, 'OK=2100.00');
select pg_temp.chk('cancelar', 'cancelar a folha pendente libera o bônus',
  $q$select (public.hr_cancel_payment((select v::uuid from ctx where k = 'pr2'))).status::text$q$, 'OK=canceled');
select pg_temp.chk('cancelar', 'bônus voltou a ficar em aberto',
  $q$select count(*)::text from public.hr_adjustments where employee_id = (select v::uuid from ctx where k = 'clt2') and payment_id is null$q$, 'OK=1');
select pg_temp.chk('cancelar', 'e dá para fechar o mês de novo',
  $q$select (public.hr_close_payroll((select v::uuid from ctx where k = 'clt2'), date_trunc('month', public.today_sao_paulo())::date, 0, 0, 0, 0, 0, 0, null, null, '{}'::jsonb)).net_amount::text$q$, 'OK=2100.00');

-- VT desligado não aceita desconto de VT
select pg_temp.chk('folha', 'sem VT cadastrado não aceita desconto de VT',
  $q$select (public.hr_close_payroll((select v::uuid from ctx where k = 'clt2'), (date_trunc('month', public.today_sao_paulo()) - interval '1 month')::date, 0, 0, 0, 0, 0, 50, null, null, '{}'::jsonb)).id::text$q$, 'ERR=não usa vale-transporte');
select pg_temp.chk('folha', 'líquido negativo é recusado (vale maior que o bruto)',
  $q$select (public.hr_add_adjustment((select v::uuid from ctx where k = 'clt2'), 'advance', 9000, (date_trunc('month', public.today_sao_paulo()) - interval '1 month')::date, null, 'pix')).amount::text$q$, 'OK=9000.00');
select pg_temp.chk('folha', 'mês anterior com vale gigante: não fecha',
  $q$select (public.hr_close_payroll((select v::uuid from ctx where k = 'clt2'), (date_trunc('month', public.today_sao_paulo()) - interval '1 month')::date, 0, 0, 0, 0, 0, 0, null, null, '{}'::jsonb)).id::text$q$, 'ERR=passam do valor');
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- ================================================= segurança
select pg_temp.chk('seguranca', 'anon não executa as funções novas',
  $q$select (has_function_privilege('anon', 'public.hr_close_payroll(uuid, date, numeric, numeric, numeric, numeric, numeric, numeric, date, text, jsonb)', 'execute')
          or has_function_privilege('anon', 'public.hr_save_settings(text, numeric)', 'execute')
          or has_function_privilege('anon', 'public.hr_save_clt_employee(uuid, text, date, text, text, text, numeric, smallint, date, text, numeric, text, smallint, date, smallint, boolean, numeric)', 'execute'))::text$q$, 'OK=false');
select pg_temp.chk('seguranca', 'anon não lê as tabelas novas',
  $q$select (has_table_privilege('anon', 'public.hr_employee_clt', 'select') or has_table_privilege('anon', 'public.hr_settings', 'select') or has_table_privilege('anon', 'public.hr_tax_tables', 'select'))::text$q$, 'OK=false');
select pg_temp.chk('seguranca', 'authenticated não escreve nas tabelas novas',
  $q$select (has_table_privilege('authenticated', 'public.hr_employee_clt', 'insert') or has_table_privilege('authenticated', 'public.hr_settings', 'update') or has_table_privilege('authenticated', 'public.hr_tax_tables', 'insert'))::text$q$, 'OK=false');
select pg_temp.chk('seguranca', 'a função de gatilho do cadastro não é executável por anon',
  $q$select has_function_privilege('anon', 'public.hr_employees_guard()', 'execute')::text$q$, 'OK=false');

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
