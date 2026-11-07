-- Rollback de 20261106000000_company_self_edit.
-- Só remove a função. Nomes e segmentos já alterados por ela continuam como estão; os registros em audit_logs
-- (action = 'company.updated') são mantidos de propósito (a tabela é append-only).
begin;
drop function if exists public.update_own_company(text, public.business_type);
commit;
