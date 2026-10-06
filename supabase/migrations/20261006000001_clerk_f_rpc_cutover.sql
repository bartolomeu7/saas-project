-- Clerk cutover, Migration F: RPCs/functions deixam de depender de auth.uid().
-- Cada função de public que usa auth.uid() é recriada a partir da PRÓPRIA
-- definição no banco (pg_get_functiondef), trocando apenas o token
-- auth.uid() por public.current_profile_user_id(). Todas as ocorrências
-- foram revisadas: são sempre "usuário atual" (checagem de nulo, vínculo em
-- company_members, created_by/actor, coalesce(auth.uid(), fallback)).
-- CREATE OR REPLACE preserva owner, grants, search_path e SECURITY DEFINER.
do $$
declare
  r record;
  n_changed int := 0;
  n_left int;
begin
  for r in
    select p.oid, p.proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      and pg_get_functiondef(p.oid) like '%auth.uid()%'
  loop
    execute replace(pg_get_functiondef(r.oid), 'auth.uid()', 'public.current_profile_user_id()');
    n_changed := n_changed + 1;
  end loop;

  select count(*) into n_left
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prokind = 'f'
    and pg_get_functiondef(p.oid) like '%auth.uid()%';

  if n_left <> 0 then
    raise exception 'Migration F incompleta: % funcoes ainda usam auth.uid()', n_left;
  end if;

  raise notice 'Migration F: % funcoes reescritas', n_changed;
end $$;
