-- =============================================================================
-- Migration 040 — corrige set_professional_availability e set_professional_services
--
-- Problema (confirmado por leitura do corpo das funções no banco live, nunca por
-- execução): ambas usavam `v_professional_id` no INSERT, uma variável que NUNCA
-- foi declarada. O parâmetro real é `p_professional_id`. Como o plpgsql resolve
-- identificadores só na execução, a migration 030 passou sem erro, mas qualquer
-- chamada com pelo menos 1 item falharia com "column v_professional_id does not
-- exist" (SQLSTATE 42703). Chamadas com lista vazia (apenas o DELETE) funcionam.
--
-- Correção: única alteração é `v_professional_id` -> `p_professional_id` no INSERT.
-- Assinatura, retorno, SECURITY DEFINER e search_path permanecem idênticos.
-- Idempotente (CREATE OR REPLACE + REVOKE/GRANT re-declarando a ACL já vigente:
-- sem EXECUTE para PUBLIC/anon, apenas authenticated e service_role).
--
-- Migration NOVA e separada: a 030 (já aplicada) não foi reescrita para "esconder"
-- o defeito; ela continua registrando o que foi aplicado historicamente.
-- =============================================================================

create or replace function public.set_professional_availability(p_professional_id uuid, p_schedule jsonb)
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

  if v_company_id is null or v_actor_role not in ('owner','admin') then
    raise exception 'Apenas owner/admin podem configurar horários.';
  end if;

  if not exists (
    select 1 from public.professional_profiles
    where id = p_professional_id and company_id = v_company_id
  ) then
    raise exception 'Profissional inválido.';
  end if;

  delete from public.professional_availability where professional_id = p_professional_id;

  for v_item in select * from jsonb_array_elements(coalesce(p_schedule, '[]'::jsonb))
  loop
    v_weekday := (v_item ->> 'weekday')::smallint;
    v_start := (v_item ->> 'start_time')::time;
    v_end := (v_item ->> 'end_time')::time;
    v_active := coalesce((v_item ->> 'active')::boolean, true);

    if v_weekday < 0 or v_weekday > 6 then raise exception 'Dia da semana inválido.'; end if;
    if v_end <= v_start then raise exception 'Horário final deve ser maior que o inicial.'; end if;

    insert into public.professional_availability(
      professional_id,weekday,start_time,end_time,active
    )
    values(p_professional_id,v_weekday,v_start,v_end,v_active);
  end loop;
end;
$$;

create or replace function public.set_professional_services(p_professional_id uuid, p_services jsonb)
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

  if v_company_id is null or v_actor_role not in ('owner','admin') then
    raise exception 'Apenas owner/admin podem configurar serviços do profissional.';
  end if;

  if not exists (
    select 1 from public.professional_profiles
    where id = p_professional_id and company_id = v_company_id
  ) then
    raise exception 'Profissional inválido.';
  end if;

  delete from public.professional_services where professional_id = p_professional_id;

  for v_item in select * from jsonb_array_elements(coalesce(p_services, '[]'::jsonb))
  loop
    v_service_id := (v_item ->> 'service_id')::uuid;
    v_duration := nullif(v_item ->> 'duration_override_minutes','')::integer;
    v_price := nullif(v_item ->> 'price_override','')::numeric;

    if not exists (
      select 1 from public.services
      where id = v_service_id and company_id = v_company_id
    ) then
      raise exception 'Serviço inválido para esta empresa.';
    end if;

    insert into public.professional_services(
      professional_id,service_id,duration_override_minutes,price_override
    )
    values(p_professional_id,v_service_id,v_duration,v_price);
  end loop;
end;
$$;

revoke all on function public.set_professional_availability(uuid, jsonb) from public, anon;
grant execute on function public.set_professional_availability(uuid, jsonb) to authenticated;

revoke all on function public.set_professional_services(uuid, jsonb) from public, anon;
grant execute on function public.set_professional_services(uuid, jsonb) to authenticated;
