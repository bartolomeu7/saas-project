-- Reverte 20261121000000_maintenance_windows.sql: remove as funções e a tabela de janelas de manutenção.
-- (Se houver uma janela ativa, encerre-a antes: sem a tabela o site volta a depender só do interruptor MAINTENANCE_MODE.)
begin;

drop function if exists public.get_maintenance_public();
drop function if exists public.schedule_maintenance(text, text, text, timestamptz, timestamptz, integer, text, text);
drop function if exists public.update_maintenance(uuid, text, text, text, timestamptz, timestamptz, integer, text, text);
drop function if exists public.start_maintenance_now(text, text, text, integer, text, uuid);
drop function if exists public.extend_maintenance(uuid, integer);
drop function if exists public.end_maintenance(uuid);
drop function if exists public.cancel_maintenance(uuid, text);
drop function if exists public.list_maintenance_windows(integer);
drop function if exists public._maintenance_validate(text, text, text, timestamptz, timestamptz, integer, text, uuid, boolean);
drop table if exists public.maintenance_windows;

notify pgrst, 'reload schema';

commit;
