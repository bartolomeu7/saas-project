-- Rollback de 20261115110000_company_holidays (apaga a tabela de feriados da empresa e os dados dela).
begin;
drop table if exists public.company_holidays;
commit;
