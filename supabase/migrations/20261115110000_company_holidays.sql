-- =============================================================================
-- Feriados e dias especiais da EMPRESA (municipais, estaduais, recesso). Complementa os feriados nacionais, que o app já conhece.
-- O Chat AI e a agenda avisam quando um agendamento cai num desses dias. Nova tabela, aditiva.
-- Leitura: qualquer membro da empresa. Escrita: dono e administrador (mesmo padrão das demais configurações da empresa).
-- Rollback: supabase/rollback/20261115110000_company_holidays.down.sql
-- =============================================================================
begin;

create table if not exists public.company_holidays (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  holiday_date date not null,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  -- repete todo ano no mesmo dia e mês (feriado municipal); false = só nessa data (recesso, evento)
  yearly boolean not null default false,
  -- true = a empresa não atende nesse dia (aviso forte); false = só destaque ("ponto facultativo", "horário reduzido")
  closed boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, holiday_date, name)
);

create index if not exists company_holidays_company_date_idx on public.company_holidays (company_id, holiday_date);

drop trigger if exists company_holidays_set_updated_at on public.company_holidays;
create trigger company_holidays_set_updated_at before update on public.company_holidays
  for each row execute function public.set_updated_at();

drop trigger if exists company_holidays_protect_company_id on public.company_holidays;
create trigger company_holidays_protect_company_id before update on public.company_holidays
  for each row execute function public.protect_company_id();

alter table public.company_holidays enable row level security;

drop policy if exists company_holidays_select_member on public.company_holidays;
create policy company_holidays_select_member on public.company_holidays for select to authenticated
  using (exists (select 1 from public.company_members cm where cm.company_id = company_holidays.company_id and cm.user_id = (select public.current_profile_user_id())));

drop policy if exists company_holidays_insert_admin on public.company_holidays;
create policy company_holidays_insert_admin on public.company_holidays for insert to authenticated
  with check (exists (select 1 from public.company_members cm where cm.company_id = company_holidays.company_id and cm.user_id = (select public.current_profile_user_id()) and cm.role in ('owner', 'admin')));

drop policy if exists company_holidays_update_admin on public.company_holidays;
create policy company_holidays_update_admin on public.company_holidays for update to authenticated
  using (exists (select 1 from public.company_members cm where cm.company_id = company_holidays.company_id and cm.user_id = (select public.current_profile_user_id()) and cm.role in ('owner', 'admin')))
  with check (exists (select 1 from public.company_members cm where cm.company_id = company_holidays.company_id and cm.user_id = (select public.current_profile_user_id()) and cm.role in ('owner', 'admin')));

drop policy if exists company_holidays_delete_admin on public.company_holidays;
create policy company_holidays_delete_admin on public.company_holidays for delete to authenticated
  using (exists (select 1 from public.company_members cm where cm.company_id = company_holidays.company_id and cm.user_id = (select public.current_profile_user_id()) and cm.role in ('owner', 'admin')));

revoke all on table public.company_holidays from public, anon;
grant select, insert, update, delete on table public.company_holidays to authenticated;
grant all on table public.company_holidays to service_role;

comment on table public.company_holidays is 'Feriados/dias especiais da empresa. yearly=true repete todo ano; closed=true avisa que a empresa não atende.';

commit;
