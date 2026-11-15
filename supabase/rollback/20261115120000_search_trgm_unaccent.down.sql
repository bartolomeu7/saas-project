-- Rollback de 20261115120000_search_trgm_unaccent. As extensões ficam instaladas (inofensivas e podem ser usadas por outros).
begin;
drop function if exists public.search_products(uuid, text, integer);
drop index if exists public.products_name_trgm_idx;
drop index if exists public.customers_name_trgm_idx;
drop index if exists public.services_name_trgm_idx;
drop index if exists public.products_barcode_idx;
drop function if exists public.f_unaccent(text);
commit;
