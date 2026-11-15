-- =============================================================================
-- Busca aproximada no banco: extensões pg_trgm (semelhança de texto) e unaccent (sem acento), índices e a função
-- search_products(texto) usada pelo Chat AI ("quanto tenho de cera?", leitura de código de barras). Aditiva.
-- A função roda com os direitos de QUEM CHAMA (security invoker): a segurança por empresa (RLS) continua valendo.
-- Rollback: supabase/rollback/20261115120000_search_trgm_unaccent.down.sql
-- =============================================================================
begin;

create extension if not exists pg_trgm with schema extensions;
create extension if not exists unaccent with schema extensions;

-- unaccent não é IMMUTABLE (depende de dicionário); esta versão fixa o dicionário e pode entrar em índice
create or replace function public.f_unaccent(text)
returns text
language sql
immutable
parallel safe
set search_path = public, extensions
as $$ select extensions.unaccent('extensions.unaccent'::regdictionary, $1) $$;

create index if not exists products_name_trgm_idx on public.products using gin (public.f_unaccent(lower(name)) extensions.gin_trgm_ops);
create index if not exists customers_name_trgm_idx on public.customers using gin (public.f_unaccent(lower(name)) extensions.gin_trgm_ops);
create index if not exists services_name_trgm_idx on public.services using gin (public.f_unaccent(lower(name)) extensions.gin_trgm_ops);
create index if not exists products_barcode_idx on public.products (company_id, barcode) where barcode is not null;

-- Produtos da empresa por nome aproximado, SKU ou código de barras (exato). Devolve estoque e mínimo para o chat responder.
create or replace function public.search_products(p_company_id uuid, p_query text, p_limit integer default 5)
returns table (id uuid, name text, sku text, barcode text, unit text, stock_quantity numeric, minimum_stock numeric, sale_price numeric, status text, score real)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  with q as (
    select btrim(p_query) as raw, public.f_unaccent(lower(btrim(p_query))) as norm
  )
  select p.id, p.name, p.sku, p.barcode, p.unit::text, p.stock_quantity, p.minimum_stock, p.sale_price, p.status::text,
         case
           when p.barcode = q.raw or p.sku = q.raw then 1.0::real
           else similarity(public.f_unaccent(lower(p.name)), q.norm)
         end as score
  from public.products p, q
  where p.company_id = p_company_id
    and char_length(q.raw) between 2 and 120
    and (
      p.barcode = q.raw
      or p.sku = q.raw
      or public.f_unaccent(lower(p.name)) like '%' || replace(replace(replace(q.norm, '\', '\\'), '%', '\%'), '_', '\_') || '%'
      or similarity(public.f_unaccent(lower(p.name)), q.norm) >= 0.3
    )
  order by score desc, p.name
  limit greatest(1, least(coalesce(p_limit, 5), 20));
$$;

revoke all on function public.search_products(uuid, text, integer) from public, anon;
grant execute on function public.search_products(uuid, text, integer) to authenticated, service_role;

comment on function public.search_products(uuid, text, integer) is 'Chat AI: produtos por nome aproximado/SKU/código de barras (RLS do chamador).';

commit;
