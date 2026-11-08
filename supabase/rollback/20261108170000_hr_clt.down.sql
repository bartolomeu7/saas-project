-- Rollback de 20261108170000_hr_clt.
-- Desfaz o modo CLT do RH. NÃO apaga dados em silêncio: se existir funcionário CLT ou folha mensal, a execução
-- é interrompida (apague/arquive esses registros antes). Pagamentos e vales do modo informal não são tocados.
begin;

do $$
begin
  if exists (select 1 from public.hr_employees where mode = 'clt') then
    raise exception 'Rollback interrompido: existem funcionários CLT. Remova-os antes de desfazer a fase CLT.';
  end if;
  if exists (select 1 from public.hr_payments where kind = 'payroll') then
    raise exception 'Rollback interrompido: existem folhas mensais (kind = payroll).';
  end if;
end
$$;

drop function if exists public.hr_close_payroll(uuid, date, numeric, numeric, numeric, numeric, numeric, numeric, date, text, jsonb);
drop function if exists public.hr_save_settings(text, numeric);
drop function if exists public.hr_save_clt_employee(uuid, text, date, text, text, text, numeric, smallint, date, text, numeric, text, smallint, date, smallint, boolean, numeric);

-- volta a versão da fase 1 de hr_close_period (sem a recusa de CLT)
create or replace function public.hr_close_period(
  p_employee_id uuid,
  p_period_start date,
  p_period_end date,
  p_due_on date default null,
  p_notes text default null
)
returns public.hr_payments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := public.current_profile_user_id();
  v_company uuid := public.hr_manager_company_id();
  v_emp public.hr_employees;
  v_today date := public.today_sao_paulo();
  v_c record;
  v_pay public.hr_payments;
begin
  if v_user is null then raise exception 'Usuário não autenticado.'; end if;
  if v_company is null then raise exception 'Acesso negado.'; end if;

  select * into v_emp from public.hr_employees where id = p_employee_id and company_id = v_company for update;
  if not found then raise exception 'Funcionário não encontrado.'; end if;

  if p_period_start is null or p_period_end is null or p_period_end < p_period_start then raise exception 'Período inválido.'; end if;
  if p_period_end > v_today then raise exception 'O período não pode terminar no futuro.'; end if;
  if p_period_end - p_period_start > 92 then raise exception 'O período não pode passar de 93 dias.'; end if;
  if p_notes is not null and char_length(p_notes) > 1000 then raise exception 'Observação longa demais (máximo 1000).'; end if;

  if exists (
    select 1 from public.hr_payments p
    where p.employee_id = p_employee_id and p.status <> 'canceled'
      and p.period_start <= p_period_end and p.period_end >= p_period_start
  ) then
    raise exception 'Já existe um pagamento para este funcionário que se sobrepõe a este período.';
  end if;

  select * into v_c from public.hr_compute_period(p_employee_id, p_period_start, p_period_end);

  if v_c.gross + v_c.bonus <= 0 then raise exception 'Não há nada a pagar neste período.'; end if;
  if v_c.net < 0 then raise exception 'Vales e descontos passam do valor a pagar neste período.'; end if;

  insert into public.hr_payments (
    company_id, employee_id, period_start, period_end, days_worked, gross_amount, bonus_amount,
    deductions_amount, advances_amount, net_amount, due_on, notes, created_by
  )
  values (
    v_company, p_employee_id, p_period_start, p_period_end, v_c.days_worked, v_c.gross, v_c.bonus,
    v_c.deductions, v_c.advances, v_c.net, coalesce(p_due_on, v_today), nullif(trim(p_notes), ''), v_user
  )
  returning * into v_pay;

  update public.hr_time_entries set payment_id = v_pay.id
  where employee_id = p_employee_id and payment_id is null and work_date between p_period_start and p_period_end;

  update public.hr_adjustments set payment_id = v_pay.id
  where employee_id = p_employee_id and payment_id is null and occurred_on <= p_period_end;

  insert into public.audit_logs (company_id, actor_user_id, entity_type, entity_id, action, metadata)
  values (v_company, v_user, 'hr_payment', v_pay.id, 'hr.payment_created',
    jsonb_build_object('employee_id', p_employee_id, 'period_start', p_period_start, 'period_end', p_period_end, 'net', v_pay.net_amount));

  return v_pay;
end;
$$;

alter table public.hr_payments drop constraint if exists hr_payments_kind_valid;
alter table public.hr_payments drop column if exists calc;
alter table public.hr_payments drop column if exists reference_month;
alter table public.hr_payments drop column if exists kind;

drop table if exists public.hr_tax_tables;
drop table if exists public.hr_settings;
drop table if exists public.hr_employee_clt;

alter table public.hr_employees drop constraint if exists hr_employees_clt_shape;
alter table public.hr_employees add constraint hr_employees_phase1_informal_only check (mode = 'informal');

commit;
