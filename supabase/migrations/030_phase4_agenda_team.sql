
do $$
begin
  create type public.appointment_status as enum (
    'scheduled','confirmed','completed','cancelled','no_show'
  );
exception when duplicate_object then null;
end $$;

create table if not exists public.professional_profiles (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  company_member_id uuid not null unique references public.company_members(id) on delete cascade,
  display_name text not null,
  phone text,
  specialty text,
  color text not null default 'sky',
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists professional_profiles_company_active_idx
  on public.professional_profiles(company_id, active);

create table if not exists public.professional_services (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references public.professional_profiles(id) on delete cascade,
  service_id uuid not null references public.services(id) on delete cascade,
  duration_override_minutes integer,
  price_override numeric(12,2),
  created_at timestamptz not null default now(),
  unique (professional_id, service_id),
  check (duration_override_minutes is null or duration_override_minutes > 0),
  check (price_override is null or price_override >= 0)
);

create index if not exists professional_services_service_idx
  on public.professional_services(service_id);

create table if not exists public.professional_availability (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references public.professional_profiles(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  start_time time not null,
  end_time time not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_time > start_time),
  unique (professional_id, weekday, start_time, end_time)
);

create index if not exists professional_availability_lookup_idx
  on public.professional_availability(professional_id, weekday, active);

create table if not exists public.professional_blocks (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  professional_id uuid not null references public.professional_profiles(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create index if not exists professional_blocks_lookup_idx
  on public.professional_blocks(professional_id, starts_at, ends_at);

create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  service_id uuid not null references public.services(id) on delete restrict,
  professional_id uuid references public.professional_profiles(id) on delete set null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  duration_minutes integer not null check (duration_minutes > 0),
  price numeric(12,2) not null default 0 check (price >= 0),
  status public.appointment_status not null default 'scheduled',
  notes text,
  cancellation_reason text,
  sale_id uuid references public.sales(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create index if not exists appointments_company_starts_idx
  on public.appointments(company_id, starts_at);
create index if not exists appointments_professional_starts_idx
  on public.appointments(professional_id, starts_at);
create index if not exists appointments_customer_starts_idx
  on public.appointments(customer_id, starts_at);
create index if not exists appointments_status_idx
  on public.appointments(company_id, status, starts_at);

create or replace function public.seed_professional_profile_from_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  select coalesce(nullif(trim(full_name), ''), nullif(trim(email), ''), 'Colaborador')
  into v_name
  from public.profiles
  where user_id = new.user_id
  limit 1;

  insert into public.professional_profiles(company_id, company_member_id, display_name)
  values(new.company_id, new.id, coalesce(v_name, 'Colaborador'))
  on conflict (company_member_id) do nothing;

  return new;
end;
$$;

drop trigger if exists company_members_seed_professional on public.company_members;
create trigger company_members_seed_professional
after insert on public.company_members
for each row execute function public.seed_professional_profile_from_member();

insert into public.professional_profiles(company_id, company_member_id, display_name)
select
  cm.company_id,
  cm.id,
  coalesce(nullif(trim(p.full_name), ''), nullif(trim(p.email), ''), 'Colaborador')
from public.company_members cm
left join public.profiles p on p.user_id = cm.user_id
on conflict (company_member_id) do nothing;

create or replace function public.touch_phase4_rows()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists professional_profiles_updated_at on public.professional_profiles;
create trigger professional_profiles_updated_at
before update on public.professional_profiles
for each row execute function public.touch_phase4_rows();

drop trigger if exists professional_availability_updated_at on public.professional_availability;
create trigger professional_availability_updated_at
before update on public.professional_availability
for each row execute function public.touch_phase4_rows();

drop trigger if exists appointments_updated_at on public.appointments;
create trigger appointments_updated_at
before update on public.appointments
for each row execute function public.touch_phase4_rows();

alter table public.professional_profiles enable row level security;
alter table public.professional_services enable row level security;
alter table public.professional_availability enable row level security;
alter table public.professional_blocks enable row level security;
alter table public.appointments enable row level security;

drop policy if exists professional_profiles_select_company on public.professional_profiles;
create policy professional_profiles_select_company
on public.professional_profiles for select
using (company_id in (
  select cm.company_id from public.company_members cm where cm.user_id = auth.uid()
));

drop policy if exists professional_services_select_company on public.professional_services;
create policy professional_services_select_company
on public.professional_services for select
using (professional_id in (
  select pp.id
  from public.professional_profiles pp
  join public.company_members cm on cm.company_id = pp.company_id
  where cm.user_id = auth.uid()
));

drop policy if exists professional_availability_select_company on public.professional_availability;
create policy professional_availability_select_company
on public.professional_availability for select
using (professional_id in (
  select pp.id
  from public.professional_profiles pp
  join public.company_members cm on cm.company_id = pp.company_id
  where cm.user_id = auth.uid()
));

drop policy if exists professional_blocks_select_company on public.professional_blocks;
create policy professional_blocks_select_company
on public.professional_blocks for select
using (company_id in (
  select cm.company_id from public.company_members cm where cm.user_id = auth.uid()
));

drop policy if exists appointments_select_company on public.appointments;
create policy appointments_select_company
on public.appointments for select
using (company_id in (
  select cm.company_id from public.company_members cm where cm.user_id = auth.uid()
));

create or replace function public.list_company_team()
returns table (
  member_id uuid,
  user_id uuid,
  role public.company_role,
  full_name text,
  email text,
  avatar_url text,
  professional_id uuid,
  display_name text,
  phone text,
  specialty text,
  color text,
  notes text,
  professional_active boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_role public.company_role;
begin
  select company_id, role into v_company_id, v_role
  from public.company_members
  where user_id = auth.uid()
  order by created_at asc
  limit 1;

  if v_company_id is null then raise exception 'Nenhuma empresa encontrada.'; end if;

  return query
  select
    cm.id, cm.user_id, cm.role,
    p.full_name, p.email, p.avatar_url,
    pp.id, pp.display_name, pp.phone, pp.specialty,
    pp.color, pp.notes, pp.active
  from public.company_members cm
  left join public.profiles p on p.user_id = cm.user_id
  left join public.professional_profiles pp on pp.company_member_id = cm.id
  where cm.company_id = v_company_id
  order by
    case when cm.role = 'owner' then 0 when cm.role = 'admin' then 1 else 2 end,
    coalesce(nullif(trim(p.full_name), ''), p.email, pp.display_name);
end;
$$;

create or replace function public.add_existing_company_member(
  p_email text,
  p_role public.company_role default 'employee'
)
returns public.company_members
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_company_id uuid;
  v_actor_role public.company_role;
  v_row public.company_members;
begin
  select company_id, role into v_company_id, v_actor_role
  from public.company_members
  where user_id = auth.uid()
  order by created_at asc
  limit 1;

  if v_company_id is null then raise exception 'Nenhuma empresa encontrada.'; end if;
  if v_actor_role not in ('owner','admin') then raise exception 'Apenas owner/admin podem adicionar colaboradores.'; end if;
  if p_role = 'owner' then raise exception 'Novo colaborador deve entrar como admin ou employee.'; end if;
  if nullif(trim(p_email), '') is null then raise exception 'Informe o e-mail do colaborador.'; end if;

  select user_id into v_user_id
  from public.profiles
  where lower(email) = lower(trim(p_email))
  limit 1;

  if v_user_id is null then
    raise exception 'Usuário não encontrado. A pessoa precisa criar a conta no Prime Ges antes de ser adicionada.';
  end if;

  if exists (select 1 from public.company_members where company_id = v_company_id and user_id = v_user_id) then
    raise exception 'Este usuário já pertence à empresa.';
  end if;

  insert into public.company_members(company_id, user_id, role)
  values(v_company_id, v_user_id, p_role)
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.update_company_member_role(
  p_member_id uuid,
  p_role public.company_role
)
returns public.company_members
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_actor_role public.company_role;
  v_target public.company_members;
  v_owner_count integer;
begin
  select company_id, role into v_company_id, v_actor_role
  from public.company_members
  where user_id = auth.uid()
  order by created_at asc
  limit 1;

  if v_company_id is null then raise exception 'Nenhuma empresa encontrada.'; end if;
  if v_actor_role not in ('owner','admin') then raise exception 'Apenas owner/admin podem alterar permissões.'; end if;

  select * into v_target
  from public.company_members
  where id = p_member_id and company_id = v_company_id
  for update;

  if v_target is null then raise exception 'Colaborador não encontrado.'; end if;

  if v_target.role = 'owner' and p_role <> 'owner' then
    select count(*) into v_owner_count from public.company_members where company_id = v_company_id and role = 'owner';
    if v_owner_count <= 1 then raise exception 'A empresa precisa manter pelo menos um owner.'; end if;
  end if;

  if p_role = 'owner' and v_actor_role <> 'owner' then
    raise exception 'Somente owner pode promover outro colaborador a owner.';
  end if;

  update public.company_members set role = p_role where id = p_member_id returning * into v_target;
  return v_target;
end;
$$;

create or replace function public.remove_company_member(p_member_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_actor_role public.company_role;
  v_target public.company_members;
  v_owner_count integer;
begin
  select company_id, role into v_company_id, v_actor_role
  from public.company_members
  where user_id = auth.uid()
  order by created_at asc
  limit 1;

  if v_company_id is null then raise exception 'Nenhuma empresa encontrada.'; end if;
  if v_actor_role not in ('owner','admin') then raise exception 'Apenas owner/admin podem remover colaboradores.'; end if;

  select * into v_target from public.company_members
  where id = p_member_id and company_id = v_company_id
  for update;

  if v_target is null then raise exception 'Colaborador não encontrado.'; end if;
  if v_target.user_id = auth.uid() and v_target.role = 'owner' then raise exception 'O owner atual não pode remover a própria conta.'; end if;

  if v_target.role = 'owner' then
    select count(*) into v_owner_count from public.company_members where company_id = v_company_id and role = 'owner';
    if v_owner_count <= 1 then raise exception 'Não é possível remover o último owner.'; end if;
    if v_actor_role <> 'owner' then raise exception 'Somente owner pode remover outro owner.'; end if;
  end if;

  delete from public.company_members where id = p_member_id;
end;
$$;

create or replace function public.upsert_professional_profile(
  p_company_member_id uuid,
  p_display_name text,
  p_phone text default null,
  p_specialty text default null,
  p_color text default 'sky',
  p_notes text default null,
  p_active boolean default true
)
returns public.professional_profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_actor_role public.company_role;
  v_row public.professional_profiles;
begin
  select company_id, role into v_company_id, v_actor_role
  from public.company_members
  where user_id = auth.uid()
  order by created_at asc
  limit 1;

  if v_company_id is null then raise exception 'Nenhuma empresa encontrada.'; end if;
  if v_actor_role not in ('owner','admin') then raise exception 'Apenas owner/admin podem editar profissionais.'; end if;
  if nullif(trim(p_display_name), '') is null then raise exception 'Informe o nome do profissional.'; end if;

  if not exists (select 1 from public.company_members where id = p_company_member_id and company_id = v_company_id) then
    raise exception 'Colaborador inválido para esta empresa.';
  end if;

  insert into public.professional_profiles(
    company_id,company_member_id,display_name,phone,specialty,color,notes,active
  )
  values(
    v_company_id,p_company_member_id,trim(p_display_name),
    nullif(trim(p_phone),''),nullif(trim(p_specialty),''),
    coalesce(nullif(trim(p_color),''),'sky'),
    nullif(trim(p_notes),''),coalesce(p_active,true)
  )
  on conflict(company_member_id)
  do update set
    display_name=excluded.display_name,
    phone=excluded.phone,
    specialty=excluded.specialty,
    color=excluded.color,
    notes=excluded.notes,
    active=excluded.active,
    updated_at=now()
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.set_professional_services(p_professional_id uuid,p_services jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_actor_role public.company_role;
  v_item jsonb;
  v_service_id uuid;
  v_duration integer;
  v_price numeric(12,2);
begin
  select company_id, role into v_company_id, v_actor_role
  from public.company_members
  where user_id = auth.uid()
  order by created_at asc
  limit 1;

  if v_company_id is null or v_actor_role not in ('owner','admin') then raise exception 'Apenas owner/admin podem configurar serviços do profissional.'; end if;
  if not exists (select 1 from public.professional_profiles where id=p_professional_id and company_id=v_company_id) then raise exception 'Profissional inválido.'; end if;

  delete from public.professional_services where professional_id = p_professional_id;

  for v_item in select * from jsonb_array_elements(coalesce(p_services, '[]'::jsonb))
  loop
    v_service_id := (v_item ->> 'service_id')::uuid;
    v_duration := nullif(v_item ->> 'duration_override_minutes','')::integer;
    v_price := nullif(v_item ->> 'price_override','')::numeric;

    if not exists (select 1 from public.services where id=v_service_id and company_id=v_company_id) then
      raise exception 'Serviço inválido para esta empresa.';
    end if;

    insert into public.professional_services(professional_id,service_id,duration_override_minutes,price_override)
    values(v_professional_id,v_service_id,v_duration,v_price);
  end loop;
end;
$$;

create or replace function public.set_professional_availability(p_professional_id uuid,p_schedule jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_actor_role public.company_role;
  v_item jsonb;
  v_weekday smallint;
  v_start time;
  v_end time;
  v_active boolean;
begin
  select company_id, role into v_company_id, v_actor_role
  from public.company_members
  where user_id = auth.uid()
  order by created_at asc
  limit 1;

  if v_company_id is null or v_actor_role not in ('owner','admin') then raise exception 'Apenas owner/admin podem configurar horários.'; end if;
  if not exists (select 1 from public.professional_profiles where id=p_professional_id and company_id=v_company_id) then raise exception 'Profissional inválido.'; end if;

  delete from public.professional_availability where professional_id = p_professional_id;

  for v_item in select * from jsonb_array_elements(coalesce(p_schedule, '[]'::jsonb))
  loop
    v_weekday := (v_item ->> 'weekday')::smallint;
    v_start := (v_item ->> 'start_time')::time;
    v_end := (v_item ->> 'end_time')::time;
    v_active := coalesce((v_item ->> 'active')::boolean, true);

    if v_weekday < 0 or v_weekday > 6 then raise exception 'Dia da semana inválido.'; end if;
    if v_end <= v_start then raise exception 'Horário final deve ser maior que o inicial.'; end if;

    insert into public.professional_availability(professional_id,weekday,start_time,end_time,active)
    values(p_professional_id,v_weekday,v_start,v_end,v_active);
  end loop;
end;
$$;

create or replace function public.create_professional_block(
  p_professional_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_reason text default null
)
returns public.professional_blocks
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_actor_role public.company_role;
  v_row public.professional_blocks;
begin
  select company_id, role into v_company_id, v_actor_role
  from public.company_members
  where user_id = auth.uid()
  order by created_at asc
  limit 1;

  if v_company_id is null or v_actor_role not in ('owner','admin') then raise exception 'Apenas owner/admin podem bloquear horários.'; end if;
  if not exists (select 1 from public.professional_profiles where id=p_professional_id and company_id=v_company_id and active=true) then
    raise exception 'Profissional inválido ou inativo.';
  end if;
  if p_ends_at <= p_starts_at then raise exception 'Fim do bloqueio deve ser maior que o início.'; end if;

  if exists (
    select 1 from public.appointments a
    where a.professional_id=p_professional_id
      and a.status in ('scheduled','confirmed')
      and p_starts_at < a.ends_at
      and p_ends_at > a.starts_at
  ) then
    raise exception 'Existe um agendamento neste horário.';
  end if;

  insert into public.professional_blocks(company_id,professional_id,starts_at,ends_at,reason,created_by)
  values(v_company_id,p_professional_id,p_starts_at,p_ends_at,nullif(trim(p_reason),''),auth.uid())
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.delete_professional_block(p_block_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_actor_role public.company_role;
begin
  select company_id, role into v_company_id, v_actor_role
  from public.company_members
  where user_id = auth.uid()
  order by created_at asc
  limit 1;

  if v_company_id is null or v_actor_role not in ('owner','admin') then raise exception 'Apenas owner/admin podem remover bloqueios.'; end if;

  delete from public.professional_blocks where id=p_block_id and company_id=v_company_id;
end;
$$;

create or replace function public.create_appointment(
  p_customer_id uuid default null,
  p_service_id uuid default null,
  p_professional_id uuid default null,
  p_starts_at timestamptz default null,
  p_duration_minutes integer default null,
  p_price numeric default null,
  p_notes text default null
)
returns public.appointments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_company_id uuid;
  v_role public.company_role;
  v_service public.services;
  v_professional public.professional_profiles;
  v_duration integer;
  v_price numeric(12,2);
  v_ends_at timestamptz;
  v_weekday smallint;
  v_has_availability boolean;
  v_appointment public.appointments;
begin
  if v_user_id is null then raise exception 'Usuário não autenticado.'; end if;

  select company_id, role into v_company_id, v_role
  from public.company_members
  where user_id=v_user_id
  order by created_at asc
  limit 1;

  if v_company_id is null then raise exception 'Nenhuma empresa encontrada.'; end if;
  if v_role not in ('owner','admin','employee') then raise exception 'Acesso negado.'; end if;
  if p_service_id is null or p_starts_at is null then raise exception 'Informe serviço e início do atendimento.'; end if;

  select * into v_service from public.services where id=p_service_id and company_id=v_company_id and status='active';
  if v_service is null then raise exception 'Serviço ativo não encontrado.'; end if;

  if p_customer_id is not null and not exists (select 1 from public.customers where id=p_customer_id and company_id=v_company_id) then
    raise exception 'Cliente inválido para esta empresa.';
  end if;

  if p_professional_id is not null then
    select * into v_professional from public.professional_profiles
    where id=p_professional_id and company_id=v_company_id and active=true;
    if v_professional is null then raise exception 'Profissional inválido ou inativo.'; end if;
    if not exists (
      select 1 from public.professional_services ps
      where ps.professional_id=p_professional_id and ps.service_id=p_service_id
    ) then
      raise exception 'Este profissional não está habilitado para o serviço selecionado.';
    end if;
  end if;

  v_duration := coalesce(
    p_duration_minutes,
    (select ps.duration_override_minutes from public.professional_services ps where ps.professional_id=p_professional_id and ps.service_id=p_service_id),
    v_service.duration_minutes
  );

  if v_duration is null or v_duration <= 0 then raise exception 'O serviço precisa ter duração válida.'; end if;

  v_price := round(coalesce(
    p_price,
    (select ps.price_override from public.professional_services ps where ps.professional_id=p_professional_id and ps.service_id=p_service_id),
    v_service.sale_price
  ),2);

  v_ends_at := p_starts_at + make_interval(mins => v_duration);

  if p_professional_id is not null then
    perform pg_advisory_xact_lock(hashtextextended(p_professional_id::text, 0));

    if exists (
      select 1 from public.appointments a
      where a.company_id=v_company_id
        and a.professional_id=p_professional_id
        and a.status in ('scheduled','confirmed')
        and p_starts_at < a.ends_at
        and v_ends_at > a.starts_at
    ) then
      raise exception 'Profissional já possui agendamento neste horário.';
    end if;

    if exists (
      select 1 from public.professional_blocks b
      where b.company_id=v_company_id
        and b.professional_id=p_professional_id
        and p_starts_at < b.ends_at
        and v_ends_at > b.starts_at
    ) then
      raise exception 'O profissional possui um bloqueio neste horário.';
    end if;

    v_weekday := extract(dow from (p_starts_at at time zone 'America/Sao_Paulo'))::smallint;

    select exists(
      select 1 from public.professional_availability pa
      where pa.professional_id=p_professional_id and pa.weekday=v_weekday and pa.active=true
    ) into v_has_availability;

    if v_has_availability and not exists (
      select 1 from public.professional_availability pa
      where pa.professional_id=p_professional_id
        and pa.weekday=v_weekday
        and pa.active=true
        and (p_starts_at at time zone 'America/Sao_Paulo')::time >= pa.start_time
        and (v_ends_at at time zone 'America/Sao_Paulo')::time <= pa.end_time
    ) then
      raise exception 'Horário fora da disponibilidade do profissional.';
    end if;
  end if;

  insert into public.appointments(
    company_id,customer_id,service_id,professional_id,
    starts_at,ends_at,duration_minutes,price,status,notes,created_by
  )
  values(
    v_company_id,p_customer_id,p_service_id,p_professional_id,
    p_starts_at,v_ends_at,v_duration,v_price,'scheduled',nullif(trim(p_notes),''),v_user_id
  )
  returning * into v_appointment;

  return v_appointment;
end;
$$;

create or replace function public.reschedule_appointment(p_appointment_id uuid,p_starts_at timestamptz)
returns public.appointments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid:=auth.uid();
  v_company_id uuid;
  v_role public.company_role;
  v_appointment public.appointments;
  v_ends_at timestamptz;
begin
  select company_id,role into v_company_id,v_role from public.company_members
  where user_id=v_user_id order by created_at asc limit 1;

  if v_company_id is null then raise exception 'Nenhuma empresa encontrada.'; end if;
  if v_role not in ('owner','admin','employee') then raise exception 'Acesso negado.'; end if;

  select * into v_appointment from public.appointments
  where id=p_appointment_id and company_id=v_company_id for update;

  if v_appointment is null then raise exception 'Agendamento não encontrado.'; end if;
  if v_appointment.status in ('completed','cancelled','no_show') then raise exception 'Este agendamento não pode ser reagendado.'; end if;

  v_ends_at := p_starts_at + make_interval(mins => v_appointment.duration_minutes);

  if v_appointment.professional_id is not null then
    perform pg_advisory_xact_lock(hashtextextended(v_appointment.professional_id::text, 0));

    if exists (
      select 1 from public.appointments a
      where a.id<>v_appointment.id
        and a.company_id=v_company_id
        and a.professional_id=v_appointment.professional_id
        and a.status in ('scheduled','confirmed')
        and p_starts_at < a.ends_at
        and v_ends_at > a.starts_at
    ) then
      raise exception 'Profissional já possui agendamento neste horário.';
    end if;

    if exists (
      select 1 from public.professional_blocks b
      where b.company_id=v_company_id
        and b.professional_id=v_appointment.professional_id
        and p_starts_at < b.ends_at
        and v_ends_at > b.starts_at
    ) then
      raise exception 'O profissional possui um bloqueio neste horário.';
    end if;
  end if;

  update public.appointments set starts_at=p_starts_at, ends_at=v_ends_at
  where id=v_appointment.id returning * into v_appointment;

  return v_appointment;
end;
$$;

create or replace function public.set_appointment_status(
  p_appointment_id uuid,
  p_status public.appointment_status,
  p_reason text default null
)
returns public.appointments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_role public.company_role;
  v_row public.appointments;
begin
  select company_id,role into v_company_id,v_role
  from public.company_members where user_id=auth.uid() order by created_at asc limit 1;

  if v_company_id is null then raise exception 'Nenhuma empresa encontrada.'; end if;
  if v_role not in ('owner','admin','employee') then raise exception 'Acesso negado.'; end if;

  select * into v_row from public.appointments
  where id=p_appointment_id and company_id=v_company_id for update;

  if v_row is null then raise exception 'Agendamento não encontrado.'; end if;

  update public.appointments
  set status=p_status,
      cancellation_reason=case when p_status='cancelled' then nullif(trim(p_reason),'') else null end
  where id=v_row.id
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.seed_professional_profile_from_member() from public, authenticated, anon;
revoke all on function public.touch_phase4_rows() from public, authenticated, anon;

revoke all on function public.list_company_team() from public, anon;
grant execute on function public.list_company_team() to authenticated;

revoke all on function public.add_existing_company_member(text,public.company_role) from public, anon;
grant execute on function public.add_existing_company_member(text,public.company_role) to authenticated;

revoke all on function public.update_company_member_role(uuid,public.company_role) from public, anon;
grant execute on function public.update_company_member_role(uuid,public.company_role) to authenticated;

revoke all on function public.remove_company_member(uuid) from public, anon;
grant execute on function public.remove_company_member(uuid) to authenticated;

revoke all on function public.upsert_professional_profile(uuid,text,text,text,text,text,boolean) from public, anon;
grant execute on function public.upsert_professional_profile(uuid,text,text,text,text,text,boolean) to authenticated;

revoke all on function public.set_professional_services(uuid,jsonb) from public, anon;
grant execute on function public.set_professional_services(uuid,jsonb) to authenticated;

revoke all on function public.set_professional_availability(uuid,jsonb) from public, anon;
grant execute on function public.set_professional_availability(uuid,jsonb) to authenticated;

revoke all on function public.create_professional_block(uuid,timestamptz,timestamptz,text) from public, anon;
grant execute on function public.create_professional_block(uuid,timestamptz,timestamptz,text) to authenticated;

revoke all on function public.delete_professional_block(uuid) from public, anon;
grant execute on function public.delete_professional_block(uuid) to authenticated;

revoke all on function public.create_appointment(uuid,uuid,uuid,timestamptz,integer,numeric,text) from public, anon;
grant execute on function public.create_appointment(uuid,uuid,uuid,timestamptz,integer,numeric,text) to authenticated;

revoke all on function public.reschedule_appointment(uuid,timestamptz) from public, anon;
grant execute on function public.reschedule_appointment(uuid,timestamptz) to authenticated;

revoke all on function public.set_appointment_status(uuid,public.appointment_status,text) from public, anon;
grant execute on function public.set_appointment_status(uuid,public.appointment_status,text) to authenticated;
