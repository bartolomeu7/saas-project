-- =============================================================================
-- RH — Fase 1 (modo Informal): funcionários, presença/diárias, vales e descontos, fechamento e pagamento.
--
-- Quem usa: SOMENTE dono e administrador (owner/admin). Funcionário (employee) não lê nem escreve nada de RH.
-- Dinheiro: pagar um período (e dar um vale) gera uma DESPESA no Financeiro, categoria "Pessoal", pelo caminho que
-- já existe (create_financial_entry): em dinheiro sai do caixa aberto, em Pix/outro entra só no financeiro.
--
-- Modelo:
--   hr_employees     cadastro (nome completo, nascimento, forma e dia de pagamento, valor)
--   hr_time_entries  presença: 1 = dia inteiro, 0,5 = meio dia, 0 = falta (para o funcionário "por diária")
--   hr_adjustments   vale (adiantamento, já sai do caixa/financeiro), desconto e bônus (entram no próximo fechamento)
--   hr_payments      fechamento de um período: dias, bruto, bônus, descontos, vales, líquido; "a pagar" -> "pago"
-- Escrita de presença, ajustes e pagamentos é SOMENTE por funções (RPC); as tabelas são só de leitura para o app.
-- Esta fase aceita apenas mode = 'informal' (a constraint é removida na fase CLT).
--
-- Rollback: supabase/rollback/20261108160000_hr_informal.down.sql
-- Bateria:  tests/sql/hr_informal.sql (somente TEST).
-- =============================================================================
begin;

-- ---------------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'hr_employment_mode' and typnamespace = 'public'::regnamespace) then
    create type public.hr_employment_mode as enum ('informal', 'clt');
  end if;
  if not exists (select 1 from pg_type where typname = 'hr_pay_frequency' and typnamespace = 'public'::regnamespace) then
    create type public.hr_pay_frequency as enum ('daily', 'weekly', 'biweekly', 'monthly');
  end if;
  if not exists (select 1 from pg_type where typname = 'hr_rate_kind' and typnamespace = 'public'::regnamespace) then
    create type public.hr_rate_kind as enum ('per_day', 'fixed');
  end if;
  if not exists (select 1 from pg_type where typname = 'hr_adjustment_kind' and typnamespace = 'public'::regnamespace) then
    create type public.hr_adjustment_kind as enum ('advance', 'deduction', 'bonus');
  end if;
  if not exists (select 1 from pg_type where typname = 'hr_payment_status' and typnamespace = 'public'::regnamespace) then
    create type public.hr_payment_status as enum ('pending', 'paid', 'canceled');
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Ajudante: empresa do usuário quando ele é owner/admin (senão NULL)
-- ---------------------------------------------------------------------------
create or replace function public.hr_manager_company_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select cm.company_id
  from public.company_members cm
  where cm.user_id = public.current_profile_user_id()
    and cm.role in ('owner'::public.company_role, 'admin'::public.company_role)
  limit 1
$$;

revoke all on function public.hr_manager_company_id() from public, anon;
grant execute on function public.hr_manager_company_id() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Funcionários
-- ---------------------------------------------------------------------------
create table if not exists public.hr_employees (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  full_name text not null,
  birth_date date,
  phone text,
  role_title text,
  pix_key text,
  mode public.hr_employment_mode not null default 'informal',
  status text not null default 'active',
  rate_kind public.hr_rate_kind not null default 'per_day',
  base_amount numeric(12,2) not null,
  pay_frequency public.hr_pay_frequency not null default 'weekly',
  pay_weekday smallint,
  pay_day_of_month smallint,
  started_on date,
  ended_on date,
  notes text,
  created_by uuid references public.profiles(user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hr_employees_company_id_id_key unique (company_id, id),
  constraint hr_employees_name_length check (char_length(trim(full_name)) between 3 and 160),
  constraint hr_employees_phone_length check (phone is null or char_length(phone) <= 40),
  constraint hr_employees_role_length check (role_title is null or char_length(role_title) <= 80),
  constraint hr_employees_pix_length check (pix_key is null or char_length(pix_key) <= 140),
  constraint hr_employees_notes_length check (notes is null or char_length(notes) <= 2000),
  constraint hr_employees_birth_range check (birth_date is null or birth_date >= date '1900-01-01'),
  constraint hr_employees_status_valid check (status in ('active', 'inactive')),
  constraint hr_employees_amount_positive check (base_amount > 0 and base_amount < 10000000),
  constraint hr_employees_weekday_range check (pay_weekday is null or pay_weekday between 0 and 6),
  constraint hr_employees_monthday_range check (pay_day_of_month is null or pay_day_of_month between 1 and 31),
  constraint hr_employees_ended_after_started check (ended_on is null or started_on is null or ended_on >= started_on),
  -- dia de pagamento coerente com a frequência
  constraint hr_employees_weekly_has_weekday check (pay_frequency <> 'weekly' or pay_weekday is not null),
  constraint hr_employees_monthly_has_day check (pay_frequency <> 'monthly' or pay_day_of_month is not null),
  constraint hr_employees_biweekly_has_day check (pay_frequency <> 'biweekly' or pay_day_of_month between 1 and 15),
  -- Fase 1 = só Informal; a fase CLT remove esta constraint.
  constraint hr_employees_phase1_informal_only check (mode = 'informal')
);

comment on table public.hr_employees is
  'RH: funcionários da empresa (fase 1: modo informal). Só owner/admin acessam. Quinzenal = dias X e X+15 do mês.';

create index if not exists hr_employees_company_status_idx on public.hr_employees (company_id, status, full_name);

drop trigger if exists hr_employees_set_updated_at on public.hr_employees;
create trigger hr_employees_set_updated_at
  before update on public.hr_employees
  for each row execute function public.set_updated_at();

create or replace function public.hr_employees_guard()
returns trigger
language plpgsql
as $$
begin
  if new.company_id is distinct from old.company_id then
    raise exception 'Não é possível trocar a empresa de um funcionário.';
  end if;
  new.full_name := trim(new.full_name);
  return new;
end;
$$;

drop trigger if exists hr_employees_guard on public.hr_employees;
create trigger hr_employees_guard
  before update on public.hr_employees
  for each row execute function public.hr_employees_guard();

-- Auditoria do cadastro: gatilho no próprio módulo (a função write_audit_log do app tem lista fixa de ações).
create or replace function public.hr_employees_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_action text;
begin
  if tg_op = 'INSERT' then
    v_action := 'hr.employee_created';
  elsif old.status is distinct from new.status then
    v_action := case when new.status = 'inactive' then 'hr.employee_deactivated' else 'hr.employee_reactivated' end;
  else
    v_action := 'hr.employee_updated';
  end if;

  insert into public.audit_logs (company_id, actor_user_id, entity_type, entity_id, action, metadata)
  values (new.company_id, public.current_profile_user_id(), 'hr_employee', new.id, v_action, '{}'::jsonb);
  return new;
end;
$$;

revoke all on function public.hr_employees_audit() from public, anon, authenticated;

drop trigger if exists hr_employees_audit on public.hr_employees;
create trigger hr_employees_audit
  after insert or update on public.hr_employees
  for each row execute function public.hr_employees_audit();

-- ---------------------------------------------------------------------------
-- Pagamentos (fechamento de período)
-- ---------------------------------------------------------------------------
create table if not exists public.hr_payments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  employee_id uuid not null,
  period_start date not null,
  period_end date not null,
  days_worked numeric(6,1) not null default 0,
  gross_amount numeric(12,2) not null,
  bonus_amount numeric(12,2) not null default 0,
  deductions_amount numeric(12,2) not null default 0,
  advances_amount numeric(12,2) not null default 0,
  net_amount numeric(12,2) not null,
  due_on date not null,
  status public.hr_payment_status not null default 'pending',
  paid_on date,
  paid_method public.sale_payment_method,
  financial_entry_id uuid references public.financial_entries(id) on delete set null,
  notes text,
  created_by uuid references public.profiles(user_id) on delete set null,
  paid_by uuid references public.profiles(user_id) on delete set null,
  canceled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hr_payments_employee_fk foreign key (company_id, employee_id)
    references public.hr_employees (company_id, id) on delete cascade,
  constraint hr_payments_company_id_id_key unique (company_id, id),
  constraint hr_payments_period_valid check (period_end >= period_start),
  constraint hr_payments_amounts_valid check (
    gross_amount >= 0 and bonus_amount >= 0 and deductions_amount >= 0 and advances_amount >= 0 and net_amount >= 0
    and net_amount = gross_amount + bonus_amount - deductions_amount - advances_amount
  ),
  constraint hr_payments_paid_consistent check (
    (status = 'paid' and paid_on is not null and paid_method is not null)
    or (status <> 'paid' and paid_on is null)
  ),
  constraint hr_payments_notes_length check (notes is null or char_length(notes) <= 1000)
);

comment on table public.hr_payments is
  'RH: fechamento de período de um funcionário. pending = a pagar; paid = pago (gera despesa em Pessoal); canceled.';

create index if not exists hr_payments_company_status_due_idx on public.hr_payments (company_id, status, due_on);
create index if not exists hr_payments_employee_idx on public.hr_payments (employee_id, period_end desc);

drop trigger if exists hr_payments_set_updated_at on public.hr_payments;
create trigger hr_payments_set_updated_at
  before update on public.hr_payments
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Presença
-- ---------------------------------------------------------------------------
create table if not exists public.hr_time_entries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  employee_id uuid not null,
  work_date date not null,
  quantity numeric(2,1) not null,
  payment_id uuid references public.hr_payments(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint hr_time_entries_employee_fk foreign key (company_id, employee_id)
    references public.hr_employees (company_id, id) on delete cascade,
  constraint hr_time_entries_quantity_valid check (quantity in (0, 0.5, 1)),
  constraint hr_time_entries_unique_day unique (employee_id, work_date)
);

create index if not exists hr_time_entries_payment_idx on public.hr_time_entries (payment_id) where payment_id is not null;

-- ---------------------------------------------------------------------------
-- Vales, descontos e bônus
-- ---------------------------------------------------------------------------
create table if not exists public.hr_adjustments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  employee_id uuid not null,
  kind public.hr_adjustment_kind not null,
  amount numeric(12,2) not null,
  occurred_on date not null,
  description text,
  payment_id uuid references public.hr_payments(id) on delete set null,
  financial_entry_id uuid references public.financial_entries(id) on delete set null,
  created_by uuid references public.profiles(user_id) on delete set null,
  created_at timestamptz not null default now(),
  constraint hr_adjustments_employee_fk foreign key (company_id, employee_id)
    references public.hr_employees (company_id, id) on delete cascade,
  constraint hr_adjustments_amount_positive check (amount > 0 and amount < 10000000),
  constraint hr_adjustments_description_length check (description is null or char_length(description) <= 300)
);

create index if not exists hr_adjustments_employee_idx on public.hr_adjustments (employee_id, occurred_on desc);
create index if not exists hr_adjustments_payment_idx on public.hr_adjustments (payment_id) where payment_id is not null;

-- ---------------------------------------------------------------------------
-- RLS: leitura e cadastro só owner/admin. Presença, ajustes e pagamentos: SOMENTE por função.
-- ---------------------------------------------------------------------------
alter table public.hr_employees enable row level security;
alter table public.hr_payments enable row level security;
alter table public.hr_time_entries enable row level security;
alter table public.hr_adjustments enable row level security;

drop policy if exists hr_employees_select_managers on public.hr_employees;
create policy hr_employees_select_managers on public.hr_employees for select to authenticated
  using (company_id = (select public.hr_manager_company_id()));
drop policy if exists hr_employees_insert_managers on public.hr_employees;
create policy hr_employees_insert_managers on public.hr_employees for insert to authenticated
  with check (company_id = (select public.hr_manager_company_id()));
drop policy if exists hr_employees_update_managers on public.hr_employees;
create policy hr_employees_update_managers on public.hr_employees for update to authenticated
  using (company_id = (select public.hr_manager_company_id()))
  with check (company_id = (select public.hr_manager_company_id()));

drop policy if exists hr_payments_select_managers on public.hr_payments;
create policy hr_payments_select_managers on public.hr_payments for select to authenticated
  using (company_id = (select public.hr_manager_company_id()));
drop policy if exists hr_time_entries_select_managers on public.hr_time_entries;
create policy hr_time_entries_select_managers on public.hr_time_entries for select to authenticated
  using (company_id = (select public.hr_manager_company_id()));
drop policy if exists hr_adjustments_select_managers on public.hr_adjustments;
create policy hr_adjustments_select_managers on public.hr_adjustments for select to authenticated
  using (company_id = (select public.hr_manager_company_id()));

revoke all on table public.hr_employees, public.hr_payments, public.hr_time_entries, public.hr_adjustments from anon;
revoke insert, update, delete, truncate on table public.hr_payments, public.hr_time_entries, public.hr_adjustments from authenticated;
revoke delete, truncate on table public.hr_employees from authenticated;

-- ---------------------------------------------------------------------------
-- Cálculo do período (fonte única da conta; usado na prévia e no fechamento). Interna: ninguém executa direto.
-- ---------------------------------------------------------------------------
create or replace function public.hr_compute_period(p_employee_id uuid, p_start date, p_end date)
returns table (days_worked numeric, gross numeric, bonus numeric, deductions numeric, advances numeric, net numeric)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_emp public.hr_employees;
  v_days numeric := 0;
  v_gross numeric(12,2);
  v_bonus numeric(12,2);
  v_ded numeric(12,2);
  v_adv numeric(12,2);
begin
  select * into v_emp from public.hr_employees where id = p_employee_id;
  if not found then raise exception 'Funcionário não encontrado.'; end if;

  select coalesce(sum(t.quantity), 0) into v_days
  from public.hr_time_entries t
  where t.employee_id = p_employee_id and t.payment_id is null and t.work_date between p_start and p_end;

  v_gross := case when v_emp.rate_kind = 'per_day' then round(v_days * v_emp.base_amount, 2) else v_emp.base_amount end;

  -- vales, descontos e bônus ainda não acertados, até o fim do período (inclusive os de antes do início)
  select
    coalesce(sum(a.amount) filter (where a.kind = 'bonus'), 0),
    coalesce(sum(a.amount) filter (where a.kind = 'deduction'), 0),
    coalesce(sum(a.amount) filter (where a.kind = 'advance'), 0)
  into v_bonus, v_ded, v_adv
  from public.hr_adjustments a
  where a.employee_id = p_employee_id and a.payment_id is null and a.occurred_on <= p_end;

  return query select v_days, v_gross, v_bonus, v_ded, v_adv, (v_gross + v_bonus - v_ded - v_adv);
end;
$$;

revoke all on function public.hr_compute_period(uuid, date, date) from public, anon, authenticated;
grant execute on function public.hr_compute_period(uuid, date, date) to service_role;

-- ---------------------------------------------------------------------------
-- Prévia do fechamento (não grava nada)
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
        where p.employee_id = p_employee_id and p.status <> 'canceled'
          and p.period_start <= p_end and p.period_end >= p_start
      )
    from public.hr_compute_period(p_employee_id, p_start, p_end) c;
end;
$$;

revoke all on function public.hr_period_preview(uuid, date, date) from public, anon;
grant execute on function public.hr_period_preview(uuid, date, date) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Presença: marca (ou apaga, com quantidade nula) uma ou mais datas
-- ---------------------------------------------------------------------------
create or replace function public.hr_set_attendance(p_employee_id uuid, p_work_dates date[], p_quantity numeric)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid := public.hr_manager_company_id();
  v_emp public.hr_employees;
  v_today date := public.today_sao_paulo();
  v_date date;
  v_count integer := 0;
  v_settled integer;
begin
  if public.current_profile_user_id() is null then raise exception 'Usuário não autenticado.'; end if;
  if v_company is null then raise exception 'Acesso negado.'; end if;

  select * into v_emp from public.hr_employees where id = p_employee_id and company_id = v_company for update;
  if not found then raise exception 'Funcionário não encontrado.'; end if;

  if p_work_dates is null or coalesce(array_length(p_work_dates, 1), 0) = 0 then raise exception 'Informe ao menos um dia.'; end if;
  if array_length(p_work_dates, 1) > 62 then raise exception 'Marque no máximo 62 dias por vez.'; end if;
  if p_quantity is not null and p_quantity not in (0, 0.5, 1) then raise exception 'Quantidade inválida: use 1, 0,5 ou 0 (falta).'; end if;

  foreach v_date in array p_work_dates loop
    if v_date is null then raise exception 'Data inválida.'; end if;
    if v_date > v_today then raise exception 'Não é possível marcar presença em data futura.'; end if;

    select count(*) into v_settled
    from public.hr_time_entries
    where employee_id = p_employee_id and work_date = v_date and payment_id is not null;
    if v_settled > 0 then raise exception 'O dia % já foi incluído em um pagamento.', to_char(v_date, 'DD/MM/YYYY'); end if;

    if p_quantity is null then
      delete from public.hr_time_entries where employee_id = p_employee_id and work_date = v_date;
    else
      insert into public.hr_time_entries (company_id, employee_id, work_date, quantity)
      values (v_company, p_employee_id, v_date, p_quantity)
      on conflict (employee_id, work_date) do update set quantity = excluded.quantity;
    end if;
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.hr_set_attendance(uuid, date[], numeric) from public, anon;
grant execute on function public.hr_set_attendance(uuid, date[], numeric) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Vale / desconto / bônus
-- ---------------------------------------------------------------------------
create or replace function public.hr_add_adjustment(
  p_employee_id uuid,
  p_kind public.hr_adjustment_kind,
  p_amount numeric,
  p_occurred_on date default null,
  p_description text default null,
  p_method public.sale_payment_method default null
)
returns public.hr_adjustments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := public.current_profile_user_id();
  v_company uuid := public.hr_manager_company_id();
  v_emp public.hr_employees;
  v_today date := public.today_sao_paulo();
  v_date date;
  v_amount numeric(12,2);
  v_row public.hr_adjustments;
  v_entry public.financial_entries;
  v_category uuid;
  v_label text;
begin
  if v_user is null then raise exception 'Usuário não autenticado.'; end if;
  if v_company is null then raise exception 'Acesso negado.'; end if;

  select * into v_emp from public.hr_employees where id = p_employee_id and company_id = v_company for update;
  if not found then raise exception 'Funcionário não encontrado.'; end if;

  if p_kind is null then raise exception 'Informe o tipo (vale, desconto ou bônus).'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'O valor deve ser maior que zero.'; end if;
  v_amount := round(p_amount, 2);
  if v_amount >= 10000000 then raise exception 'Valor alto demais.'; end if;
  v_date := coalesce(p_occurred_on, v_today);
  if v_date > v_today then raise exception 'A data não pode ser futura.'; end if;
  if p_description is not null and char_length(p_description) > 300 then raise exception 'Descrição longa demais (máximo 300).'; end if;

  if p_kind = 'advance' then
    if p_method is null or p_method not in ('cash', 'pix', 'other') then
      raise exception 'Informe como o vale foi pago (dinheiro, Pix ou outro).';
    end if;
    perform public.seed_financial_defaults(v_company);
    select id into v_category from public.financial_categories
      where company_id = v_company and name = 'Pessoal' and kind = 'expense' and active = true limit 1;
    v_label := 'Vale — ' || v_emp.full_name;
    v_entry := public.create_financial_entry('expense', v_label, v_amount, v_date, p_method, v_category, null, nullif(trim(p_description), ''));
  elsif p_method is not null then
    raise exception 'Forma de pagamento só vale para vale (adiantamento).';
  end if;

  insert into public.hr_adjustments (company_id, employee_id, kind, amount, occurred_on, description, financial_entry_id, created_by)
  values (v_company, p_employee_id, p_kind, v_amount, v_date, nullif(trim(p_description), ''), v_entry.id, v_user)
  returning * into v_row;

  if v_entry.id is not null then
    update public.financial_entries set source_type = 'hr_adjustment', source_id = v_row.id where id = v_entry.id;
  end if;

  insert into public.audit_logs (company_id, actor_user_id, entity_type, entity_id, action, metadata)
  values (v_company, v_user, 'hr_adjustment', v_row.id, 'hr.adjustment_created',
    jsonb_build_object('employee_id', p_employee_id, 'kind', p_kind, 'amount', v_amount, 'method', p_method));

  return v_row;
end;
$$;

revoke all on function public.hr_add_adjustment(uuid, public.hr_adjustment_kind, numeric, date, text, public.sale_payment_method) from public, anon;
grant execute on function public.hr_add_adjustment(uuid, public.hr_adjustment_kind, numeric, date, text, public.sale_payment_method) to authenticated, service_role;

create or replace function public.hr_delete_adjustment(p_adjustment_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := public.current_profile_user_id();
  v_company uuid := public.hr_manager_company_id();
  v_row public.hr_adjustments;
begin
  if v_user is null then raise exception 'Usuário não autenticado.'; end if;
  if v_company is null then raise exception 'Acesso negado.'; end if;

  select * into v_row from public.hr_adjustments where id = p_adjustment_id and company_id = v_company for update;
  if not found then raise exception 'Lançamento não encontrado.'; end if;
  if v_row.payment_id is not null then raise exception 'Este lançamento já foi incluído em um pagamento.'; end if;
  if v_row.kind = 'advance' then
    raise exception 'Vale já saiu do caixa/financeiro e não pode ser apagado.';
  end if;

  delete from public.hr_adjustments where id = v_row.id;

  insert into public.audit_logs (company_id, actor_user_id, entity_type, entity_id, action, metadata)
  values (v_company, v_user, 'hr_adjustment', v_row.id, 'hr.adjustment_deleted',
    jsonb_build_object('employee_id', v_row.employee_id, 'kind', v_row.kind, 'amount', v_row.amount));
end;
$$;

revoke all on function public.hr_delete_adjustment(uuid) from public, anon;
grant execute on function public.hr_delete_adjustment(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Fechar o período: cria o pagamento "a pagar" e trava presença/ajustes incluídos
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

revoke all on function public.hr_close_period(uuid, date, date, date, text) from public, anon;
grant execute on function public.hr_close_period(uuid, date, date, date, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Pagar: gera a despesa em Pessoal (caixa se dinheiro) e marca como pago
-- ---------------------------------------------------------------------------
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
      'Pagamento RH — ' || v_emp.full_name || ' (' || to_char(v_pay.period_start, 'DD/MM') || ' a ' || to_char(v_pay.period_end, 'DD/MM') || ')',
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

revoke all on function public.hr_pay_payment(uuid, public.sale_payment_method, date) from public, anon;
grant execute on function public.hr_pay_payment(uuid, public.sale_payment_method, date) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Cancelar pagamento ainda "a pagar": libera os dias e ajustes para um novo fechamento
-- ---------------------------------------------------------------------------
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

  update public.hr_payments set status = 'canceled', canceled_at = now() where id = v_pay.id returning * into v_pay;

  insert into public.audit_logs (company_id, actor_user_id, entity_type, entity_id, action, metadata)
  values (v_company, v_user, 'hr_payment', v_pay.id, 'hr.payment_canceled',
    jsonb_build_object('employee_id', v_pay.employee_id, 'net', v_pay.net_amount));

  return v_pay;
end;
$$;

revoke all on function public.hr_cancel_payment(uuid) from public, anon;
grant execute on function public.hr_cancel_payment(uuid) to authenticated, service_role;

commit;
