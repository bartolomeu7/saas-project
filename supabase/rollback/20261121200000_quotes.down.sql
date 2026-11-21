-- Reverte 20261121200000_quotes.sql: remove as funções e as tabelas de orçamento.
-- ATENÇÃO: apaga TODOS os orçamentos já criados (e o histórico e a numeração). Faça um backup antes se alguma empresa já usa.
begin;

drop function if exists public.duplicate_quote(uuid);
drop function if exists public.delete_quote(uuid);
drop function if exists public.set_quote_status(uuid, text, text);
drop function if exists public.update_quote(uuid, uuid, text, text, text, text, text, text, date, date, text, text, text, text, jsonb, numeric);
drop function if exists public.create_quote(uuid, text, text, text, text, text, text, date, date, text, text, text, text, jsonb, numeric);
drop function if exists public._quote_save(uuid, uuid, uuid, uuid, text, text, text, text, text, text, date, date, text, text, text, text, jsonb, numeric);
drop function if exists public._quote_defaults(uuid);
drop function if exists public._quote_next_number(uuid, integer);
drop function if exists public._quote_build_items(uuid, jsonb);
drop function if exists public._quote_num(text);
drop function if exists public._company_member();

drop table if exists public.quote_events;
drop table if exists public.quote_items;
drop table if exists public.quotes;
drop table if exists public.quote_counters;

notify pgrst, 'reload schema';

commit;
