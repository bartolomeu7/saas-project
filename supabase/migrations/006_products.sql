-- =============================================================================
-- Migration: 006_products.sql
-- Descrição: FASE 2 (Produtos + Categorias + Estoque básico) do sistema
--            de gestão adaptativo. Puramente aditiva: nenhuma tabela
--            existente (profiles, companies, company_members, customers,
--            audit_logs, customer_raffles, customer_raffle_entries) é
--            alterada, e nenhuma migration já aplicada é reexecutada.
--
-- Tabelas novas:
--   - product_categories: categorias de produtos, por empresa.
--   - products: catálogo de produtos, por empresa, com categoria
--     opcional, preço de custo/venda e estoque básico.
--
-- Não cria tabela de movimentação de estoque nesta fase: ajustes de
-- estoque são registrados via public.audit_logs (já existente, Fase 1),
-- com entity_type='product' e action='product_stock_adjusted' —
-- suficiente para auditoria básica sem duplicar a lógica que o módulo
-- de estoque avançado (fase futura) vai precisar de qualquer forma.
--
-- Margem (valor e percentual) não é armazenada — sempre calculada em
-- código a partir de cost_price/sale_price.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Enums
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'product_status') then
    create type public.product_status as enum ('active', 'inactive');
  end if;

  if not exists (select 1 from pg_type where typname = 'product_unit') then
    create type public.product_unit as enum (
      'un', 'kg', 'g', 'l', 'ml', 'm', 'cx', 'pct', 'kit'
    );
  end if;
end
$$;

-- -----------------------------------------------------------------------------
-- 2. Tabela product_categories
-- -----------------------------------------------------------------------------
create table if not exists public.product_categories (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null,
  description text,
  status public.product_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint product_categories_name_length check (char_length(name) between 1 and 120)
);

comment on table public.product_categories is
  'Categorias de produtos, por empresa. Duas empresas podem ter categorias com o mesmo nome (registros independentes).';

create index if not exists product_categories_company_id_idx on public.product_categories (company_id);
create index if not exists product_categories_name_idx on public.product_categories (name);

drop trigger if exists product_categories_set_updated_at on public.product_categories;
create trigger product_categories_set_updated_at
  before update on public.product_categories
  for each row
  execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 3. Tabela products
-- -----------------------------------------------------------------------------
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  -- ON DELETE RESTRICT: impede apagar uma categoria que ainda tenha
  -- produtos vinculados — a empresa precisa inativar a categoria em vez
  -- de excluí-la (não há policy de DELETE em product_categories de
  -- qualquer forma, mas a constraint protege até acesso via service_role).
  category_id uuid references public.product_categories (id) on delete restrict,
  name text not null,
  sku text,
  barcode text,
  description text,
  unit public.product_unit not null default 'un',
  cost_price numeric(12, 2) not null default 0,
  sale_price numeric(12, 2) not null default 0,
  -- numeric (não integer): unidades como kg/g/l/ml/m são fracionárias.
  stock_quantity numeric(12, 3) not null default 0,
  minimum_stock numeric(12, 3) not null default 0,
  status public.product_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint products_name_length check (char_length(name) between 1 and 160),
  constraint products_cost_price_non_negative check (cost_price >= 0),
  constraint products_sale_price_non_negative check (sale_price >= 0),
  constraint products_stock_quantity_non_negative check (stock_quantity >= 0),
  constraint products_minimum_stock_non_negative check (minimum_stock >= 0),
  -- SKU/código de barras opcionais, únicos por empresa quando
  -- preenchidos (múltiplas linhas com NULL não conflitam entre si —
  -- comportamento padrão de UNIQUE no Postgres).
  constraint products_sku_unique_per_company unique (company_id, sku),
  constraint products_barcode_unique_per_company unique (company_id, barcode)
);

comment on table public.products is
  'Catálogo de produtos de uma empresa. Exclusão nesta etapa é lógica (status = inactive), preservando histórico para quando Vendas/Estoque avançado existirem.';

create index if not exists products_company_id_idx on public.products (company_id);
create index if not exists products_category_id_idx on public.products (category_id);
create index if not exists products_name_idx on public.products (name);
create index if not exists products_status_idx on public.products (status);
create index if not exists products_company_status_idx on public.products (company_id, status);
create index if not exists products_company_created_at_idx on public.products (company_id, created_at desc);

drop trigger if exists products_set_updated_at on public.products;
create trigger products_set_updated_at
  before update on public.products
  for each row
  execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 4. Defesa em profundidade: impede alterar company_id via UPDATE
-- -----------------------------------------------------------------------------
-- Genérico de propósito (funciona em qualquer tabela com coluna
-- company_id) — reaproveitado por products e product_categories, em vez
-- de duplicar a mesma função para cada tabela nova.
create or replace function public.protect_company_id()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.role() = 'service_role' then
    return new;
  end if;

  if new.company_id is distinct from old.company_id then
    raise exception 'Não é permitido alterar a empresa (company_id) deste registro.';
  end if;

  return new;
end;
$$;

drop trigger if exists product_categories_protect_company_id on public.product_categories;
create trigger product_categories_protect_company_id
  before update on public.product_categories
  for each row
  execute function public.protect_company_id();

drop trigger if exists products_protect_company_id on public.products;
create trigger products_protect_company_id
  before update on public.products
  for each row
  execute function public.protect_company_id();

-- -----------------------------------------------------------------------------
-- 5. Row Level Security
-- -----------------------------------------------------------------------------
alter table public.product_categories enable row level security;
alter table public.products enable row level security;

-- product_categories: isolamento multi-tenant via company_members, mesmo
-- padrão de customers. Sem policy de DELETE (exclusão física não é
-- necessária nesta fase — inativação via UPDATE status='inactive').
drop policy if exists "product_categories_select_own_company" on public.product_categories;
create policy "product_categories_select_own_company"
  on public.product_categories
  for select
  to authenticated
  using (
    company_id in (
      select cm.company_id from public.company_members cm where cm.user_id = auth.uid()
    )
  );

drop policy if exists "product_categories_insert_own_company" on public.product_categories;
create policy "product_categories_insert_own_company"
  on public.product_categories
  for insert
  to authenticated
  with check (
    company_id in (
      select cm.company_id from public.company_members cm where cm.user_id = auth.uid()
    )
  );

drop policy if exists "product_categories_update_own_company" on public.product_categories;
create policy "product_categories_update_own_company"
  on public.product_categories
  for update
  to authenticated
  using (
    company_id in (
      select cm.company_id from public.company_members cm where cm.user_id = auth.uid()
    )
  )
  with check (
    company_id in (
      select cm.company_id from public.company_members cm where cm.user_id = auth.uid()
    )
  );

-- products: mesmo padrão. Sem policy de DELETE.
drop policy if exists "products_select_own_company" on public.products;
create policy "products_select_own_company"
  on public.products
  for select
  to authenticated
  using (
    company_id in (
      select cm.company_id from public.company_members cm where cm.user_id = auth.uid()
    )
  );

drop policy if exists "products_insert_own_company" on public.products;
create policy "products_insert_own_company"
  on public.products
  for insert
  to authenticated
  with check (
    company_id in (
      select cm.company_id from public.company_members cm where cm.user_id = auth.uid()
    )
  );

drop policy if exists "products_update_own_company" on public.products;
create policy "products_update_own_company"
  on public.products
  for update
  to authenticated
  using (
    company_id in (
      select cm.company_id from public.company_members cm where cm.user_id = auth.uid()
    )
  )
  with check (
    company_id in (
      select cm.company_id from public.company_members cm where cm.user_id = auth.uid()
    )
  );
