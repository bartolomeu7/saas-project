-- Remove a função de resumo dos relatórios. Voltar junto a versão anterior do site, que não a usa.
begin;
drop function if exists public.report_summary(uuid, timestamptz, timestamptz, timestamptz);
commit;
