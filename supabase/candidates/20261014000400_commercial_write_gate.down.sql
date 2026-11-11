-- =============================================================================
-- *** CANDIDATA NÃO APLICADA — REQUER REVISÃO E AUTORIZAÇÃO *** ROLLBACK de 20261014000400_commercial_write_gate.sql
-- Remove somente os objetos criados pela migration: os gatilhos `a0_commercial_write_gate` e as 3 funções auxiliares.
-- NÃO toca dados de negócio, políticas, privilégios de tabela, `platform_settings` nem `platform_setting_definitions()`
-- (a migration não os altera). Estado resultante = estado anterior ao gate (sem gate no banco; só o bloqueio HTTP do middleware).
-- Idempotente. Para conferir o retorno ao estado anterior, comparar a impressão digital oficial (tests/sql/catalog-fingerprint.sql) antes e depois.
-- =============================================================================
begin;

do $$
declare
  r record;
begin
  for r in
    select c.relname
      from pg_catalog.pg_trigger g
      join pg_catalog.pg_class c on c.oid = g.tgrelid
     where g.tgname = 'a0_commercial_write_gate' and not g.tgisinternal and c.relnamespace = 'public'::regnamespace
  loop
    execute format('drop trigger a0_commercial_write_gate on public.%I', r.relname);
  end loop;
end $$;

drop function if exists public.enforce_company_write_access();
drop function if exists public.company_write_allowed(uuid);
drop function if exists public.commercial_gate_is_user_context();

do $$
begin
  if exists (select 1 from pg_catalog.pg_trigger where tgname = 'a0_commercial_write_gate' and not tgisinternal)
     or exists (select 1 from pg_catalog.pg_proc p
                 where p.pronamespace = 'public'::regnamespace
                   and p.proname in ('enforce_company_write_access','company_write_allowed','commercial_gate_is_user_context')) then
    raise exception 'down do gate comercial: objetos remanescentes';
  end if;
end $$;

commit;
