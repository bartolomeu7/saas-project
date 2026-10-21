-- Rollback de 20261022000000_account_self_deletion.
-- ATENÇÃO: contas já excluídas continuam excluídas (perfis anônimos, empresas apagadas). Este rollback só remove as
-- funções. retained_billing_records é MANTIDA de propósito (guarda registros fiscais já copiados); só apague-a
-- depois de decidir, por escrito, o destino desses registros. A coluna profiles.anonymized_at também é mantida.
begin;
drop function if exists public.delete_account_data(uuid);
drop function if exists public.account_deletion_preview(uuid);
commit;
