-- Remove as funções das abas Clientes, Agenda e Orçamentos. Voltar junto a versão anterior do site, que não as usa.
begin;
drop function if exists public.report_customers(uuid, timestamptz, timestamptz, integer);
drop function if exists public.report_agenda(uuid, timestamptz, timestamptz);
drop function if exists public.report_quotes(uuid, date, date);
commit;
