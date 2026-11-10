-- Rollback de 20261110120000_hr_audit_fixes.
-- Volta a folha do mês a somar os dias de férias nas faltas (versão da fase 3) e remove os índices criados.
-- Pagamentos já gravados não são tocados: os que tiverem `calc.db.vacation` continuam com o dado separado.
begin;

drop function if exists public.hr_close_payroll(uuid, date, numeric, numeric, numeric, numeric, numeric, numeric, numeric, date, text, jsonb);

create or replace function public.hr_close_payroll(
  p_employee_id uuid,
  p_month date,
  p_overtime50_hours numeric,
  p_overtime100_hours numeric,
  p_absence_days numeric,
  p_inss numeric,
  p_irrf numeric,
  p_vt numeric,
  p_due_on date,
  p_notes text,
  p_calc jsonb
)
returns public.hr_payments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := public.current_profile_user_id();
  v_company uuid := public.hr_manager_company_id();
  v_today date := public.today_sao_paulo();
  v_emp public.hr_employees;
  v_clt public.hr_employee_clt;
  v_start date;
  v_end date;
  v_h50 numeric := coalesce(p_overtime50_hours, 0);
  v_h100 numeric := coalesce(p_overtime100_hours, 0);
  v_abs numeric := coalesce(p_absence_days, 0);
  v_inss numeric(12,2) := round(coalesce(p_inss, 0), 2);
  v_irrf numeric(12,2) := round(coalesce(p_irrf, 0), 2);
  v_vt numeric(12,2) := round(coalesce(p_vt, 0), 2);
  v_hourly numeric(12,2);
  v_ot50 numeric(12,2);
  v_ot100 numeric(12,2);
  v_absences numeric(12,2);
  v_bonus numeric(12,2);
  v_ded numeric(12,2);
  v_adv numeric(12,2);
  v_gross numeric(12,2);
  v_deductions numeric(12,2);
  v_net numeric(12,2);
  v_pay public.hr_payments;
begin
  if v_user is null then raise exception 'Usuário não autenticado.'; end if;
  if v_company is null then raise exception 'Acesso negado.'; end if;

  select * into v_emp from public.hr_employees where id = p_employee_id and company_id = v_company for update;
  if not found then raise exception 'Funcionário não encontrado.'; end if;
  if v_emp.mode <> 'clt' then raise exception 'A folha mensal é só para funcionário CLT.'; end if;
  select * into v_clt from public.hr_employee_clt where employee_id = v_emp.id;
  if not found then raise exception 'Complete o cadastro CLT do funcionário (jornada e contrato).'; end if;

  if p_month is null then raise exception 'Informe o mês da folha.'; end if;
  v_start := date_trunc('month', p_month)::date;
  v_end := (v_start + interval '1 month - 1 day')::date;
  if v_start > v_today then raise exception 'Não é possível fechar a folha de um mês que ainda não começou.'; end if;
  if v_h50 < 0 or v_h50 > 200 or v_h100 < 0 or v_h100 > 200 then raise exception 'Horas extras inválidas (de 0 a 200).'; end if;
  if v_abs < 0 or v_abs > 31 then raise exception 'Faltas inválidas (de 0 a 31 dias).'; end if;
  if v_inss < 0 or v_irrf < 0 or v_vt < 0 then raise exception 'Valores de desconto inválidos.'; end if;
  if p_notes is not null and char_length(p_notes) > 1000 then raise exception 'Observação longa demais (máximo 1000).'; end if;
  if p_calc is null or jsonb_typeof(p_calc) <> 'object' or pg_column_size(p_calc) > 16384 then raise exception 'Cálculo inválido.'; end if;

  if exists (
    select 1 from public.hr_payments p
    where p.employee_id = p_employee_id and p.status <> 'canceled' and p.kind in ('period', 'payroll')
      and p.period_start <= v_end and p.period_end >= v_start
  ) then
    raise exception 'Já existe um pagamento para este funcionário neste mês.';
  end if;

  -- parte do cálculo que vem do banco (fonte de verdade)
  v_hourly := round(v_emp.base_amount / (v_clt.weekly_hours * 5), 2);
  v_ot50 := round(v_hourly * 1.5 * v_h50, 2);
  v_ot100 := round(v_hourly * 2 * v_h100, 2);
  v_absences := round(v_emp.base_amount / 30 * v_abs, 2);

  select
    coalesce(sum(a.amount) filter (where a.kind = 'bonus'), 0),
    coalesce(sum(a.amount) filter (where a.kind = 'deduction'), 0),
    coalesce(sum(a.amount) filter (where a.kind = 'advance'), 0)
  into v_bonus, v_ded, v_adv
  from public.hr_adjustments a
  where a.employee_id = p_employee_id and a.payment_id is null and a.occurred_on <= v_end;

  v_gross := greatest(0, v_emp.base_amount + v_ot50 + v_ot100 + v_bonus - v_absences);
  if v_gross <= 0 then raise exception 'Não há nada a pagar neste mês.'; end if;

  -- limites de sanidade (o app calcula INSS/IRRF/VT com as tabelas; o banco só barra absurdos)
  if v_inss > round(v_gross * 0.2, 2) then raise exception 'INSS acima do limite esperado.'; end if;
  if v_irrf > round(v_gross * 0.3, 2) then raise exception 'IRRF acima do limite esperado.'; end if;
  if v_vt > round(v_emp.base_amount * 0.1, 2) then raise exception 'Desconto de vale-transporte acima do limite esperado.'; end if;
  if v_vt > 0 and not v_clt.vt_enabled then raise exception 'Este funcionário não usa vale-transporte.'; end if;

  v_deductions := v_inss + v_irrf + v_vt + v_ded;
  v_net := v_gross - v_deductions - v_adv;
  if v_net < 0 then raise exception 'Descontos e vales passam do valor a pagar neste mês.'; end if;

  insert into public.hr_payments (
    company_id, employee_id, period_start, period_end, days_worked, gross_amount, bonus_amount,
    deductions_amount, advances_amount, net_amount, due_on, notes, created_by, kind, reference_month, calc
  )
  values (
    v_company, p_employee_id, v_start, v_end, 0, v_gross, 0,
    v_deductions, v_adv, v_net, coalesce(p_due_on, v_end), nullif(trim(p_notes), ''), v_user, 'payroll', v_start,
    p_calc || jsonb_build_object('db', jsonb_build_object(
      'salary', v_emp.base_amount, 'hourly_rate', v_hourly, 'overtime50', v_ot50, 'overtime100', v_ot100,
      'absences', v_absences, 'bonus', v_bonus, 'other_deductions', v_ded, 'advances', v_adv,
      'inss', v_inss, 'irrf', v_irrf, 'vt', v_vt, 'gross', v_gross, 'net', v_net))
  )
  returning * into v_pay;

  update public.hr_adjustments set payment_id = v_pay.id
  where employee_id = p_employee_id and payment_id is null and occurred_on <= v_end;

  insert into public.audit_logs (company_id, actor_user_id, entity_type, entity_id, action, metadata)
  values (v_company, v_user, 'hr_payment', v_pay.id, 'hr.payroll_created',
    jsonb_build_object('employee_id', p_employee_id, 'month', v_start, 'net', v_net));

  return v_pay;
end;
$$;

revoke all on function public.hr_close_payroll(uuid, date, numeric, numeric, numeric, numeric, numeric, numeric, date, text, jsonb) from public, anon;
grant execute on function public.hr_close_payroll(uuid, date, numeric, numeric, numeric, numeric, numeric, numeric, date, text, jsonb) to authenticated, service_role;

drop index if exists public.hr_time_entries_company_idx;
drop index if exists public.hr_adjustments_company_idx;
drop index if exists public.hr_vacations_company_idx;
drop index if exists public.hr_employee_clt_company_idx;
drop index if exists public.hr_vacations_payment_idx;
drop index if exists public.hr_payments_financial_entry_idx;
drop index if exists public.hr_adjustments_financial_entry_idx;

commit;
