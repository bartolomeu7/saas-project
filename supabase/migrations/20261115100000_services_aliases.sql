-- =============================================================================
-- Apelidos de serviço (Chat AI e busca): "limpeza" → "Higienização Interna".
-- Aditiva: só uma coluna com padrão vazio; nenhuma linha existente muda. O código lê a coluna de forma tolerante
-- (se ela ainda não existir, o chat segue sem apelidos).
-- Rollback: supabase/rollback/20261115100000_services_aliases.down.sql
-- =============================================================================
begin;

alter table public.services add column if not exists aliases text[] not null default '{}';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'services_aliases_limits') then
    alter table public.services
      add constraint services_aliases_limits
      check (cardinality(aliases) <= 10 and char_length(array_to_string(aliases, ',')) <= 400);
  end if;
end
$$;

comment on column public.services.aliases is 'Apelidos que a equipe usa para o serviço (até 10, 400 caracteres no total). O Chat AI entende o apelido como o nome.';

commit;
