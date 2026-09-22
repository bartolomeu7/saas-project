create or replace function public.reschedule_appointment(
  p_appointment_id uuid,
  p_starts_at timestamptz
)
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
  v_weekday smallint;
  v_has_availability boolean;
begin
  select company_id,role into v_company_id,v_role
  from public.company_members
  where user_id=v_user_id
  order by created_at asc
  limit 1;

  if v_company_id is null then raise exception 'Nenhuma empresa encontrada.'; end if;
  if v_role not in ('owner','admin','employee') then raise exception 'Acesso negado.'; end if;

  select * into v_appointment
  from public.appointments
  where id=p_appointment_id and company_id=v_company_id
  for update;

  if v_appointment is null then raise exception 'Agendamento não encontrado.'; end if;
  if v_appointment.status in ('completed','cancelled','no_show') then raise exception 'Este agendamento não pode ser reagendado.'; end if;

  v_ends_at := p_starts_at + make_interval(mins => v_appointment.duration_minutes);

  if v_appointment.professional_id is not null then
    perform pg_advisory_xact_lock(hashtextextended(v_appointment.professional_id::text, 0));

    if exists (
      select 1
      from public.appointments a
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
      select 1
      from public.professional_blocks b
      where b.company_id=v_company_id
        and b.professional_id=v_appointment.professional_id
        and p_starts_at < b.ends_at
        and v_ends_at > b.starts_at
    ) then
      raise exception 'O profissional possui um bloqueio neste horário.';
    end if;

    v_weekday := extract(dow from (p_starts_at at time zone 'America/Sao_Paulo'))::smallint;

    select exists(
      select 1
      from public.professional_availability pa
      where pa.professional_id=v_appointment.professional_id
        and pa.weekday=v_weekday
        and pa.active=true
    ) into v_has_availability;

    if v_has_availability and not exists (
      select 1
      from public.professional_availability pa
      where pa.professional_id=v_appointment.professional_id
        and pa.weekday=v_weekday
        and pa.active=true
        and (p_starts_at at time zone 'America/Sao_Paulo')::time >= pa.start_time
        and (v_ends_at at time zone 'America/Sao_Paulo')::time <= pa.end_time
    ) then
      raise exception 'Horário fora da disponibilidade do profissional.';
    end if;
  end if;

  update public.appointments
  set starts_at=p_starts_at,
      ends_at=v_ends_at
  where id=v_appointment.id
  returning * into v_appointment;

  return v_appointment;
end;
$$;

revoke all on function public.reschedule_appointment(uuid,timestamptz) from public, anon;
grant execute on function public.reschedule_appointment(uuid,timestamptz) to authenticated;