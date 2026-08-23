-- =============================================================================
-- Migration: 007_services.sql
-- Descrição: FASE 3 (Serviços + Categorias) — catálogo de serviços do
--            Prime Ges. Puramente aditiva: nenhuma tabela existente
--            (profiles, companies, company_members, customers,
--            audit_logs, customer_raffles, customer_raffle_entries,
--            products, product_categories) é alterada, e nenhuma
--            migration já aplicada é reexecutada.
--
-- Tabelas novas:
--   - service_categories: categorias de serviços, por empresa.
--   - services: catálogo de serviços, com categoria opcional, preço de
--     custo/venda e duração. Apenas o catálogo — nenhuma tabela de
--     execução (service_orders), agenda, pagamento, comissão ou relação
--     com produto/cliente é criada nesta fase.
--
-- Reaproveita as funções já criadas em migrations anteriores, sem
-- duplicar lógica:
--   - public.set_updated_at() (migration 001)
--   - public.protect_company_id() (migration 006)
--
-- Margem (valor e percentual) não é armazenada — sempre calculada em
-- código a partir de cost_price/sale_price, mesma fórmula do módulo
-- Produtos.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Enum
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'service_status') then
    create type public.service_status as enum ('active', 'inactive');
  end if;
end
$$;

-- -----------------------------------------------------------------------------
-- 2. Tabela service_categories
-- -----------------------------------------------------------------------------
create table if not exists public.service_categories (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null,
  description text,
  status public.service_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint service_categories_name_length check (char_length(name) between 1 and 120)
);

comment on table public.service_categories is
  'Categorias de serviços, por empresa. Duas empresas podem ter categorias com o mesmo nome (registros independentes) — sem unicidade global de propósito.';

create index if not exists service_categories_company_id_idx on public.service_categories (company_id);
create index if not exists service_categories_name_idx on public.service_categories (name);

drop trigger if exists service_categories_set_updated_at on public.service_categories;
create trigger service_categories_set_updated_at
  before update on public.service_categories
  for each row
  execute function public.set_updated_at();

drop trigger if exists service_categories_protect_company_id on public.service_categories;
create trigger service_categories_protect_company_id
  before update on public.service_categories
  for each row
  execute function public.protect_company_id();

-- -----------------------------------------------------------------------------
-- 3. Tabela services (catálogo — sem OS, agenda, pagamento ou comissão)
-- -----------------------------------------------------------------------------
create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  -- ON DELETE RESTRICT: mesmo princípio de products.category_id — impede
  -- apagar uma categoria que ainda tenha serviços vinculados.
  category_id uuid references public.service_categories (id) on delete restrict,
  name text not null,
  description text,
  -- "Custo estimado" (não custo real/contabilizado) — deixado claro na UI.
  cost_price numeric(12, 2) not null default 0,
  sale_price numeric(12, 2) not null default 0,
  duration_minutes integer not null default 0,
  status public.service_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint services_name_length check (char_length(name) between 1 and 160),
  constraint services_cost_price_non_negative check (cost_price >= 0),
  constraint services_sale_price_non_negative check (sale_price >= 0),
  constraint services_duration_non_negative check (duration_minutes >= 0)
);

comment on table public.services is
  'Catálogo de serviços de uma empresa. Definição de catálogo apenas — execução (quem recebeu o serviço, quando) será registrada em service_orders/vendas numa fase futura, não aqui. Exclusão é lógica (status = inactive).';

create index if not exists services_company_id_idx on public.services (company_id);
create index if not exists services_category_id_idx on public.services (category_id);
create index if not exists services_name_idx on public.services (name);
create index if not exists services_status_idx on public.services (status);
create index if not exists services_company_status_idx on public.services (company_id, status);
create index if not exists services_company_created_at_idx on public.services (company_id, created_at desc);

drop trigger if exists services_set_updated_at on public.services;
create trigger services_set_updated_at
  before update on public.services
  for each row
  execute function public.set_updated_at();

drop trigger if exists services_protect_company_id on public.services;
create trigger services_protect_company_id
  before update on public.services
  for each row
  execute function public.protect_company_id();

-- -----------------------------------------------------------------------------
-- 4. Row Level Security
-- -----------------------------------------------------------------------------
alter table public.service_categories enable row level security;
alter table public.services enable row level security;

-- service_categories: mesmo padrão de product_categories. Sem policy de
-- DELETE (exclusão física não é necessária — inativação via UPDATE).
drop policy if exists "service_categories_select_own_company" on public.service_categories;
create policy "service_categories_select_own_company"
  on public.service_categories
  for select
  to authenticated
  using (
    company_id in (
      select cm.company_id from public.company_members cm where cm.user_id = auth.uid()
    )
  );

drop policy if exists "service_categories_insert_own_company" on public.service_categories;
create policy "service_categories_insert_own_company"
  on public.service_categories
  for insert
  to authenticated
  with check (
    company_id in (
      select cm.company_id from public.company_members cm where cm.user_id = auth.uid()
    )
  );

drop policy if exists "service_categories_update_own_company" on public.service_categories;
create policy "service_categories_update_own_company"
  on public.service_categories
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

-- services: mesmo padrão. Sem policy de DELETE.
drop policy if exists "services_select_own_company" on public.services;
create policy "services_select_own_company"
  on public.services
  for select
  to authenticated
  using (
    company_id in (
      select cm.company_id from public.company_members cm where cm.user_id = auth.uid()
    )
  );

drop policy if exists "services_insert_own_company" on public.services;
create policy "services_insert_own_company"
  on public.services
  for insert
  to authenticated
  with check (
    company_id in (
      select cm.company_id from public.company_members cm where cm.user_id = auth.uid()
    )
  );

drop policy if exists "services_update_own_company" on public.services;
create policy "services_update_own_company"
  on public.services
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
