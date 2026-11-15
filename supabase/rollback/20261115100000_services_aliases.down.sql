-- Rollback de 20261115100000_services_aliases (remove os apelidos de serviço; o chat segue sem apelidos).
begin;
alter table public.services drop constraint if exists services_aliases_limits;
alter table public.services drop column if exists aliases;
commit;
