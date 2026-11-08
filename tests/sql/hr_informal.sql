-- =============================================================================
-- Bateria SQL — RH fase 1 / modo Informal (20261108160000_hr_informal).
-- Roda SOMENTE no projeto TEST. Transação que termina em erro proposital (RESULT: ...): nada persiste.
-- =============================================================================
begin;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

insert into public.profiles (user_id, clerk_user_id, full_name, email, role, status) values
  ('ffffffff-0000-0000-0000-0000000000e1', 'hr_owner', 'HR Dono', 'hr-owner@example.invalid', 'user', 'active'),
  ('ffffffff-0000-0000-0000-0000000000e2', 'hr_admin', 'HR Admin', 'hr-admin@example.invalid', 'user', 'active'),
  ('ffffffff-0000-0000-0000-0000000000e3', 'hr_emp', 'HR Funcionario', 'hr-emp@example.invalid', 'user', 'active'),
  ('ffffffff-0000-0000-0000-0000000000e4', 'hr_other', 'HR Outro Dono', 'hr-other@example.invalid', 'user', 'active');
insert into public.companies (id, name, business_type, status) values
  ('ffffffff-1000-0000-0000-0000000000e1', '[HRTEST] Empresa', 'bakery', 'active'),
  ('ffffffff-1000-0000-0000-0000000000e4', '[HRTEST] Outra', 'bakery', 'active');
alter table public.company_members disable trigger company_members_seat_limit;
insert into public.company_members (company_id, user_id, role) values
  ('ffffffff-1000-0000-0000-0000000000e1', 'ffffffff-0000-0000-0000-0000000000e1', 'owner'),
  ('ffffffff-1000-0000-0000-0000000000e1', 'ffffffff-0000-0000-0000-0000000000e2', 'admin'),
  ('ffffffff-1000-0000-0000-0000000000e1', 'ffffffff-0000-0000-0000-0000000000e3', 'employee'),
  ('ffffffff-1000-0000-0000-0000000000e4', 'ffffffff-0000-0000-0000-0000000000e4', 'owner');
insert into public.subscriptions (company_id, plan_id, status, starts_at, expires_at, provider)
  select c, (select id from public.plans order by created_at limit 1), 'active', now(), now() + interval '30 days', 'manual'
  from (values ('ffffffff-1000-0000-0000-0000000000e1'::uuid), ('ffffffff-1000-0000-0000-0000000000e4'::uuid)) v(c);

-- funcionário da OUTRA empresa (para provar isolamento)
insert into public.hr_employees (id, company_id, full_name, base_amount, rate_kind, pay_frequency, pay_weekday)
  values ('ffffffff-8000-0000-0000-0000000000e9', 'ffffffff-1000-0000-0000-0000000000e4', 'Pessoa da Outra Empresa', 100, 'per_day', 'weekly', 5);

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

-- ================================================= dono cadastra funcionários (RLS direto)
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"hr_owner","role":"authenticated"}', true);

select pg_temp.chk('cadastro', 'dono cadastra funcionário por diária (100/dia, paga na sexta)',
  $q$insert into public.hr_employees (id, company_id, full_name, birth_date, rate_kind, base_amount, pay_frequency, pay_weekday)
     values ('ffffffff-8000-0000-0000-0000000000e1', 'ffffffff-1000-0000-0000-0000000000e1', 'Maria da Silva Souza', date '1990-05-20', 'per_day', 100, 'weekly', 5) returning full_name$q$,
  'OK=Maria da Silva Souza');
select pg_temp.chk('cadastro', 'dono cadastra funcionário de valor fixo (800 por semana)',
  $q$insert into public.hr_employees (id, company_id, full_name, rate_kind, base_amount, pay_frequency, pay_weekday)
     values ('ffffffff-8000-0000-0000-0000000000e2', 'ffffffff-1000-0000-0000-0000000000e1', 'Joao Pereira Lima', 'fixed', 800, 'weekly', 5) returning base_amount::text$q$,
  'OK=800.00');
select pg_temp.chk('cadastro', 'quinzenal exige dia entre 1 e 15 (dia 20 recusado)',
  $q$insert into public.hr_employees (company_id, full_name, rate_kind, base_amount, pay_frequency, pay_day_of_month)
     values ('ffffffff-1000-0000-0000-0000000000e1', 'Teste Quinzenal', 'fixed', 500, 'biweekly', 20)$q$, 'ERR=hr_employees_biweekly_has_day');
select pg_temp.chk('cadastro', 'semanal sem dia da semana é recusado',
  $q$insert into public.hr_employees (company_id, full_name, rate_kind, base_amount, pay_frequency)
     values ('ffffffff-1000-0000-0000-0000000000e1', 'Teste Semanal', 'fixed', 500, 'weekly')$q$, 'ERR=hr_employees_weekly_has_weekday');
select pg_temp.chk('cadastro', 'mensal sem dia do mês é recusado',
  $q$insert into public.hr_employees (company_id, full_name, rate_kind, base_amount, pay_frequency)
     values ('ffffffff-1000-0000-0000-0000000000e1', 'Teste Mensal', 'fixed', 500, 'monthly')$q$, 'ERR=hr_employees_monthly_has_day');
select pg_temp.chk('cadastro', 'valor zero é recusado',
  $q$insert into public.hr_employees (company_id, full_name, rate_kind, base_amount, pay_frequency, pay_weekday)
     values ('ffffffff-1000-0000-0000-0000000000e1', 'Teste Zero', 'fixed', 0, 'weekly', 1)$q$, 'ERR=hr_employees_amount_positive');
select pg_temp.chk('cadastro', 'nome curto demais é recusado',
  $q$insert into public.hr_employees (company_id, full_name, rate_kind, base_amount, pay_frequency, pay_weekday)
     values ('ffffffff-1000-0000-0000-0000000000e1', 'Al', 'fixed', 50, 'weekly', 1)$q$, 'ERR=hr_employees_name_length');
select pg_temp.chk('cadastro', 'modo CLT ainda não é aceito (fase 1)',
  $q$insert into public.hr_employees (company_id, full_name, mode, rate_kind, base_amount, pay_frequency, pay_day_of_month)
     values ('ffffffff-1000-0000-0000-0000000000e1', 'Teste Clt', 'clt', 'fixed', 2000, 'monthly', 5)$q$, 'ERR=hr_employees_phase1_informal_only');
select pg_temp.chk('cadastro', 'dono não cria funcionário em outra empresa',
  $q$insert into public.hr_employees (company_id, full_name, rate_kind, base_amount, pay_frequency, pay_weekday)
     values ('ffffffff-1000-0000-0000-0000000000e4', 'Invasor Teste', 'fixed', 50, 'weekly', 1)$q$, 'ERR=row-level security');
select pg_temp.chk('cadastro', 'dono não troca a empresa de um funcionário',
  $q$update public.hr_employees set company_id = 'ffffffff-1000-0000-0000-0000000000e4' where id = 'ffffffff-8000-0000-0000-0000000000e1'$q$, 'ERR=trocar a empresa');
select pg_temp.chk('cadastro', 'dono edita o valor da diária',
  $q$update public.hr_employees set base_amount = 100, role_title = 'Auxiliar' where id = 'ffffffff-8000-0000-0000-0000000000e1' returning role_title$q$, 'OK=Auxiliar');
select pg_temp.chk('auditoria', 'cadastro e edição de funcionário ficam na auditoria (2 criados, 1 editado)',
  $q$select (select count(*) from public.audit_logs where action = 'hr.employee_created' and company_id = 'ffffffff-1000-0000-0000-0000000000e1')::text || '|' ||
            (select count(*) from public.audit_logs where action = 'hr.employee_updated' and company_id = 'ffffffff-1000-0000-0000-0000000000e1')::text$q$, 'OK=2|1');
select pg_temp.chk('cadastro', 'ninguém apaga funcionário (inativa)',
  $q$delete from public.hr_employees where id = 'ffffffff-8000-0000-0000-0000000000e2'$q$, 'ERR=permission denied');

-- ================================================= isolamento e papéis
select pg_temp.chk('rls', 'dono vê só os 2 funcionários da própria empresa',
  $q$select count(*)::text from public.hr_employees$q$, 'OK=2');
select pg_temp.chk('rls', 'escrita direta em presença é negada',
  $q$insert into public.hr_time_entries (company_id, employee_id, work_date, quantity) values ('ffffffff-1000-0000-0000-0000000000e1', 'ffffffff-8000-0000-0000-0000000000e1', current_date, 1)$q$, 'ERR=permission denied');
select pg_temp.chk('rls', 'escrita direta em ajustes é negada',
  $q$insert into public.hr_adjustments (company_id, employee_id, kind, amount, occurred_on) values ('ffffffff-1000-0000-0000-0000000000e1', 'ffffffff-8000-0000-0000-0000000000e1', 'bonus', 10, current_date)$q$, 'ERR=permission denied');
select pg_temp.chk('rls', 'escrita direta em pagamentos é negada',
  $q$insert into public.hr_payments (company_id, employee_id, period_start, period_end, gross_amount, net_amount, due_on) values ('ffffffff-1000-0000-0000-0000000000e1', 'ffffffff-8000-0000-0000-0000000000e1', current_date, current_date, 10, 10, current_date)$q$, 'ERR=permission denied');

reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"hr_admin","role":"authenticated"}', true);
select pg_temp.chk('rls', 'administrador também vê os funcionários',
  $q$select count(*)::text from public.hr_employees$q$, 'OK=2');
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"hr_emp","role":"authenticated"}', true);
select pg_temp.chk('rls', 'funcionário (employee) não vê nenhum funcionário',
  $q$select count(*)::text from public.hr_employees$q$, 'OK=0');
select pg_temp.chk('rls', 'funcionário (employee) não cadastra',
  $q$insert into public.hr_employees (company_id, full_name, rate_kind, base_amount, pay_frequency, pay_weekday)
     values ('ffffffff-1000-0000-0000-0000000000e1', 'Falso Funcionario', 'fixed', 50, 'weekly', 1)$q$, 'ERR=row-level security');
select pg_temp.chk('rls', 'funcionário (employee) não marca presença',
  $q$select public.hr_set_attendance('ffffffff-8000-0000-0000-0000000000e1', array[public.today_sao_paulo() - 1], 1)::text$q$, 'ERR=Acesso negado');
select pg_temp.chk('rls', 'funcionário (employee) não lança vale',
  $q$select (public.hr_add_adjustment('ffffffff-8000-0000-0000-0000000000e1', 'bonus', 10)).id::text$q$, 'ERR=Acesso negado');
select pg_temp.chk('rls', 'funcionário (employee) não fecha período',
  $q$select (public.hr_close_period('ffffffff-8000-0000-0000-0000000000e1', public.today_sao_paulo() - 3, public.today_sao_paulo() - 1)).id::text$q$, 'ERR=Acesso negado');
select pg_temp.chk('rls', 'funcionário (employee) não vê a prévia',
  $q$select net::text from public.hr_period_preview('ffffffff-8000-0000-0000-0000000000e1', public.today_sao_paulo() - 3, public.today_sao_paulo() - 1)$q$, 'ERR=Acesso negado');
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"hr_other","role":"authenticated"}', true);
select pg_temp.chk('isolamento', 'dono de outra empresa vê só o próprio funcionário',
  $q$select string_agg(full_name, ',') from public.hr_employees$q$, 'OK=Pessoa da Outra Empresa');
select pg_temp.chk('isolamento', 'dono de outra empresa não marca presença no funcionário alheio',
  $q$select public.hr_set_attendance('ffffffff-8000-0000-0000-0000000000e1', array[public.today_sao_paulo() - 1], 1)::text$q$, 'ERR=Funcionário não encontrado');
select pg_temp.chk('isolamento', 'dono de outra empresa não lança vale no funcionário alheio',
  $q$select (public.hr_add_adjustment('ffffffff-8000-0000-0000-0000000000e1', 'bonus', 10)).id::text$q$, 'ERR=Funcionário não encontrado');
select pg_temp.chk('isolamento', 'dono de outra empresa não fecha período do funcionário alheio',
  $q$select (public.hr_close_period('ffffffff-8000-0000-0000-0000000000e1', public.today_sao_paulo() - 3, public.today_sao_paulo() - 1)).id::text$q$, 'ERR=Funcionário não encontrado');
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- ================================================= presença
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"hr_owner","role":"authenticated"}', true);

select pg_temp.chk('presenca', 'marca 3 dias inteiros (hoje-3, hoje-2, hoje-1)',
  $q$select public.hr_set_attendance('ffffffff-8000-0000-0000-0000000000e1', array[public.today_sao_paulo() - 3, public.today_sao_paulo() - 2, public.today_sao_paulo() - 1], 1)::text$q$, 'OK=3');
select pg_temp.chk('presenca', 'troca um dia para meio dia (regrava, não duplica)',
  $q$select public.hr_set_attendance('ffffffff-8000-0000-0000-0000000000e1', array[public.today_sao_paulo() - 1], 0.5)::text$q$, 'OK=1');
select pg_temp.chk('presenca', 'ficam 3 registros: 2,5 dias',
  $q$select count(*)::text || '|' || sum(quantity)::text from public.hr_time_entries where employee_id = 'ffffffff-8000-0000-0000-0000000000e1'$q$, 'OK=3|2.5');
select pg_temp.chk('presenca', 'data futura é recusada',
  $q$select public.hr_set_attendance('ffffffff-8000-0000-0000-0000000000e1', array[public.today_sao_paulo() + 1], 1)::text$q$, 'ERR=data futura');
select pg_temp.chk('presenca', 'quantidade inválida (0,7) é recusada',
  $q$select public.hr_set_attendance('ffffffff-8000-0000-0000-0000000000e1', array[public.today_sao_paulo() - 5], 0.7)::text$q$, 'ERR=Quantidade inválida');
select pg_temp.chk('presenca', 'lista vazia é recusada',
  $q$select public.hr_set_attendance('ffffffff-8000-0000-0000-0000000000e1', array[]::date[], 1)::text$q$, 'ERR=ao menos um dia');
select pg_temp.chk('presenca', 'falta explícita (0) é gravada e não soma',
  $q$select public.hr_set_attendance('ffffffff-8000-0000-0000-0000000000e1', array[public.today_sao_paulo() - 4], 0)::text$q$, 'OK=1');
select pg_temp.chk('presenca', 'apagar a marcação (quantidade nula) executa',
  $q$select public.hr_set_attendance('ffffffff-8000-0000-0000-0000000000e1', array[public.today_sao_paulo() - 4], null)::text$q$, 'OK=1');
select pg_temp.chk('presenca', 'e o registro da falta sumiu',
  $q$select count(*)::text from public.hr_time_entries where employee_id = 'ffffffff-8000-0000-0000-0000000000e1' and work_date = public.today_sao_paulo() - 4$q$, 'OK=0');

-- ================================================= vale, desconto, bônus
select pg_temp.chk('ajustes', 'vale em dinheiro com o caixa fechado é recusado (e nada fica gravado)',
  $q$select (public.hr_add_adjustment('ffffffff-8000-0000-0000-0000000000e1', 'advance', 40, null, 'Vale teste', 'cash')).id::text$q$, 'ERR=Abra o caixa');
select pg_temp.chk('ajustes', 'nada ficou gravado do vale recusado',
  $q$select (select count(*) from public.hr_adjustments)::text || '|' || (select count(*) from public.financial_entries where description like 'Vale%')::text$q$, 'OK=0|0');
select pg_temp.chk('ajustes', 'vale sem forma de pagamento é recusado',
  $q$select (public.hr_add_adjustment('ffffffff-8000-0000-0000-0000000000e1', 'advance', 40)).id::text$q$, 'ERR=como o vale foi pago');
select pg_temp.chk('ajustes', 'forma de pagamento em desconto é recusada',
  $q$select (public.hr_add_adjustment('ffffffff-8000-0000-0000-0000000000e1', 'deduction', 10, null, null, 'pix')).id::text$q$, 'ERR=só vale para vale');
select pg_temp.chk('ajustes', 'valor zero é recusado',
  $q$select (public.hr_add_adjustment('ffffffff-8000-0000-0000-0000000000e1', 'bonus', 0)).id::text$q$, 'ERR=maior que zero');
select pg_temp.chk('ajustes', 'data futura é recusada',
  $q$select (public.hr_add_adjustment('ffffffff-8000-0000-0000-0000000000e1', 'bonus', 10, public.today_sao_paulo() + 2)).id::text$q$, 'ERR=não pode ser futura');
select pg_temp.chk('ajustes', 'vale de 40 em Pix registra o vale',
  $q$insert into ctx values ('adv', (public.hr_add_adjustment('ffffffff-8000-0000-0000-0000000000e1', 'advance', 40, null, 'Vale de teste', 'pix')).id::text) returning 'ok'$q$, 'OK=ok');
select pg_temp.chk('ajustes', 'desconto de 10 registrado',
  $q$insert into ctx values ('ded', (public.hr_add_adjustment('ffffffff-8000-0000-0000-0000000000e1', 'deduction', 10, null, 'Quebra')).id::text) returning 'ok'$q$, 'OK=ok');
select pg_temp.chk('ajustes', 'bônus de 5 registrado',
  $q$insert into ctx values ('bon', (public.hr_add_adjustment('ffffffff-8000-0000-0000-0000000000e1', 'bonus', 5, null, 'Gorjeta')).id::text) returning 'ok'$q$, 'OK=ok');
select pg_temp.chk('financeiro', 'o vale virou despesa de 40 em Pessoal (Pix), ligada ao ajuste',
  $q$select fe.direction::text || '|' || fe.amount::text || '|' || fe.method::text || '|' || fc.name || '|' || fe.source_type || '|' || (fe.source_id::text = (select v from ctx where k = 'adv'))::text
       from public.financial_entries fe join public.financial_categories fc on fc.id = fe.category_id where fe.description like 'Vale%'$q$,
  'OK=expense|40.00|pix|Pessoal|hr_adjustment|true');
select pg_temp.chk('ajustes', 'apagar desconto ainda não acertado é permitido',
  $q$select public.hr_delete_adjustment((select v::uuid from ctx where k = 'ded'))::text$q$, 'OK='); -- função void: texto vazio
select pg_temp.chk('ajustes', 'e o desconto sumiu',
  $q$select count(*)::text from public.hr_adjustments where kind = 'deduction'$q$, 'OK=0');
select pg_temp.chk('ajustes', 'vale não pode ser apagado',
  $q$select public.hr_delete_adjustment((select v::uuid from ctx where k = 'adv'))::text$q$, 'ERR=não pode ser apagado');
select pg_temp.chk('ajustes', 'registra o desconto de novo',
  $q$insert into ctx values ('ded2', (public.hr_add_adjustment('ffffffff-8000-0000-0000-0000000000e1', 'deduction', 10, null, 'Quebra')).id::text) returning 'ok'$q$, 'OK=ok');

-- ================================================= prévia e fechamento
select pg_temp.chk('previa', '2,5 dias × 100 = 250; +5 bônus −10 desconto −40 vale = 205',
  $q$select days_worked::text || '|' || gross::text || '|' || bonus::text || '|' || deductions::text || '|' || advances::text || '|' || net::text || '|' || has_overlap::text
       from public.hr_period_preview('ffffffff-8000-0000-0000-0000000000e1', public.today_sao_paulo() - 6, public.today_sao_paulo())$q$,
  'OK=2.5|250.00|5.00|10.00|40.00|205.00|false');
select pg_temp.chk('previa', 'prévia não grava nada',
  $q$select (select count(*) from public.hr_payments)::text$q$, 'OK=0');
select pg_temp.chk('fechar', 'período terminando no futuro é recusado',
  $q$select (public.hr_close_period('ffffffff-8000-0000-0000-0000000000e1', public.today_sao_paulo() - 6, public.today_sao_paulo() + 1)).id::text$q$, 'ERR=terminar no futuro');
select pg_temp.chk('fechar', 'período invertido é recusado',
  $q$select (public.hr_close_period('ffffffff-8000-0000-0000-0000000000e1', public.today_sao_paulo(), public.today_sao_paulo() - 2)).id::text$q$, 'ERR=Período inválido');
select pg_temp.chk('fechar', 'período maior que 93 dias é recusado',
  $q$select (public.hr_close_period('ffffffff-8000-0000-0000-0000000000e1', public.today_sao_paulo() - 120, public.today_sao_paulo())).id::text$q$, 'ERR=93 dias');
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"hr_admin","role":"authenticated"}', true);
select pg_temp.chk('fechar', 'admin fecha o período e o líquido é 205',
  $q$insert into ctx values ('pay1', (public.hr_close_period('ffffffff-8000-0000-0000-0000000000e1', public.today_sao_paulo() - 6, public.today_sao_paulo(), public.today_sao_paulo() + 1)).id::text) returning 'ok'$q$, 'OK=ok');
select pg_temp.chk('fechar', 'admin fecha o período e o líquido é 205: líquido 205.00',
  $q$select net_amount::text from public.hr_payments where id = (select v::uuid from ctx where k = 'pay1')$q$, 'OK=205.00');
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"hr_owner","role":"authenticated"}', true);

select pg_temp.chk('fechar', 'pagamento nasce "a pagar", com os números do período',
  $q$select status::text || '|' || days_worked::text || '|' || gross_amount::text || '|' || bonus_amount::text || '|' || deductions_amount::text || '|' || advances_amount::text
       from public.hr_payments where id = (select v::uuid from ctx where k = 'pay1')$q$, 'OK=pending|2.5|250.00|5.00|10.00|40.00');
select pg_temp.chk('fechar', 'presença e ajustes ficaram presos ao pagamento',
  $q$select (select count(*) from public.hr_time_entries where payment_id = (select v::uuid from ctx where k = 'pay1'))::text || '|' ||
            (select count(*) from public.hr_adjustments where payment_id = (select v::uuid from ctx where k = 'pay1'))::text$q$, 'OK=3|3');
select pg_temp.chk('fechar', 'não dá para fechar de novo o mesmo período',
  $q$select (public.hr_close_period('ffffffff-8000-0000-0000-0000000000e1', public.today_sao_paulo() - 6, public.today_sao_paulo())).id::text$q$, 'ERR=se sobrepõe');
select pg_temp.chk('fechar', 'a prévia avisa a sobreposição',
  $q$select has_overlap::text from public.hr_period_preview('ffffffff-8000-0000-0000-0000000000e1', public.today_sao_paulo() - 2, public.today_sao_paulo())$q$, 'OK=true');
select pg_temp.chk('fechar', 'dia já incluído em pagamento não pode ser alterado',
  $q$select public.hr_set_attendance('ffffffff-8000-0000-0000-0000000000e1', array[public.today_sao_paulo() - 2], 0)::text$q$, 'ERR=já foi incluído em um pagamento');
select pg_temp.chk('fechar', 'ajuste já incluído não pode ser apagado',
  $q$select public.hr_delete_adjustment((select v::uuid from ctx where k = 'bon'))::text$q$, 'ERR=já foi incluído');
select pg_temp.chk('fechar', 'período sem nada a pagar é recusado',
  $q$select (public.hr_close_period('ffffffff-8000-0000-0000-0000000000e1', public.today_sao_paulo() - 40, public.today_sao_paulo() - 30)).id::text$q$, 'ERR=nada a pagar');

-- ================================================= pagar
select pg_temp.chk('pagar', 'pagar em dinheiro com o caixa fechado é recusado',
  $q$select (public.hr_pay_payment((select v::uuid from ctx where k = 'pay1'), 'cash')).status::text$q$, 'ERR=Abra o caixa');
select pg_temp.chk('pagar', 'continua "a pagar" depois da recusa',
  $q$select status::text from public.hr_payments where id = (select v::uuid from ctx where k = 'pay1')$q$, 'OK=pending');
select pg_temp.chk('pagar', 'forma de pagamento inválida (cartão) é recusada',
  $q$select (public.hr_pay_payment((select v::uuid from ctx where k = 'pay1'), 'credit')).status::text$q$, 'ERR=Informe como foi pago');
select pg_temp.chk('pagar', 'data futura é recusada',
  $q$select (public.hr_pay_payment((select v::uuid from ctx where k = 'pay1'), 'pix', public.today_sao_paulo() + 1)).status::text$q$, 'ERR=não pode ser futura');
select pg_temp.chk('pagar', 'abre o caixa',
  $q$select (public.open_cash_register(100, 'teste RH')).status::text$q$, 'OK=open');
select pg_temp.chk('pagar', 'pagar em dinheiro com o caixa aberto',
  $q$select (public.hr_pay_payment((select v::uuid from ctx where k = 'pay1'), 'cash')).status::text$q$, 'OK=paid');
select pg_temp.chk('pagar', 'virou despesa de 205 em Pessoal, ligada ao pagamento',
  $q$select fe.direction::text || '|' || fe.amount::text || '|' || fe.method::text || '|' || fc.name || '|' || fe.source_type || '|' || (fe.source_id::text = (select v from ctx where k = 'pay1'))::text
       from public.financial_entries fe join public.financial_categories fc on fc.id = fe.category_id where fe.description like 'Pagamento RH%'$q$,
  'OK=expense|205.00|cash|Pessoal|hr_payment|true');
select pg_temp.chk('pagar', 'saiu 205 do caixa aberto',
  $q$select count(*)::text || '|' || sum(amount)::text from public.cash_movements where direction = 'out' and method = 'cash' and description like 'Pagamento RH%'$q$, 'OK=1|205.00');
select pg_temp.chk('pagar', 'pagamento guarda data, forma e lançamento',
  $q$select (paid_on = public.today_sao_paulo())::text || '|' || paid_method::text || '|' || (financial_entry_id is not null)::text from public.hr_payments where id = (select v::uuid from ctx where k = 'pay1')$q$, 'OK=true|cash|true');
select pg_temp.chk('pagar', 'pagar de novo é idempotente (nenhum lançamento duplicado)',
  $q$select (public.hr_pay_payment((select v::uuid from ctx where k = 'pay1'), 'cash')).status::text || '|' || (select count(*) from public.financial_entries where source_type = 'hr_payment')::text$q$, 'OK=paid|1');
select pg_temp.chk('pagar', 'pagamento efetuado não pode ser cancelado aqui',
  $q$select (public.hr_cancel_payment((select v::uuid from ctx where k = 'pay1'))).status::text$q$, 'ERR=não pode ser cancelado');

-- ================================================= valor fixo, cancelamento e líquido negativo
select pg_temp.chk('fixo', 'valor fixo: fecha 800 mesmo sem presença',
  $q$insert into ctx values ('pay2', (public.hr_close_period('ffffffff-8000-0000-0000-0000000000e2', public.today_sao_paulo() - 6, public.today_sao_paulo())).id::text) returning 'ok'$q$, 'OK=ok');
select pg_temp.chk('fixo', 'valor fixo: fecha 800 mesmo sem presença: líquido 800.00',
  $q$select net_amount::text from public.hr_payments where id = (select v::uuid from ctx where k = 'pay2')$q$, 'OK=800.00');
select pg_temp.chk('fixo', 'cancelar pagamento "a pagar" funciona',
  $q$select (public.hr_cancel_payment((select v::uuid from ctx where k = 'pay2'))).status::text$q$, 'OK=canceled');
select pg_temp.chk('fixo', 'cancelado não pode ser pago',
  $q$select (public.hr_pay_payment((select v::uuid from ctx where k = 'pay2'), 'pix')).status::text$q$, 'ERR=cancelado');
select pg_temp.chk('fixo', 'depois de cancelar dá para fechar o mesmo período de novo',
  $q$insert into ctx values ('pay3', (public.hr_close_period('ffffffff-8000-0000-0000-0000000000e2', public.today_sao_paulo() - 6, public.today_sao_paulo())).id::text) returning 'ok'$q$, 'OK=ok');
select pg_temp.chk('fixo', 'depois de cancelar dá para fechar o mesmo período de novo: líquido 800.00',
  $q$select net_amount::text from public.hr_payments where id = (select v::uuid from ctx where k = 'pay3')$q$, 'OK=800.00');
select pg_temp.chk('fixo', 'cancela de novo para testar o líquido negativo',
  $q$select (public.hr_cancel_payment((select v::uuid from ctx where k = 'pay3'))).status::text$q$, 'OK=canceled');
select pg_temp.chk('fixo', 'registra vale de 900 (maior que o valor do período)',
  $q$insert into ctx values ('adv2', (public.hr_add_adjustment('ffffffff-8000-0000-0000-0000000000e2', 'advance', 900, null, null, 'pix')).id::text) returning 'ok'$q$, 'OK=ok');
select pg_temp.chk('fixo', 'vales acima do valor do período: não fecha',
  $q$select (public.hr_close_period('ffffffff-8000-0000-0000-0000000000e2', public.today_sao_paulo() - 6, public.today_sao_paulo())).id::text$q$, 'ERR=passam do valor');
select pg_temp.chk('auditoria', 'ficou registrado em auditoria: 1 pagamento criado+pago, 3 ajustes, cancelamentos',
  $q$select (select count(*) from public.audit_logs where action = 'hr.payment_paid')::text || '|' ||
            (select count(*) from public.audit_logs where action = 'hr.adjustment_created')::text || '|' ||
            (select count(*) from public.audit_logs where action = 'hr.payment_canceled')::text$q$, 'OK=1|5|2');
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- ================================================= permissões de execução
select pg_temp.chk('seguranca', 'anon não executa hr_close_period',
  $q$select has_function_privilege('anon', 'public.hr_close_period(uuid, date, date, date, text)', 'execute')::text$q$, 'OK=false');
select pg_temp.chk('seguranca', 'anon não executa hr_pay_payment',
  $q$select has_function_privilege('anon', 'public.hr_pay_payment(uuid, public.sale_payment_method, date)', 'execute')::text$q$, 'OK=false');
select pg_temp.chk('seguranca', 'authenticated executa hr_close_period',
  $q$select has_function_privilege('authenticated', 'public.hr_close_period(uuid, date, date, date, text)', 'execute')::text$q$, 'OK=true');
select pg_temp.chk('seguranca', 'o cálculo interno não é executável por authenticated nem anon',
  $q$select (has_function_privilege('authenticated', 'public.hr_compute_period(uuid, date, date)', 'execute') or has_function_privilege('anon', 'public.hr_compute_period(uuid, date, date)', 'execute'))::text$q$, 'OK=false');
select pg_temp.chk('seguranca', 'anon não lê nenhuma tabela de RH',
  $q$select (has_table_privilege('anon', 'public.hr_employees', 'select') or has_table_privilege('anon', 'public.hr_payments', 'select') or has_table_privilege('anon', 'public.hr_time_entries', 'select') or has_table_privilege('anon', 'public.hr_adjustments', 'select'))::text$q$, 'OK=false');

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
