-- =============================================================================
-- ROLLBACK de 20261014000300_data_layer_access_gate.sql
-- Remove as políticas RESTRICTIVE *_require_access_* e a função company_has_active_access(). Nenhum dado é alterado.
-- Efeito: volta ao comportamento anterior (escrita direta pela API depende só da associação à empresa).
-- =============================================================================
begin;

do $$
declare
  p record;
begin
  for p in select tablename, policyname from pg_policies
            where schemaname = 'public' and policyname like '%\_require\_access\_%'
  loop
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
  end loop;
end $$;

drop function if exists public.company_has_active_access(uuid);

commit;
