-- =============================================================================
-- Bateria SQL — correções da auditoria (20261110120000_hr_audit_fixes).
-- Roda SOMENTE no projeto TEST, depois das fases 1, 2 e 3. Transação que termina em erro proposital (RESULT: ...).
-- =============================================================================
begin;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

insert into public.profiles (user_id, clerk_user_id, full_name, email, role, status) values
  ('ffffffff-0000-0000-0000-00000000cc01', 'fix_owner', 'FIX Dono', 'fix@example.invalid', 'user', 'active');
insert into public.companies (id, name, business_type, status) values
  ('ffffffff-1000-0000-0000-00000000cc01', '[FIX] Empresa', 'bakery', 'active');
alter table public.company_members disable trigger company_members_seat_limit;
insert into public.company_members (company_id, user_id, role) values
  ('ffffffff-1000-0000-0000-00000000cc01', 'ffffffff-0000-0000-0000-00000000cc01', 'owner');
insert into public.subscriptions (company_id, plan_id, status, starts_at, expires_at, provider)
  values ('ffffffff-1000-0000-0000-00000000cc01', (select id from public.plans order by created_at limit 1), 'active', now(), now() + interval '30 days', 'manual');

create temp table r (n serial, caso text, resultado text, ok boolean);
create temp table c (id uuid);
grant all on r, c to authenticated;
grant all on sequence r_n_seq to authenticated;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"fix_owner","role":"authenticated"}', true);
insert into c select (public.hr_save_clt_employee(null, 'Fix Clt Teste Souza', null, null, null, null, 3000, 5::smallint, date '2020-01-15', null, 44, 'indefinite', null, null, 0::smallint, false, null)).id;

-- 1 falta + 10 dias de férias, salário 3.000 => faltas R$ 100,00 e férias R$ 1.000,00 em linhas separadas
select public.hr_close_payroll((select id from c), date '2026-09-01', 0, 0, 1, 10, 0, 0, 0, null, null, '{"estimate":true}'::jsonb);
insert into r(caso, resultado, ok)
select 'A) holerite separa faltas de dias de férias',
  'faltas=' || (calc->'db'->>'absences') || ' (dias ' || (calc->'db'->>'absence_days') || ') ferias=' || (calc->'db'->>'vacation') || ' (dias ' || (calc->'db'->>'vacation_days') || ') bruto=' || gross_amount,
  (calc->'db'->>'absences') = '100.00' and (calc->'db'->>'vacation') = '1000.00' and gross_amount = 1900.00
from public.hr_payments where employee_id = (select id from c) and reference_month = date '2026-09-01';

do $$ declare m text; begin
  begin
    perform public.hr_close_payroll((select id from c), date '2026-10-01', 0, 0, 20, 20, 0, 0, 0, null, null, '{}'::jsonb);
    m := 'nao recusou';
  exception when others then m := sqlerrm; end;
  insert into r(caso, resultado, ok) values ('B) 20 faltas + 20 dias de férias é recusado', m, m like '%31 dias%');
end $$;

do $$ declare m text; begin
  begin
    perform public.hr_close_payroll((select id from c), date '2026-10-01', 0, 0, -1, 0, 0, 0, 0, null, null, '{}'::jsonb);
    m := 'nao recusou';
  exception when others then m := sqlerrm; end;
  insert into r(caso, resultado, ok) values ('C) dias negativos é recusado', m, m like '%negativos%');
end $$;

select public.hr_close_payroll((select id from c), date '2026-10-01', 0, 0, 0, 10, 0, 0, 0, null, null, '{"estimate":true}'::jsonb);
insert into r(caso, resultado, ok)
select 'D) só férias: campo de faltas fica zerado',
  'faltas=' || (calc->'db'->>'absences') || ' ferias=' || (calc->'db'->>'vacation') || ' bruto=' || gross_amount,
  (calc->'db'->>'absences') = '0.00' and gross_amount = 2000.00
from public.hr_payments where employee_id = (select id from c) and reference_month = date '2026-10-01';

-- 13º não pode bloquear a folha dos meses do ano (a regra do banco já era essa; aqui ela fica presa)
select public.hr_close_thirteenth((select id from c), 2026, 1::smallint, 12::smallint, 0, 0, null, false, null, '{"estimate":true}'::jsonb);
insert into r(caso, resultado, ok)
select 'E) com 13º gerado, a folha de agosto/2026 ainda fecha', 'liquido=' || net_amount, net_amount = 3000.00
from (select (public.hr_close_payroll((select id from c), date '2026-08-01', 0, 0, 0, 0, 0, 0, 0, null, null, '{"estimate":true}'::jsonb)).net_amount) z(net_amount);

-- ---------------------------------------------------------------------------
-- Regressão: os mesmos números da fase 2, agora com a assinatura nova (férias = 0).
-- Jornada de 40 h (hora = 15,00), 10 h extras 50% = 225,00, 4 h 100% = 120,00, 1 falta = 100,00,
-- bônus 50, desconto 20 e vale 200 => bruto 3.295,00, descontos 410,00, líquido 2.685,00.
-- ---------------------------------------------------------------------------
insert into c select (public.hr_save_clt_employee(null, 'Fix Regressao Folha', null, null, null, null, 3000, 5::smallint, date '2020-01-15', null, 40, 'indefinite', null, null, 1::smallint, true, 250)).id;

select public.hr_add_adjustment((select id from c offset 1 limit 1), 'bonus', 50, date '2026-07-10', 'Gratificação');
select public.hr_add_adjustment((select id from c offset 1 limit 1), 'deduction', 20, date '2026-07-10', 'Desconto');
select public.hr_add_adjustment((select id from c offset 1 limit 1), 'advance', 200, date '2026-07-10', null, 'pix');
select public.hr_close_payroll((select id from c offset 1 limit 1), date '2026-07-01', 10, 4, 1, 0, 270, 0, 120, null, 'Regressao', '{"estimate":true}'::jsonb);

insert into r(caso, resultado, ok)
select 'I) regressao da folha (fase 2) com a assinatura nova',
  'bruto=' || gross_amount || ' descontos=' || deductions_amount || ' vales=' || advances_amount || ' liquido=' || net_amount,
  gross_amount = 3295.00 and deductions_amount = 410.00 and advances_amount = 200.00 and net_amount = 2685.00
from public.hr_payments where employee_id = (select id from c offset 1 limit 1) and reference_month = date '2026-07-01';

insert into r(caso, resultado, ok)
select 'J) retrato do calculo mantem os numeros do banco',
  'hora=' || (calc->'db'->>'hourly_rate') || ' he50=' || (calc->'db'->>'overtime50') || ' he100=' || (calc->'db'->>'overtime100') || ' faltas=' || (calc->'db'->>'absences') || ' bonus=' || (calc->'db'->>'bonus'),
  (calc->'db'->>'hourly_rate') = '15.00' and (calc->'db'->>'overtime50') = '225.00' and (calc->'db'->>'overtime100') = '120.00'
    and (calc->'db'->>'absences') = '100.00' and (calc->'db'->>'bonus') = '50.00'
from public.hr_payments where employee_id = (select id from c offset 1 limit 1) and reference_month = date '2026-07-01';

do $$ declare m text; begin
  begin perform public.hr_close_payroll((select id from c offset 1 limit 1), date '2026-07-01', 0, 0, 0, 0, 0, 0, 0, null, null, '{}'::jsonb); m := 'nao recusou';
  exception when others then m := sqlerrm; end;
  insert into r(caso, resultado, ok) values ('K) nao fecha a mesma folha duas vezes', m, m like '%neste mês%');
end $$;

do $$ declare m text; begin
  begin perform public.hr_close_payroll((select id from c offset 1 limit 1), date '2026-06-01', 10, 4, 1, 0, 900, 0, 120, null, null, '{}'::jsonb); m := 'nao recusou';
  exception when others then m := sqlerrm; end;
  insert into r(caso, resultado, ok) values ('L) limite de sanidade do INSS continua valendo', m, m like '%INSS acima%');
end $$;

reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

insert into r(caso, resultado, ok)
select 'F) existe uma única versão de hr_close_payroll', count(*)::text || ' versao(oes)', count(*) = 1
from pg_proc where pronamespace='public'::regnamespace and proname='hr_close_payroll';

insert into r(caso, resultado, ok)
select 'G) índices das chaves estrangeiras criados', count(*)::text || ' de 7', count(*) = 7
from pg_class where relnamespace='public'::regnamespace and relkind='i'
  and relname in ('hr_time_entries_company_idx','hr_adjustments_company_idx','hr_vacations_company_idx',
                  'hr_employee_clt_company_idx','hr_vacations_payment_idx','hr_payments_financial_entry_idx',
                  'hr_adjustments_financial_entry_idx');

insert into r(caso, resultado, ok)
select 'H) anon não executa a função nova',
  has_function_privilege('anon','public.hr_close_payroll(uuid, date, numeric, numeric, numeric, numeric, numeric, numeric, numeric, date, text, jsonb)','execute')::text,
  not has_function_privilege('anon','public.hr_close_payroll(uuid, date, numeric, numeric, numeric, numeric, numeric, numeric, numeric, date, text, jsonb)','execute');

do $result$
declare v jsonb;
begin
  select jsonb_build_object(
    'total', count(*), 'pass', count(*) filter (where ok), 'fail', count(*) filter (where not ok),
    'falhas', coalesce((select jsonb_agg(jsonb_build_object('caso', caso, 'obtido', resultado) order by n) from r where not ok), '[]'::jsonb)
  ) into v from r;
  raise exception 'RESULT: %', v::text;
end
$result$;
