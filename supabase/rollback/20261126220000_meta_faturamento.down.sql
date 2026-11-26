-- Remove a meta mensal. APAGA as metas já definidas (o histórico em audit_logs permanece). Voltar junto a versão
-- anterior do site, que não usa a tabela.
begin;
drop function if exists public.set_revenue_goal(uuid, numeric);
drop table if exists public.company_revenue_goals;
commit;
