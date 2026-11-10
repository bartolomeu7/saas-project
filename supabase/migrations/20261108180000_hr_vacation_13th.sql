-- =============================================================================
-- RH — Fase 3 (CLT): férias e 13º salário.
--
-- Regras conferidas em gov.br (Ministério do Trabalho e Emprego; ColaboraGov) em 08/11/2026:
--   * Férias: 30 dias com adicional de 1/3 (CF art. 7º, XVII); divisíveis em até 3 períodos (um com 14 dias ou mais,
--     os demais com 5 ou mais); só depois de 12 meses de período aquisitivo; dias de direito caem com as faltas
--     (CLT art. 130: até 5 faltas = 30; 6–14 = 24; 15–23 = 18; 24–32 = 12; mais de 32 = perde).
--   * 13º: 1/12 por mês trabalhado (fração de 15 dias ou mais conta como mês); 1ª parcela até 30/11 (metade, sem
--     descontos); 2ª até 20/12 (complemento, com INSS e IRRF do valor total).
--
-- O que muda:
--   * hr_payments.kind aceita 'vacation' e 'thirteenth'. Esses pagamentos NÃO entram na checagem de sobreposição da
--     folha mensal nem do período por dias (hr_close_period, hr_close_payroll e hr_period_preview passam a olhar só
--     kind period/payroll).
--   * hr_vacations: períodos de gozo programados. hr_schedule_vacation valida as regras acima; hr_cancel_vacation
--     cancela o que ainda não tem pagamento; hr_close_vacation_pay gera o pagamento (salário/30 × dias + 1/3; INSS e
--     IRRF vêm do app com limites de sanidade); hr_close_thirteenth gera a 1ª ou a 2ª parcela (uma por ano).
--   * hr_cancel_payment libera as férias ligadas; hr_pay_payment descreve férias e 13º no Financeiro.
-- É ESTIMATIVA para controle interno: sem abono pecuniário (venda de dias), sem média de variáveis, INSS e IRRF das
-- férias calculados isoladamente. Não substitui o recibo oficial nem o contador.
--
-- Rollback: supabase/rollback/20261108180000_hr_vacation_13th.down.sql
-- Bateria:  tests/sql/hr_vacation_13th.sql (somente TEST).
-- =============================================================================
begin;

-- ---------------------------------------------------------------------------
-- 1) Pagamentos: férias e 13º
-- ---------------------------------------------------------------------------
alter table public.hr_payments drop constraint if exists hr_payments_kind_valid;
alter table public.hr_payments add constraint hr_payments_kind_valid check (
  (kind = 'period' and reference_month is null and calc is null)
  or (kind = 'payroll' and reference_month is not null and calc is not null)
  or (kind = 'vacation' and reference_month is null and calc is not null)
  or (kind = 'thirteenth' and reference_month is not null and calc is not null)
);

-- uma parcela de 13º (1 ou 2) por funcionário e ano, fora as canceladas
create unique index if not exists hr_payments_thirteenth_unique
  on public.hr_payments (employee_id, (calc ->> 'year'), (calc ->> 'installment'))
  where kind = 'thirteenth' and status <> 'canceled';

-- ---------------------------------------------------------------------------
-- 2) Períodos de férias programados
-- ---------------------------------------------------------------------------
create table if not exists public.hr_vacations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  employee_id uuid not null,
  acquisition_start date not null,
  acquisition_end date not null,
  entitled_days smallint not null,
  start_on date not null,
  days smallint not null,
  payment_id uuid references public.hr_payments(id) on delete set null,
  canceled_at timestamptz,
  notes text,
  created_by uuid references public.profiles(user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hr_vacations_employee_fk foreign key (company_id, employee_id)
    references public.hr_employees (company_id, id) on delete cascade,
  constraint hr_vacations_entitled check (entitled_days in (12, 18, 24, 30)),
  constraint hr_vacations_days check (days between 5 and 30 and days <= entitled_days),
  constraint hr_vacations_period check (acquisition_end > acquisition_start and start_on > acquisition_end),
  constraint hr_vacations_notes_length check (notes is null or char_length(notes) <= 500)
);

comment on table public.hr_vacations is
  'RH CLT: períodos de gozo de férias programados (até 3 por período aquisitivo). Escrita só por funções.';

create index if not exists hr_vacations_employee_idx on public.hr_vacations (employee_id, start_on);

drop trigger if exists hr_vacations_set_updated_at on public.hr_vacations;
create trigger hr_vacations_set_updated_at
  before update on public.hr_vacations
  for each row execute function public.set_updated_at();

alter table public.hr_vacations enable row level security;
drop policy if exists hr_vacations_select_managers on public.hr_vacations;
create policy hr_vacations_select_managers on public.hr_vacations for select to authenticated
  using (company_id = (select public.hr_manager_company_id()));
revoke all on table public.hr_vacations from anon;
revoke insert, update, delete, truncate on table public.hr_vacations from authenticated;

-- ---------------------------------------------------------------------------
-- 3) Programar férias
-- ---------------------------------------------------------------------------
create or replace function public.hr_schedule_vacation(
  p_employee_id uuid,
  p_acquisition_start date,
  p_start_on date,
  p_days smallint,
  p_absences smallint default 0,
  p_notes text default null
)
returns public.hr_vacations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := public.current_profile_user_id();
  v_company uuid := public.hr_manager_company_id();
  v_emp public.hr_employees;
  v_acq_end date;
  v_n integer;
  v_entitled smallint;
  v_existing record;
  v_sum integer;
  v_count integer;
  v_max integer;
  v_remaining integer;
  v_total integer;
  v_row public.hr_vacations;
begin
  if v_user is null then raise exception 'Usuário não autenticado.'; end if;
  if v_company is null then raise exception 'Acesso negado.'; end if;

  select * into v_emp from public.hr_employees where id = p_employee_id and company_id = v_company for update;
  if not found then raise exception 'Funcionário não encontrado.'; end if;
  if v_emp.mode <> 'clt' then raise exception 'Férias são só para funcionário CLT.'; end if;
  if v_emp.started_on is null then raise exception 'Informe a data de admissão no cadastro do funcionário.'; end if;

  if p_acquisition_start is null or p_start_on is null or p_days is null then raise exception 'Informe o período aquisitivo, o início e os dias.'; end if;
  if p_notes is not null and char_length(p_notes) > 500 then raise exception 'Observação longa demais (máximo 500).'; end if;

  -- o início do período aquisitivo precisa cair num aniversário da admissão
  v_n := extract(year from age(p_acquisition_start, v_emp.started_on))::integer;
  if p_acquisition_start < v_emp.started_on or (v_emp.started_on + make_interval(years => v_n))::date <> p_acquisition_start then
    raise exception 'Período aquisitivo inválido para a data de admissão.';
  end if;
  v_acq_end := (p_acquisition_start + interval '1 year')::date - 1;
  if p_start_on <= v_acq_end then raise exception 'O período aquisitivo termina em % : as férias só podem começar depois.', to_char(v_acq_end, 'DD/MM/YYYY'); end if;

  if p_days < 5 then raise exception 'Cada período de férias deve ter pelo menos 5 dias.'; end if;

  select count(*), coalesce(sum(days), 0), coalesce(max(days), 0), max(entitled_days)
    into v_count, v_sum, v_max, v_entitled
  from public.hr_vacations
  where employee_id = p_employee_id and acquisition_start = p_acquisition_start and canceled_at is null;

  if v_count = 0 then
    v_entitled := case
      when coalesce(p_absences, 0) <= 5 then 30
      when p_absences <= 14 then 24
      when p_absences <= 23 then 18
      when p_absences <= 32 then 12
      else 0 end;
  end if;
  if v_entitled = 0 then raise exception 'Sem direito a férias neste período aquisitivo (faltas demais).'; end if;

  if v_count >= 3 then raise exception 'As férias podem ser divididas em no máximo 3 períodos.'; end if;
  v_total := v_sum + p_days;
  if v_total > v_entitled then raise exception 'Passa dos % dias de direito (já programados: %).', v_entitled, v_sum; end if;
  v_remaining := v_entitled - v_total;
  if v_remaining > 0 and v_remaining < 5 then raise exception 'Sobrariam só % dia(s); o menor período é de 5 dias. Ajuste a duração.', v_remaining; end if;
  if greatest(v_max, p_days) < 14 and not (3 - (v_count + 1) >= 1 and v_remaining >= 14) then
    raise exception 'Um dos períodos precisa ter pelo menos 14 dias.';
  end if;

  -- sem sobreposição com outras férias do mesmo funcionário
  for v_existing in
    select start_on, days from public.hr_vacations where employee_id = p_employee_id and canceled_at is null
  loop
    if p_start_on <= v_existing.start_on + v_existing.days - 1 and p_start_on + p_days - 1 >= v_existing.start_on then
      raise exception 'Estas férias se sobrepõem a outro período já programado.';
    end if;
  end loop;

  insert into public.hr_vacations (company_id, employee_id, acquisition_start, acquisition_end, entitled_days, start_on, days, notes, created_by)
  values (v_company, p_employee_id, p_acquisition_start, v_acq_end, v_entitled, p_start_on, p_days, nullif(trim(p_notes), ''), v_user)
  returning * into v_row;

  insert into public.audit_logs (company_id, actor_user_id, entity_type, entity_id, action, metadata)
  values (v_company, v_user, 'hr_vacation', v_row.id, 'hr.vacation_scheduled',
    jsonb_build_object('employee_id', p_employee_id, 'start_on', p_start_on, 'days', p_days));

  return v_row;
end;
$$;

revoke all on function public.hr_schedule_vacation(uuid, date, date, smallint, smallint, text) from public, anon;
grant execute on function public.hr_schedule_vacation(uuid, date, date, smallint, smallint, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4) Cancelar férias ainda sem pagamento
-- ---------------------------------------------------------------------------
create or replace function public.hr_cancel_vacation(p_vacation_id uuid)
returns public.hr_vacations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := public.current_profile_user_id();
  v_company uuid := public.hr_manager_company_id();
  v_row public.hr_vacations;
begin
  if v_user is null then raise exception 'Usuário não autenticado.'; end if;
  if v_company is null then raise exception 'Acesso negado.'; end if;

  select * into v_row from public.hr_vacations where id = p_vacation_id and company_id = v_company for update;
  if not found then raise exception 'Férias não encontradas.'; end if;
  if v_row.canceled_at is not null then return v_row; end if;
  if v_row.payment_id is not null then raise exception 'Estas férias já têm pagamento. Cancele o pagamento antes (se ainda não foi pago).'; end if;

  update public.hr_vacations set canceled_at = now() where id = v_row.id returning * into v_row;

  insert into public.audit_logs (company_id, actor_user_id, entity_type, entity_id, action, metadata)
  values (v_company, v_user, 'hr_vacation', v_row.id, 'hr.vacation_canceled', jsonb_build_object('employee_id', v_row.employee_id));

  return v_row;
end;
$$;

revoke all on function public.hr_cancel_vacation(uuid) from public, anon;
grant execute on function public.hr_cancel_vacation(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5) Gerar o pagamento das férias (salário/30 × dias + 1/3; INSS/IRRF vêm do app, com limites de sanidade)
-- ---------------------------------------------------------------------------
create or replace function public.hr_close_vacation_pay(
  p_vacation_id uuid,
  p_inss numeric,
  p_irrf numeric,
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
  v_vac public.hr_vacations;
  v_emp public.hr_employees;
  v_days_amount numeric(12,2);
  v_third numeric(12,2);
  v_gross numeric(12,2);
  v_inss numeric(12,2) := round(coalesce(p_inss, 0), 2);
  v_irrf numeric(12,2) := round(coalesce(p_irrf, 0), 2);
  v_net numeric(12,2);
  v_pay public.hr_payments;
begin
  if v_user is null then raise exception 'Usuário não autenticado.'; end if;
  if v_company is null then raise exception 'Acesso negado.'; end if;

  select * into v_vac from public.hr_vacations where id = p_vacation_id and company_id = v_company for update;
  if not found then raise exception 'Férias não encontradas.'; end if;
  if v_vac.canceled_at is not null then raise exception 'Estas férias foram canceladas.'; end if;
  if v_vac.payment_id is not null then raise exception 'Estas férias já têm pagamento gerado.'; end if;

  select * into v_emp from public.hr_employees where id = v_vac.employee_id for update;
  if v_emp.mode <> 'clt' then raise exception 'Férias são só para funcionário CLT.'; end if;

  if p_notes is not null and char_length(p_notes) > 1000 then raise exception 'Observação longa demais (máximo 1000).'; end if;
  if p_calc is null or jsonb_typeof(p_calc) <> 'object' or pg_column_size(p_calc) > 16384 then raise exception 'Cálculo inválido.'; end if;

  v_days_amount := round(v_emp.base_amount / 30 * v_vac.days, 2);
  v_third := round(v_days_amount / 3, 2);
  v_gross := v_days_amount + v_third;
  if v_inss < 0 or v_irrf < 0 then raise exception 'Valores de desconto inválidos.'; end if;
  if v_inss > round(v_gross * 0.2, 2) then raise exception 'INSS acima do limite esperado.'; end if;
  if v_irrf > round(v_gross * 0.3, 2) then raise exception 'IRRF acima do limite esperado.'; end if;
  v_net := v_gross - v_inss - v_irrf;
  if v_net < 0 then raise exception 'Descontos passam do valor das férias.'; end if;

  insert into public.hr_payments (
    company_id, employee_id, period_start, period_end, days_worked, gross_amount, bonus_amount,
    deductions_amount, advances_amount, net_amount, due_on, notes, created_by, kind, calc
  )
  values (
    v_company, v_vac.employee_id, v_vac.start_on, v_vac.start_on + v_vac.days - 1, v_vac.days, v_gross, 0,
    v_inss + v_irrf, 0, v_net, coalesce(p_due_on, v_vac.start_on - 2), nullif(trim(p_notes), ''), v_user, 'vacation',
    p_calc || jsonb_build_object('db', jsonb_build_object(
      'days', v_vac.days, 'days_amount', v_days_amount, 'one_third', v_third, 'gross', v_gross, 'inss', v_inss, 'irrf', v_irrf, 'net', v_net))
  )
  returning * into v_pay;

  update public.hr_vacations set payment_id = v_pay.id where id = v_vac.id;

  insert into public.audit_logs (company_id, actor_user_id, entity_type, entity_id, action, metadata)
  values (v_company, v_user, 'hr_payment', v_pay.id, 'hr.vacation_payment_created',
    jsonb_build_object('employee_id', v_vac.employee_id, 'vacation_id', v_vac.id, 'net', v_net));

  return v_pay;
end;
$$;

revoke all on function public.hr_close_vacation_pay(uuid, numeric, numeric, date, text, jsonb) from public, anon;
grant execute on function public.hr_close_vacation_pay(uuid, numeric, numeric, date, text, jsonb) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6) Gerar parcela do 13º (salário × avos/12; 1ª parcela = metade sem descontos; INSS/IRRF do total saem na 2ª)
-- ---------------------------------------------------------------------------
create or replace function public.hr_close_thirteenth(
  p_employee_id uuid,
  p_year integer,
  p_installment smallint,
  p_avos smallint,
  p_inss numeric,
  p_irrf numeric,
  p_due_on date,
  p_first_paid_elsewhere boolean,
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
  v_total numeric(12,2);
  v_first numeric(12,2);
  v_gross numeric(12,2);
  v_inss numeric(12,2) := round(coalesce(p_inss, 0), 2);
  v_irrf numeric(12,2) := round(coalesce(p_irrf, 0), 2);
  v_ded numeric(12,2);
  v_net numeric(12,2);
  v_first_row public.hr_payments;
  v_pay public.hr_payments;
begin
  if v_user is null then raise exception 'Usuário não autenticado.'; end if;
  if v_company is null then raise exception 'Acesso negado.'; end if;

  select * into v_emp from public.hr_employees where id = p_employee_id and company_id = v_company for update;
  if not found then raise exception 'Funcionário não encontrado.'; end if;
  if v_emp.mode <> 'clt' then raise exception '13º salário é só para funcionário CLT.'; end if;

  if p_year is null or p_year < 2000 or p_year > extract(year from v_today)::integer then raise exception 'Ano inválido.'; end if;
  if p_installment is null or p_installment not in (1, 2) then raise exception 'Parcela inválida (1 ou 2).'; end if;
  if p_avos is null or p_avos < 1 or p_avos > 12 then raise exception 'Avos inválidos (1 a 12).'; end if;
  if p_notes is not null and char_length(p_notes) > 1000 then raise exception 'Observação longa demais (máximo 1000).'; end if;
  if p_calc is null or jsonb_typeof(p_calc) <> 'object' or pg_column_size(p_calc) > 16384 then raise exception 'Cálculo inválido.'; end if;
  if v_inss < 0 or v_irrf < 0 then raise exception 'Valores de desconto inválidos.'; end if;

  if exists (
    select 1 from public.hr_payments p
    where p.employee_id = p_employee_id and p.kind = 'thirteenth' and p.status <> 'canceled'
      and (p.calc ->> 'year')::integer = p_year and (p.calc ->> 'installment')::integer = p_installment
  ) then
    raise exception 'A % ª parcela do 13º de % já foi gerada.', p_installment, p_year;
  end if;

  v_total := round(v_emp.base_amount * p_avos / 12, 2);
  v_first := round(v_total / 2, 2);

  if p_installment = 1 then
    if v_inss <> 0 or v_irrf <> 0 then raise exception 'A 1ª parcela não tem descontos.'; end if;
    v_gross := v_first;
    v_ded := 0;
  else
    select * into v_first_row from public.hr_payments p
    where p.employee_id = p_employee_id and p.kind = 'thirteenth' and p.status <> 'canceled'
      and (p.calc ->> 'year')::integer = p_year and (p.calc ->> 'installment')::integer = 1;
    if not found and not coalesce(p_first_paid_elsewhere, false) then
      raise exception 'Gere antes a 1ª parcela (ou informe que ela foi paga fora do sistema).';
    end if;
    if found and (v_first_row.calc ->> 'avos')::integer <> p_avos then
      raise exception 'Os avos da 2ª parcela devem ser os mesmos da 1ª (%).', (v_first_row.calc ->> 'avos');
    end if;
    if v_inss > round(v_total * 0.2, 2) then raise exception 'INSS acima do limite esperado.'; end if;
    if v_irrf > round(v_total * 0.3, 2) then raise exception 'IRRF acima do limite esperado.'; end if;
    v_gross := v_total - v_first;
    v_ded := v_inss + v_irrf;
  end if;

  v_net := v_gross - v_ded;
  if v_net < 0 then raise exception 'Descontos passam do valor da parcela.'; end if;
  if v_gross <= 0 then raise exception 'Não há nada a pagar.'; end if;

  insert into public.hr_payments (
    company_id, employee_id, period_start, period_end, days_worked, gross_amount, bonus_amount,
    deductions_amount, advances_amount, net_amount, due_on, notes, created_by, kind, reference_month, calc
  )
  values (
    v_company, p_employee_id, make_date(p_year, 1, 1), make_date(p_year, 12, 31), 0, v_gross, 0,
    v_ded, 0, v_net,
    coalesce(p_due_on, case when p_installment = 1 then make_date(p_year, 11, 30) else make_date(p_year, 12, 20) end),
    nullif(trim(p_notes), ''), v_user, 'thirteenth', make_date(p_year, 12, 1),
    (p_calc - 'year' - 'installment' - 'avos') || jsonb_build_object(
      'year', p_year, 'installment', p_installment, 'avos', p_avos,
      'db', jsonb_build_object('total', v_total, 'first', v_first, 'gross', v_gross, 'inss', v_inss, 'irrf', v_irrf, 'net', v_net))
  )
  returning * into v_pay;

  insert into public.audit_logs (company_id, actor_user_id, entity_type, entity_id, action, metadata)
  values (v_company, v_user, 'hr_payment', v_pay.id, 'hr.thirteenth_created',
    jsonb_build_object('employee_id', p_employee_id, 'year', p_year, 'installment', p_installment, 'net', v_net));

  return v_pay;
end;
$$;

revoke all on function public.hr_close_thirteenth(uuid, integer, smallint, smallint, numeric, numeric, date, boolean, text, jsonb) from public, anon;
grant execute on function public.hr_close_thirteenth(uuid, integer, smallint, smallint, numeric, numeric, date, boolean, text, jsonb) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 7) Funções da folha, cancelamento e pagamento atualizadas (kind novo; privilégios mantidos)
-- ---------------------------------------------------------------------------
create or replace function public.hr_period_preview(p_employee_id uuid, p_start date, p_end date)
returns table (days_worked numeric, gross numeric, bonus numeric, deductions numeric, advances numeric, net numeric, has_overlap boolean)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_company uuid := public.hr_manager_company_id();
  v_emp_company uuid;
begin
  if public.current_profile_user_id() is null then raise exception 'Usuário não autenticado.'; end if;
  if v_company is null then raise exception 'Acesso negado.'; end if;
  select company_id into v_emp_company from public.hr_employees where id = p_employee_id;
  if v_emp_company is distinct from v_company then raise exception 'Funcionário não encontrado.'; end if;
  if p_start is null or p_end is null or p_end < p_start then raise exception 'Período inválido.'; end if;

  return query
    select c.days_worked, c.gross, c.bonus, c.deductions, c.advances, c.net,
      exists (
        select 1 from public.hr_payments p
        where p.employee_id = p_employee_id and p.status <> 'canceled' and p.kind in ('period', 'payroll')
          and p.period_start <= p_end and p.period_end >= p_start
      )
    from public.hr_compute_period(p_employee_id, p_start, p_end) c;
end;
$$;

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
    where p.employee_id = p_employee_id and p.status <> 'canceled' and p.kind in ('period', 'payroll')
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

create or replace function public.hr_cancel_payment(p_payment_id uuid)
returns public.hr_payments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := public.current_profile_user_id();
  v_company uuid := public.hr_manager_company_id();
  v_pay public.hr_payments;
begin
  if v_user is null then raise exception 'Usuário não autenticado.'; end if;
  if v_company is null then raise exception 'Acesso negado.'; end if;

  select * into v_pay from public.hr_payments where id = p_payment_id and company_id = v_company for update;
  if not found then raise exception 'Pagamento não encontrado.'; end if;
  if v_pay.status = 'canceled' then return v_pay; end if;
  if v_pay.status = 'paid' then
    raise exception 'Pagamento já efetuado não pode ser cancelado.';
  end if;

  update public.hr_time_entries set payment_id = null where payment_id = v_pay.id;
  update public.hr_adjustments set payment_id = null where payment_id = v_pay.id;
  update public.hr_vacations set payment_id = null where payment_id = v_pay.id;

  update public.hr_payments set status = 'canceled', canceled_at = now() where id = v_pay.id returning * into v_pay;

  insert into public.audit_logs (company_id, actor_user_id, entity_type, entity_id, action, metadata)
  values (v_company, v_user, 'hr_payment', v_pay.id, 'hr.payment_canceled',
    jsonb_build_object('employee_id', v_pay.employee_id, 'net', v_pay.net_amount));

  return v_pay;
end;
$$;

create or replace function public.hr_pay_payment(
  p_payment_id uuid,
  p_method public.sale_payment_method,
  p_paid_on date default null
)
returns public.hr_payments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := public.current_profile_user_id();
  v_company uuid := public.hr_manager_company_id();
  v_pay public.hr_payments;
  v_emp public.hr_employees;
  v_today date := public.today_sao_paulo();
  v_paid_on date;
  v_entry public.financial_entries;
  v_category uuid;
begin
  if v_user is null then raise exception 'Usuário não autenticado.'; end if;
  if v_company is null then raise exception 'Acesso negado.'; end if;

  select * into v_pay from public.hr_payments where id = p_payment_id and company_id = v_company for update;
  if not found then raise exception 'Pagamento não encontrado.'; end if;
  if v_pay.status = 'paid' then return v_pay; end if; -- idempotente: já pago, nada a fazer
  if v_pay.status <> 'pending' then raise exception 'Este pagamento foi cancelado.'; end if;

  if p_method is null or p_method not in ('cash', 'pix', 'other') then
    raise exception 'Informe como foi pago (dinheiro, Pix ou outro).';
  end if;
  v_paid_on := coalesce(p_paid_on, v_today);
  if v_paid_on > v_today then raise exception 'A data do pagamento não pode ser futura.'; end if;

  select * into v_emp from public.hr_employees where id = v_pay.employee_id;

  if v_pay.net_amount > 0 then
    perform public.seed_financial_defaults(v_company);
    select id into v_category from public.financial_categories
      where company_id = v_company and name = 'Pessoal' and kind = 'expense' and active = true limit 1;
    v_entry := public.create_financial_entry(
      'expense',
      case v_pay.kind
        when 'vacation' then 'Férias — ' || v_emp.full_name || ' (' || to_char(v_pay.period_start, 'DD/MM') || ' a ' || to_char(v_pay.period_end, 'DD/MM') || ')'
        when 'thirteenth' then '13º salário (' || (v_pay.calc ->> 'installment') || 'ª parcela) — ' || v_emp.full_name || ' (' || (v_pay.calc ->> 'year') || ')'
        else 'Pagamento RH — ' || v_emp.full_name || ' (' || to_char(v_pay.period_start, 'DD/MM') || ' a ' || to_char(v_pay.period_end, 'DD/MM') || ')'
      end,
      v_pay.net_amount, v_paid_on, p_method, v_category, null, v_pay.notes
    );
    update public.financial_entries set source_type = 'hr_payment', source_id = v_pay.id where id = v_entry.id;
  end if;

  update public.hr_payments
  set status = 'paid', paid_on = v_paid_on, paid_method = p_method, paid_by = v_user, financial_entry_id = v_entry.id
  where id = v_pay.id
  returning * into v_pay;

  insert into public.audit_logs (company_id, actor_user_id, entity_type, entity_id, action, metadata)
  values (v_company, v_user, 'hr_payment', v_pay.id, 'hr.payment_paid',
    jsonb_build_object('employee_id', v_pay.employee_id, 'net', v_pay.net_amount, 'method', p_method, 'paid_on', v_paid_on));

  return v_pay;
end;
$$;

commit;
