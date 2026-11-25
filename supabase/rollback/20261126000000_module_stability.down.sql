-- Volta 20261126000000_module_stability. ATENÇÃO: apaga o CONTEÚDO dos anexos enviados depois da publicação
-- (os registros em customer_documents ficam sem arquivo). Pontos já expirados não voltam.
begin;
drop function if exists public.run_daily_maintenance();
drop table if exists public.daily_maintenance;
drop table if exists public.customer_document_files;
commit;
