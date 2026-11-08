-- =============================================================================
-- RH — Fase 2 (modo CLT): contrato, folha mensal ESTIMADA, tabelas de impostos versionadas, configurações.
--
-- O que muda:
--   * hr_employees passa a aceitar mode = 'clt' (cai a trava da fase 1). CLT sempre é salário fixo mensal:
--     rate_kind = 'fixed', pay_frequency = 'monthly', base_amount = salário, pay_day_of_month = dia do pagamento.
--   * hr_employee_clt (1:1): jornada semanal, tipo de contrato (indeterminado, experiência, prazo determinado),
--     dependentes (IRRF) e vale-transporte.
--   * hr_tax_tables: tabelas oficiais de INSS, IRRF e parâmetros, VERSIONADAS por vigência (valid_from). Mudou a lei,
--     insere-se uma linha nova; o código não tem número de tabela. Seed 2026 conferido em gov.br/INSS (Portaria
--     MPS/MF 13/2026) e gov.br/Receita Federal (Lei 15.270/2025, tabela mensal a partir de jan/2026).
--   * hr_settings: regime do empregador (Simples, MEI ou outro) para o custo da empresa (INSS patronal).
--   * hr_payments ganha kind ('period' | 'payroll'), reference_month e calc (retrato da conta). hr_close_payroll
--     fecha a folha do mês: salário, horas extras, faltas, bônus, descontos e vales vêm do BANCO; INSS, IRRF e VT
--     chegam calculados pelo app (com as tabelas acima) e só passam por limites de sanidade.
--   * hr_close_period (modo informal) passa a recusar funcionário CLT.
--
-- É uma ESTIMATIVA para controle interno: não substitui holerite oficial, eSocial, FGTS Digital nem o contador.
-- Pagar a folha reaproveita hr_pay_payment (despesa em Pessoal; caixa se dinheiro). FGTS/INSS/IRRF recolhidos
-- pela empresa NÃO são lançados no Financeiro nesta fase.
--
-- Rollback: supabase/rollback/20261108170000_hr_clt.down.sql
-- Bateria:  tests/sql/hr_clt.sql (somente TEST).
-- =============================================================================
begin;

-- ---------------------------------------------------------------------------
-- 1) Funcionário CLT
-- ---------------------------------------------------------------------------
-- Defesa em profundidade: a função de gatilho da fase 1 estava executável por anon (inofensiva, mas sem motivo).
revoke all on function public.hr_employees_guard() from public, anon, authenticated;

alter table public.hr_employees drop constraint if exists hr_employees_phase1_informal_only;
alter table public.hr_employees drop constraint if exists hr_employees_clt_shape;
alter table public.hr_employees add constraint hr_employees_clt_shape
  check (mode <> 'clt' or (rate_kind = 'fixed' and pay_frequency = 'monthly'));

create table if not exists public.hr_employee_clt (
  employee_id uuid primary key,
  company_id uuid not null,
  weekly_hours numeric(4,1) not null default 44,
  contract_type text not null default 'indefinite',
  experience_days smallint,
  contract_end_on date,
  dependents smallint not null default 0,
  vt_enabled boolean not null default false,
  vt_monthly_cost numeric(10,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hr_employee_clt_employee_fk foreign key (company_id, employee_id)
    references public.hr_employees (company_id, id) on delete cascade,
  constraint hr_employee_clt_hours check (weekly_hours between 1 and 44),
  constraint hr_employee_clt_contract check (contract_type in ('indefinite', 'experience', 'fixed_term')),
  constraint hr_employee_clt_experience check (
    (contract_type = 'experience' and experience_days between 1 and 90)
    or (contract_type <> 'experience' and experience_days is null)
  ),
  constraint hr_employee_clt_dependents check (dependents between 0 and 20),
  constraint hr_employee_clt_vt_cost check (vt_monthly_cost is null or (vt_monthly_cost >= 0 and vt_monthly_cost < 100000))
);

comment on table public.hr_employee_clt is 'RH CLT: dados do contrato (1:1 com hr_employees de mode clt). Escrita só pela função hr_save_clt_employee.';

drop trigger if exists hr_employee_clt_set_updated_at on public.hr_employee_clt;
create trigger hr_employee_clt_set_updated_at
  before update on public.hr_employee_clt
  for each row execute function public.set_updated_at();

alter table public.hr_employee_clt enable row level security;
drop policy if exists hr_employee_clt_select_managers on public.hr_employee_clt;
create policy hr_employee_clt_select_managers on public.hr_employee_clt for select to authenticated
  using (company_id = (select public.hr_manager_company_id()));
revoke all on table public.hr_employee_clt from anon;
revoke insert, update, delete, truncate on table public.hr_employee_clt from authenticated;

-- ---------------------------------------------------------------------------
-- 2) Configurações do RH da empresa (regime do empregador)
-- ---------------------------------------------------------------------------
create table if not exists public.hr_settings (
  company_id uuid primary key references public.companies(id) on delete cascade,
  employer_regime text not null default 'simples',
  employer_inss_rate numeric(5,4) not null default 0,
  updated_at timestamptz not null default now(),
  constraint hr_settings_regime check (employer_regime in ('simples', 'mei', 'other')),
  constraint hr_settings_rate check (employer_inss_rate >= 0 and employer_inss_rate <= 0.5)
);

comment on table public.hr_settings is 'RH: regime do empregador (Simples, MEI, outro) para estimar o INSS patronal. Escrita só por hr_save_settings.';

drop trigger if exists hr_settings_set_updated_at on public.hr_settings;
create trigger hr_settings_set_updated_at
  before update on public.hr_settings
  for each row execute function public.set_updated_at();

alter table public.hr_settings enable row level security;
drop policy if exists hr_settings_select_managers on public.hr_settings;
create policy hr_settings_select_managers on public.hr_settings for select to authenticated
  using (company_id = (select public.hr_manager_company_id()));
revoke all on table public.hr_settings from anon;
revoke insert, update, delete, truncate on table public.hr_settings from authenticated;

-- ---------------------------------------------------------------------------
-- 3) Tabelas de impostos versionadas (dados públicos; só leitura para o app)
-- ---------------------------------------------------------------------------
create table if not exists public.hr_tax_tables (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  valid_from date not null,
  data jsonb not null,
  source text not null,
  created_at timestamptz not null default now(),
  constraint hr_tax_tables_kind check (kind in ('inss', 'irrf', 'params')),
  constraint hr_tax_tables_unique unique (kind, valid_from)
);

comment on table public.hr_tax_tables is
  'Tabelas oficiais (INSS, IRRF, parâmetros) por vigência. Vale a linha com maior valid_from <= mês da folha. Atualizar = inserir linha nova.';

alter table public.hr_tax_tables enable row level security;
drop policy if exists hr_tax_tables_select_managers on public.hr_tax_tables;
create policy hr_tax_tables_select_managers on public.hr_tax_tables for select to authenticated
  using ((select public.hr_manager_company_id()) is not null);
revoke all on table public.hr_tax_tables from anon;
revoke insert, update, delete, truncate on table public.hr_tax_tables from authenticated;

insert into public.hr_tax_tables (kind, valid_from, data, source) values
  ('inss', date '2026-01-01',
   '{"brackets":[{"upto":1621.00,"rate":0.075},{"upto":2902.84,"rate":0.09},{"upto":4354.27,"rate":0.12},{"upto":8475.55,"rate":0.14}]}'::jsonb,
   'gov.br/inss — tabela de contribuição mensal 2026 (Portaria MPS/MF nº 13, de 09/01/2026); conferido em 08/11/2026'),
  ('irrf', date '2026-01-01',
   '{"brackets":[{"upto":2428.80,"rate":0,"deduction":0},{"upto":2826.65,"rate":0.075,"deduction":182.16},{"upto":3751.05,"rate":0.15,"deduction":394.16},{"upto":4664.68,"rate":0.225,"deduction":675.49},{"upto":null,"rate":0.275,"deduction":908.73}],"dependent_deduction":189.59,"simplified_discount":607.20,"reduction":{"zero_until":5000.00,"max":312.89,"a":978.62,"b":0.133145,"until":7350.00}}'::jsonb,
   'gov.br/receitafederal — tabela IRPF mensal a partir de jan/2026 e redução da Lei 15.270/2025; conferido em 08/11/2026'),
  ('params', date '2026-01-01',
   '{"minimum_wage":1621.00,"fgts_rate":0.08,"vt_employee_rate":0.06}'::jsonb,
   'Salário mínimo 2026 (gov.br/inss); FGTS 8% e desconto de vale-transporte de até 6% (regras gerais da CLT/Lei 7.418/85) — confirmar com o contador')
on conflict (kind, valid_from) do nothing;

-- ---------------------------------------------------------------------------
-- 4) Pagamentos: folha mensal (kind = payroll) com retrato do cálculo
-- ---------------------------------------------------------------------------
alter table public.hr_payments add column if not exists kind text not null default 'period';
alter table public.hr_payments add column if not exists reference_month date;
alter table public.hr_payments add column if not exists calc jsonb;

alter table public.hr_payments drop constraint if exists hr_payments_kind_valid;
alter table public.hr_payments add constraint hr_payments_kind_valid check (
  (kind = 'period' and reference_month is null and calc is null)
  or (kind = 'payroll' and reference_month is not null and calc is not null)
);

-- ---------------------------------------------------------------------------
-- 5) Cadastro / edição de funcionário CLT (atômico: funcionário + contrato)
-- ---------------------------------------------------------------------------
create or replace function public.hr_save_clt_employee(
  p_employee_id uuid,
  p_full_name text,
  p_birth_date date,
  p_phone text,
  p_role_title text,
  p_pix_key text,
  p_salary numeric,
  p_pay_day smallint,
  p_started_on date,
  p_notes text,
  p_weekly_hours numeric,
  p_contract_type text,
  p_experience_days smallint,
  p_contract_end_on date,
  p_dependents smallint,
  p_vt_enabled boolean,
  p_vt_monthly_cost numeric
)
returns public.hr_employees
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := public.current_profile_user_id();
  v_company uuid := public.hr_manager_company_id();
  v_row public.hr_employees;
  v_salary numeric(12,2);
begin
  if v_user is null then raise exception 'Usuário não autenticado.'; end if;
  if v_company is null then raise exception 'Acesso negado.'; end if;

  if p_full_name is null or char_length(trim(p_full_name)) < 3 then raise exception 'Informe o nome completo do funcionário.'; end if;
  if p_salary is null or p_salary <= 0 then raise exception 'Informe o salário (maior que zero).'; end if;
  v_salary := round(p_salary, 2);
  if v_salary >= 10000000 then raise exception 'Salário alto demais.'; end if;
  if p_pay_day is null or p_pay_day < 1 or p_pay_day > 31 then raise exception 'Informe o dia do mês do pagamento (1 a 31).'; end if;
  if p_weekly_hours is null or p_weekly_hours < 1 or p_weekly_hours > 44 then raise exception 'A jornada semanal deve ficar entre 1 e 44 horas.'; end if;
  if p_contract_type is null or p_contract_type not in ('indefinite', 'experience', 'fixed_term') then raise exception 'Tipo de contrato inválido.'; end if;
  if p_contract_type = 'experience' and (p_experience_days is null or p_experience_days < 1 or p_experience_days > 90) then
    raise exception 'Contrato de experiência: informe de 1 a 90 dias.';
  end if;
  if p_dependents is null or p_dependents < 0 or p_dependents > 20 then raise exception 'Número de dependentes inválido.'; end if;
  if p_vt_monthly_cost is not null and (p_vt_monthly_cost < 0 or p_vt_monthly_cost >= 100000) then raise exception 'Custo do vale-transporte inválido.'; end if;

  if p_employee_id is null then
    insert into public.hr_employees (
      company_id, full_name, birth_date, phone, role_title, pix_key, mode, rate_kind, base_amount,
      pay_frequency, pay_day_of_month, started_on, notes, created_by
    )
    values (
      v_company, trim(p_full_name), p_birth_date, nullif(trim(p_phone), ''), nullif(trim(p_role_title), ''), nullif(trim(p_pix_key), ''),
      'clt', 'fixed', v_salary, 'monthly', p_pay_day, p_started_on, nullif(trim(p_notes), ''), v_user
    )
    returning * into v_row;
  else
    select * into v_row from public.hr_employees where id = p_employee_id and company_id = v_company for update;
    if not found then raise exception 'Funcionário não encontrado.'; end if;
    if v_row.mode <> 'clt' then raise exception 'Este funcionário não é CLT.'; end if;
    update public.hr_employees set
      full_name = trim(p_full_name), birth_date = p_birth_date, phone = nullif(trim(p_phone), ''),
      role_title = nullif(trim(p_role_title), ''), pix_key = nullif(trim(p_pix_key), ''),
      base_amount = v_salary, pay_day_of_month = p_pay_day, started_on = p_started_on, notes = nullif(trim(p_notes), '')
    where id = v_row.id
    returning * into v_row;
  end if;

  insert into public.hr_employee_clt (
    employee_id, company_id, weekly_hours, contract_type, experience_days, contract_end_on, dependents, vt_enabled, vt_monthly_cost
  )
  values (
    v_row.id, v_company, p_weekly_hours, p_contract_type,
    case when p_contract_type = 'experience' then p_experience_days else null end,
    p_contract_end_on, p_dependents, coalesce(p_vt_enabled, false), p_vt_monthly_cost
  )
  on conflict (employee_id) do update set
    weekly_hours = excluded.weekly_hours, contract_type = excluded.contract_type, experience_days = excluded.experience_days,
    contract_end_on = excluded.contract_end_on, dependents = excluded.dependents, vt_enabled = excluded.vt_enabled,
    vt_monthly_cost = excluded.vt_monthly_cost;

  return v_row;
end;
$$;

revoke all on function public.hr_save_clt_employee(uuid, text, date, text, text, text, numeric, smallint, date, text, numeric, text, smallint, date, smallint, boolean, numeric) from public, anon;
grant execute on function public.hr_save_clt_employee(uuid, text, date, text, text, text, numeric, smallint, date, text, numeric, text, smallint, date, smallint, boolean, numeric) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6) Configurações do RH
-- ---------------------------------------------------------------------------
create or replace function public.hr_save_settings(p_regime text, p_inss_rate numeric)
returns public.hr_settings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := public.current_profile_user_id();
  v_company uuid := public.hr_manager_company_id();
  v_row public.hr_settings;
begin
  if v_user is null then raise exception 'Usuário não autenticado.'; end if;
  if v_company is null then raise exception 'Acesso negado.'; end if;
  if p_regime is null or p_regime not in ('simples', 'mei', 'other') then raise exception 'Regime inválido.'; end if;
  if p_regime = 'other' and (p_inss_rate is null or p_inss_rate < 0 or p_inss_rate > 0.5) then
    raise exception 'Informe o percentual de INSS patronal (de 0%% a 50%%).';
  end if;

  insert into public.hr_settings (company_id, employer_regime, employer_inss_rate)
  values (v_company, p_regime, case when p_regime = 'other' then round(p_inss_rate, 4) else 0 end)
  on conflict (company_id) do update set employer_regime = excluded.employer_regime, employer_inss_rate = excluded.employer_inss_rate
  returning * into v_row;

  insert into public.audit_logs (company_id, actor_user_id, entity_type, entity_id, action, metadata)
  values (v_company, v_user, 'hr_settings', v_company, 'hr.settings_saved', jsonb_build_object('regime', p_regime));

  return v_row;
end;
$$;

revoke all on function public.hr_save_settings(text, numeric) from public, anon;
grant execute on function public.hr_save_settings(text, numeric) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 7) hr_close_period (informal) não serve para CLT
-- ---------------------------------------------------------------------------
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
  if v_emp.mode = 'clt' then raise exception 'Funcionário CLT: feche a folha do mês, não um período por dias.'; end if;

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

-- ---------------------------------------------------------------------------
-- 8) Fechar a folha do mês (CLT)
-- ---------------------------------------------------------------------------
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
    where p.employee_id = p_employee_id and p.status <> 'canceled'
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

commit;
