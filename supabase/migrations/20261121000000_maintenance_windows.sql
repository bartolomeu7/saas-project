-- Manutenção programada (aviso no app, modo somente leitura e tela de bloqueio) controlada pelo painel admin.
--
-- Janela de manutenção = quando, quanto tempo, o que dizer ao cliente e em que nível:
--   notice     só aviso (o cliente continua trabalhando)
--   read_only  consulta liberada, gravações bloqueadas
--   blocked    tela de manutenção no lugar do sistema
-- Ciclo: scheduled -> active -> completed (ou scheduled -> cancelled). Só UMA janela ativa por vez.
-- A entrada no horário marcado é automática (ativação preguiçosa dentro de get_maintenance_public(), que o site consulta);
-- a saída é manual (end_maintenance) para ninguém voltar ao sistema antes de o dono confirmar que terminou.
--
-- Todas as operações de escrita são RPCs SECURITY DEFINER só para super_admin, com auditoria. A tabela não tem acesso direto.
-- get_maintenance_public() devolve só o que o cliente precisa ver (nunca a nota interna) e é a única função aberta a anon.
-- Reversão: supabase/rollback/20261121000000_maintenance_windows.down.sql
begin;

create table if not exists public.maintenance_windows (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 3 and 120),
  message text not null check (char_length(btrim(message)) between 3 and 1000),
  level text not null check (level in ('notice', 'read_only', 'blocked')),
  starts_at timestamptz not null,
  expected_end_at timestamptz not null,
  announce_hours_before integer not null default 48 check (announce_hours_before between 1 and 336),
  contact_text text check (contact_text is null or char_length(contact_text) <= 200),
  internal_note text check (internal_note is null or char_length(internal_note) <= 1000),
  status text not null default 'scheduled' check (status in ('scheduled', 'active', 'completed', 'cancelled')),
  started_at timestamptz,
  ended_at timestamptz,
  cancel_reason text check (cancel_reason is null or char_length(cancel_reason) <= 300),
  created_by uuid references public.profiles(user_id) on delete set null,
  updated_by uuid references public.profiles(user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint maintenance_windows_range check (expected_end_at > starts_at),
  constraint maintenance_windows_max_span check (expected_end_at - starts_at <= interval '48 hours')
);

-- uma única janela ativa por vez
create unique index if not exists maintenance_windows_one_active on public.maintenance_windows ((true)) where status = 'active';
create index if not exists maintenance_windows_status_starts_idx on public.maintenance_windows (status, starts_at);

alter table public.maintenance_windows enable row level security;
revoke all on table public.maintenance_windows from public, anon, authenticated;

-- ------------------------------------------------------------------ leitura pública (site e aviso do app)
create or replace function public.get_maintenance_public()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_active public.maintenance_windows;
  v_next public.maintenance_windows;
begin
  -- janela agendada que passou do fim sem nunca começar: expira (não entra em vigor atrasada)
  update public.maintenance_windows
     set status = 'cancelled', cancel_reason = 'Expirou sem ser iniciada.', updated_at = now()
   where status = 'scheduled' and expected_end_at <= now();

  -- ativação preguiçosa: a janela agendada cujo horário chegou entra em vigor (se não há outra ativa)
  if not exists (select 1 from public.maintenance_windows where status = 'active') then
    update public.maintenance_windows
       set status = 'active', started_at = now(), updated_at = now()
     where id = (
       select id from public.maintenance_windows
        where status = 'scheduled' and starts_at <= now()
        order by starts_at
        limit 1
     );
  end if;

  select * into v_active from public.maintenance_windows where status = 'active' limit 1;

  select * into v_next
    from public.maintenance_windows
   where status = 'scheduled'
     and starts_at > now()
     and starts_at - make_interval(hours => announce_hours_before) <= now()
   order by starts_at
   limit 1;

  return jsonb_build_object(
    'server_now', now(),
    'active', case when v_active.id is null then null else jsonb_build_object(
      'id', v_active.id, 'title', v_active.title, 'message', v_active.message, 'level', v_active.level,
      'starts_at', v_active.starts_at, 'expected_end_at', v_active.expected_end_at, 'started_at', v_active.started_at,
      'contact_text', v_active.contact_text) end,
    'upcoming', case when v_next.id is null then null else jsonb_build_object(
      'id', v_next.id, 'title', v_next.title, 'message', v_next.message, 'level', v_next.level,
      'starts_at', v_next.starts_at, 'expected_end_at', v_next.expected_end_at,
      'contact_text', v_next.contact_text) end
  );
end;
$function$;

-- ------------------------------------------------------------------ validação comum (interna)
create or replace function public._maintenance_validate(
  p_title text, p_message text, p_level text, p_starts_at timestamptz, p_end timestamptz,
  p_announce integer, p_contact text, p_ignore_id uuid, p_allow_past_start boolean
) returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_conflict public.maintenance_windows;
begin
  if nullif(btrim(coalesce(p_title, '')), '') is null or char_length(btrim(p_title)) < 3 or char_length(btrim(p_title)) > 120 then
    raise exception 'Informe um título de 3 a 120 caracteres.';
  end if;
  if nullif(btrim(coalesce(p_message, '')), '') is null or char_length(btrim(p_message)) < 3 or char_length(btrim(p_message)) > 1000 then
    raise exception 'Informe a mensagem para o cliente (3 a 1000 caracteres).';
  end if;
  if p_level is null or p_level not in ('notice', 'read_only', 'blocked') then
    raise exception 'Nível de manutenção inválido.';
  end if;
  if p_starts_at is null or p_end is null then
    raise exception 'Informe o início e a previsão de término.';
  end if;
  if not p_allow_past_start and p_starts_at < now() - interval '1 minute' then
    raise exception 'O início não pode ser no passado.';
  end if;
  if p_end <= p_starts_at then
    raise exception 'A previsão de término deve ser depois do início.';
  end if;
  if p_end - p_starts_at > interval '24 hours' then
    raise exception 'Uma manutenção pode ter no máximo 24 horas. Para mais, agende outra.';
  end if;
  if p_announce is null or p_announce < 1 or p_announce > 336 then
    raise exception 'O aviso antecipado deve ser de 1 a 336 horas.';
  end if;
  if p_contact is not null and char_length(p_contact) > 200 then
    raise exception 'O contato pode ter no máximo 200 caracteres.';
  end if;

  select * into v_conflict
    from public.maintenance_windows w
   where w.status in ('scheduled', 'active')
     and (p_ignore_id is null or w.id <> p_ignore_id)
     and tstzrange(w.starts_at, w.expected_end_at) && tstzrange(p_starts_at, p_end)
   limit 1;
  if v_conflict.id is not null then
    raise exception 'Já existe uma manutenção neste período ("%").', left(v_conflict.title, 60);
  end if;
end;
$function$;

-- ------------------------------------------------------------------ painel admin (super_admin)
create or replace function public.schedule_maintenance(
  p_title text, p_message text, p_level text, p_starts_at timestamptz, p_expected_end_at timestamptz,
  p_announce_hours integer default 48, p_contact text default null, p_internal_note text default null
) returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_id uuid;
begin
  if not public.is_super_admin() then raise exception 'not authorized'; end if;
  perform public._maintenance_validate(p_title, p_message, p_level, p_starts_at, p_expected_end_at, p_announce_hours, nullif(btrim(coalesce(p_contact, '')), ''), null, false);

  insert into public.maintenance_windows (title, message, level, starts_at, expected_end_at, announce_hours_before, contact_text, internal_note, created_by, updated_by)
  values (btrim(p_title), btrim(p_message), p_level, p_starts_at, p_expected_end_at, p_announce_hours,
          nullif(btrim(coalesce(p_contact, '')), ''), nullif(btrim(coalesce(p_internal_note, '')), ''),
          public.current_profile_user_id(), public.current_profile_user_id())
  returning id into v_id;

  perform public.write_platform_audit_log('platform.maintenance.scheduled', 'maintenance_window', v_id, null, null,
    jsonb_build_object('level', p_level, 'starts_at', p_starts_at, 'expected_end_at', p_expected_end_at));
  return v_id;
end;
$function$;

create or replace function public.update_maintenance(
  p_id uuid, p_title text, p_message text, p_level text, p_starts_at timestamptz, p_expected_end_at timestamptz,
  p_announce_hours integer default 48, p_contact text default null, p_internal_note text default null
) returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_row public.maintenance_windows;
begin
  if not public.is_super_admin() then raise exception 'not authorized'; end if;
  select * into v_row from public.maintenance_windows where id = p_id for update;
  if v_row.id is null then raise exception 'Manutenção não encontrada.'; end if;
  if v_row.status <> 'scheduled' then raise exception 'Só dá para editar uma manutenção ainda agendada.'; end if;
  perform public._maintenance_validate(p_title, p_message, p_level, p_starts_at, p_expected_end_at, p_announce_hours, nullif(btrim(coalesce(p_contact, '')), ''), p_id, false);

  update public.maintenance_windows
     set title = btrim(p_title), message = btrim(p_message), level = p_level, starts_at = p_starts_at,
         expected_end_at = p_expected_end_at, announce_hours_before = p_announce_hours,
         contact_text = nullif(btrim(coalesce(p_contact, '')), ''), internal_note = nullif(btrim(coalesce(p_internal_note, '')), ''),
         updated_by = public.current_profile_user_id(), updated_at = now()
   where id = p_id;

  perform public.write_platform_audit_log('platform.maintenance.updated', 'maintenance_window', p_id, null, null,
    jsonb_build_object('level', p_level, 'starts_at', p_starts_at, 'expected_end_at', p_expected_end_at));
end;
$function$;

-- Começa agora: ou inicia uma janela já agendada (p_from_id) ou cria uma nova já ativa (emergência).
create or replace function public.start_maintenance_now(
  p_title text default 'Manutenção em andamento',
  p_message text default 'Estamos fazendo uma manutenção no Prime Ges. Seus dados estão seguros. Voltamos já.',
  p_level text default 'blocked',
  p_expected_minutes integer default 30,
  p_contact text default null,
  p_from_id uuid default null
) returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_row public.maintenance_windows;
  v_id uuid;
  v_end timestamptz;
begin
  if not public.is_super_admin() then raise exception 'not authorized'; end if;
  if exists (select 1 from public.maintenance_windows where status = 'active') then
    raise exception 'Já existe uma manutenção em andamento. Encerre-a antes de iniciar outra.';
  end if;

  if p_from_id is not null then
    select * into v_row from public.maintenance_windows where id = p_from_id for update;
    if v_row.id is null then raise exception 'Manutenção não encontrada.'; end if;
    if v_row.status <> 'scheduled' then raise exception 'Só dá para iniciar uma manutenção agendada.'; end if;
    -- mantém a duração prevista a partir de agora
    v_end := now() + (v_row.expected_end_at - v_row.starts_at);
    update public.maintenance_windows
       set status = 'active', started_at = now(), starts_at = now(), expected_end_at = v_end,
           updated_by = public.current_profile_user_id(), updated_at = now()
     where id = p_from_id;
    v_id := p_from_id;
  else
    if p_expected_minutes is null or p_expected_minutes < 5 or p_expected_minutes > 24 * 60 then
      raise exception 'A duração prevista deve ser de 5 minutos a 24 horas.';
    end if;
    v_end := now() + make_interval(mins => p_expected_minutes);
    perform public._maintenance_validate(p_title, p_message, p_level, now(), v_end, 1, nullif(btrim(coalesce(p_contact, '')), ''), null, true);
    insert into public.maintenance_windows (title, message, level, starts_at, expected_end_at, announce_hours_before, contact_text,
                                            status, started_at, created_by, updated_by)
    values (btrim(p_title), btrim(p_message), p_level, now(), v_end, 1, nullif(btrim(coalesce(p_contact, '')), ''),
            'active', now(), public.current_profile_user_id(), public.current_profile_user_id())
    returning id into v_id;
  end if;

  perform public.write_platform_audit_log('platform.maintenance.started', 'maintenance_window', v_id, null, null,
    jsonb_build_object('from_schedule', p_from_id is not null, 'expected_end_at', v_end));
  return v_id;
end;
$function$;

create or replace function public.extend_maintenance(p_id uuid, p_minutes integer)
returns timestamptz
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_row public.maintenance_windows;
  v_end timestamptz;
begin
  if not public.is_super_admin() then raise exception 'not authorized'; end if;
  if p_minutes is null or p_minutes < 5 or p_minutes > 480 then
    raise exception 'A extensão deve ser de 5 minutos a 8 horas.';
  end if;
  select * into v_row from public.maintenance_windows where id = p_id for update;
  if v_row.id is null then raise exception 'Manutenção não encontrada.'; end if;
  if v_row.status <> 'active' then raise exception 'Só dá para estender uma manutenção em andamento.'; end if;
  -- se o prazo já passou, a extensão conta a partir de agora
  v_end := greatest(v_row.expected_end_at, now()) + make_interval(mins => p_minutes);
  if v_end - v_row.starts_at > interval '48 hours' then
    raise exception 'A manutenção não pode passar de 48 horas no total.';
  end if;
  update public.maintenance_windows
     set expected_end_at = v_end, updated_by = public.current_profile_user_id(), updated_at = now()
   where id = p_id;
  perform public.write_platform_audit_log('platform.maintenance.extended', 'maintenance_window', p_id, null, null,
    jsonb_build_object('minutes', p_minutes, 'expected_end_at', v_end));
  return v_end;
end;
$function$;

create or replace function public.end_maintenance(p_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_row public.maintenance_windows;
begin
  if not public.is_super_admin() then raise exception 'not authorized'; end if;
  select * into v_row from public.maintenance_windows where id = p_id for update;
  if v_row.id is null then raise exception 'Manutenção não encontrada.'; end if;
  if v_row.status <> 'active' then raise exception 'Esta manutenção não está em andamento.'; end if;
  update public.maintenance_windows
     set status = 'completed', ended_at = now(), updated_by = public.current_profile_user_id(), updated_at = now()
   where id = p_id;
  perform public.write_platform_audit_log('platform.maintenance.ended', 'maintenance_window', p_id, null, null,
    jsonb_build_object('minutes_active', round(extract(epoch from (now() - coalesce(v_row.started_at, v_row.starts_at))) / 60)));
end;
$function$;

create or replace function public.cancel_maintenance(p_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_row public.maintenance_windows;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if not public.is_super_admin() then raise exception 'not authorized'; end if;
  if v_reason is not null and char_length(v_reason) > 300 then raise exception 'O motivo pode ter no máximo 300 caracteres.'; end if;
  select * into v_row from public.maintenance_windows where id = p_id for update;
  if v_row.id is null then raise exception 'Manutenção não encontrada.'; end if;
  if v_row.status <> 'scheduled' then raise exception 'Só dá para cancelar uma manutenção agendada (a em andamento se encerra).'; end if;
  update public.maintenance_windows
     set status = 'cancelled', cancel_reason = coalesce(v_reason, 'Cancelada pelo administrador.'),
         updated_by = public.current_profile_user_id(), updated_at = now()
   where id = p_id;
  perform public.write_platform_audit_log('platform.maintenance.cancelled', 'maintenance_window', p_id, null, null,
    jsonb_build_object('reason', v_reason));
end;
$function$;

create or replace function public.list_maintenance_windows(p_limit integer default 30)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not public.is_super_admin() then raise exception 'not authorized'; end if;
  return coalesce((
    select jsonb_agg(row_to_json(t)::jsonb order by t.sort_key desc)
    from (
      select w.id, w.title, w.message, w.level, w.status, w.starts_at, w.expected_end_at, w.announce_hours_before,
             w.contact_text, w.internal_note, w.started_at, w.ended_at, w.cancel_reason, w.created_at,
             p.full_name as created_by_name,
             case when w.status in ('scheduled', 'active') then 1 else 0 end * 1000000000000 + extract(epoch from w.starts_at)::bigint as sort_key
        from public.maintenance_windows w
        left join public.profiles p on p.user_id = w.created_by
       order by sort_key desc
       limit greatest(1, least(coalesce(p_limit, 30), 100))
    ) t
  ), '[]'::jsonb);
end;
$function$;

-- ------------------------------------------------------------------ permissões
revoke all on function public.get_maintenance_public() from public;
revoke all on function public._maintenance_validate(text, text, text, timestamptz, timestamptz, integer, text, uuid, boolean) from public, anon, authenticated;
revoke all on function public.schedule_maintenance(text, text, text, timestamptz, timestamptz, integer, text, text) from public, anon;
revoke all on function public.update_maintenance(uuid, text, text, text, timestamptz, timestamptz, integer, text, text) from public, anon;
revoke all on function public.start_maintenance_now(text, text, text, integer, text, uuid) from public, anon;
revoke all on function public.extend_maintenance(uuid, integer) from public, anon;
revoke all on function public.end_maintenance(uuid) from public, anon;
revoke all on function public.cancel_maintenance(uuid, text) from public, anon;
revoke all on function public.list_maintenance_windows(integer) from public, anon;

grant execute on function public.get_maintenance_public() to anon, authenticated, service_role;
grant execute on function public.schedule_maintenance(text, text, text, timestamptz, timestamptz, integer, text, text) to authenticated, service_role;
grant execute on function public.update_maintenance(uuid, text, text, text, timestamptz, timestamptz, integer, text, text) to authenticated, service_role;
grant execute on function public.start_maintenance_now(text, text, text, integer, text, uuid) to authenticated, service_role;
grant execute on function public.extend_maintenance(uuid, integer) to authenticated, service_role;
grant execute on function public.end_maintenance(uuid) to authenticated, service_role;
grant execute on function public.cancel_maintenance(uuid, text) to authenticated, service_role;
grant execute on function public.list_maintenance_windows(integer) to authenticated, service_role;

-- o PostgREST só enxerga funções novas depois de recarregar o cache de esquema
notify pgrst, 'reload schema';

commit;
