-- ROLLBACK de 20261012000200_admin_company_members_and_reconciliation.sql (gerado por build-down-20261012.mjs).
-- Não apaga linhas de auditoria já gravadas. Executar como postgres, nesta ordem: 000200 -> 000100 -> 000000.
begin;
drop function if exists public.admin_add_company_member(uuid, text, public.company_role, text, uuid);
drop function if exists public.admin_set_company_member_role(uuid, uuid, public.company_role, text);
drop function if exists public.admin_remove_company_member(uuid, uuid, text);
drop function if exists public.admin_transfer_company_ownership(uuid, uuid, text, uuid);
drop function if exists public.platform_reconcile_candidates(integer, integer);
drop function if exists public.admin_audit_reconciliation(integer, integer, integer, integer);
commit;
