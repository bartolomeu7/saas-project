-- Remove a comissão. APAGA os percentuais e as escolhas de profissional feitas no relatório (o histórico em
-- audit_logs permanece). Vendas, itens e agendamentos não são tocados. Voltar junto a versão anterior do site.
begin;
drop function if exists public.report_commission(uuid, timestamptz, timestamptz);
drop function if exists public.set_commission_rate(uuid, numeric, date);
drop function if exists public.set_sale_item_professional(uuid, uuid);
drop table if exists public.sale_item_professionals;
drop table if exists public.professional_commission_rates;
commit;
