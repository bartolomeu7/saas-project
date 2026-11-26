-- Remove a função da aba Vendas dos relatórios. Voltar junto a versão anterior do site, que não a usa.
begin;
drop function if exists public.report_sales(uuid, timestamptz, timestamptz, uuid, boolean, uuid, text);
commit;
