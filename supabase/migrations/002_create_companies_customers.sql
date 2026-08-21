-- =============================================================================
-- Migration: 002_create_companies_customers.sql
-- Descrição: introduz o modelo multi-tenant do Prime Ges — empresas
--            (companies), vínculo usuário↔empresa (company_members) e o
--            primeiro módulo de negócio (customers). Toda tabela usa RLS
--            desde a criação; isolamento entre empresas é garantido no
--            banco, nunca apenas na aplicação.
--
-- Não cria tabelas duplicadas: reaproveita public.set_updated_at(), criada
-- em 001_create_profiles.sql, para os triggers de updated_at abaixo.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Enums
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'business_type') then
    create type public.business_type as enum (
      'bakery',
      'car_wash',
      'automotive_detailing',
      'grocery',
      'restaurant',
      'snack_bar',
      'beauty_salon',
      'workshop',
      'service_provider',
      'other'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'company_status') then
    create type public.company_status as enum ('active', 'inactive');
  end if;

  if not exists (select 1 from pg_type where typname = 'company_role') then
    create type public.company_role as enum ('owner', 'admin', 'employee');
  end if;

  if not exists (select 1 from pg_type where typname = 'customer_status') then
    create type public.customer_status as enum ('active', 'inactive');
  end if;
end
$$;

-- -----------------------------------------------------------------------------
-- 2. Tabela companies
-- -----------------------------------------------------------------------------
create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  business_type public.business_type not null default 'other',
  status public.company_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint companies_name_length check (char_length(name) between 1 and 160)
);

comment on table public.companies is
  'Empresa/tenant do Prime Ges. Todo dado de negócio (clientes, produtos, vendas, etc.) é isolado por company_id.';

drop trigger if exists companies_set_updated_at on public.companies;
create trigger companies_set_updated_at
  before update on public.companies
  for each row
  execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 3. Tabela company_members (vínculo usuário ↔ empresa)
-- -----------------------------------------------------------------------------
create table if not exists public.company_members (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.company_role not null default 'employee',
  created_at timestamptz not null default now(),

  constraint company_members_unique_membership unique (company_id, user_id)
);

comment on table public.company_members is
  'Relaciona usuários (auth.users) a empresas (companies), com role. Mutações (insert/update/delete) não são expostas via RLS a clientes comuns nesta etapa — apenas através da função public.create_company_with_owner ou de rotinas administrativas futuras (service_role).';

create index if not exists company_members_company_id_idx on public.company_members (company_id);
create index if not exists company_members_user_id_idx on public.company_members (user_id);

-- -----------------------------------------------------------------------------
-- 4. Tabela customers
-- -----------------------------------------------------------------------------
create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null,
  document text,
  phone text,
  whatsapp text,
  email text,
  address text,
  address_number text,
  complement text,
  neighborhood text,
  city text,
  state text,
  postal_code text,
  notes text,
  status public.customer_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint customers_name_length check (char_length(name) between 1 and 160),
  constraint customers_email_format check (
    email is null or email = '' or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'
  )
);

comment on table public.customers is
  'Clientes de uma empresa. Exclusão nesta etapa é lógica (status = inactive) — ver docs/architecture.md para a justificativa.';

drop trigger if exists customers_set_updated_at on public.customers;
create trigger customers_set_updated_at
  before update on public.customers
  for each row
  execute function public.set_updated_at();

-- Índices (apenas os necessários para as consultas desta etapa: listagem
-- por empresa, busca por nome/telefone/email, e "clientes recentes").
create index if not exists customers_company_id_idx on public.customers (company_id);
create index if not exists customers_name_idx on public.customers (name);
create index if not exists customers_phone_idx on public.customers (phone);
create index if not exists customers_email_idx on public.customers (email);
create index if not exists customers_company_created_at_idx
  on public.customers (company_id, created_at desc);

-- Defesa em profundidade: impede que company_id de um cliente seja alterado
-- por qualquer sessão que não seja service_role. Sem isso, um usuário que
-- pertencesse a duas empresas distintas poderia, em tese, "mover" um
-- cliente de uma empresa para outra através de um UPDATE — mesmo que RLS
-- já exija pertencimento a ambas, isso ainda violaria o isolamento
-- esperado entre tenants.
create or replace function public.protect_customer_company_id()
returns trigger
language plpgsql
as $$
begin
  if auth.role() = 'service_role' then
    return new;
  end if;

  if new.company_id is distinct from old.company_id then
    raise exception 'Não é permitido alterar a empresa (company_id) de um cliente.';
  end if;

  return new;
end;
$$;

drop trigger if exists customers_protect_company_id on public.customers;
create trigger customers_protect_company_id
  before update on public.customers
  for each row
  execute function public.protect_customer_company_id();

-- -----------------------------------------------------------------------------
-- 5. Função segura de onboarding: cria empresa + owner atomicamente
-- -----------------------------------------------------------------------------
-- security definer: precisa inserir tanto em companies quanto em
-- company_members numa única transação atômica, sem depender de policies
-- de INSERT abertas para o cliente autenticado (o que seria mais arriscado
-- em um contexto multi-tenant). A função só age em nome do usuário
-- chamador (auth.uid()) — nunca recebe user_id ou role do frontend.
create or replace function public.create_company_with_owner(
  p_name text,
  p_business_type public.business_type default 'other'
)
returns public.companies
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_company public.companies;
begin
  if v_user_id is null then
    raise exception 'Usuário não autenticado.';
  end if;

  if p_name is null or char_length(trim(p_name)) = 0 then
    raise exception 'Nome da empresa é obrigatório.';
  end if;

  insert into public.companies (name, business_type)
  values (trim(p_name), coalesce(p_business_type, 'other'))
  returning * into v_company;

  insert into public.company_members (company_id, user_id, role)
  values (v_company.id, v_user_id, 'owner');

  return v_company;
end;
$$;

comment on function public.create_company_with_owner is
  'Cria uma empresa e vincula o usuário autenticado como owner, atomicamente. Único caminho de escrita para companies/company_members nesta etapa.';

-- Por padrão, PostgreSQL concede EXECUTE em novas funções a PUBLIC.
-- Restringe explicitamente: apenas usuários autenticados podem chamar.
revoke execute on function public.create_company_with_owner(text, public.business_type) from public;
grant execute on function public.create_company_with_owner(text, public.business_type) to authenticated;

-- -----------------------------------------------------------------------------
-- 6. Row Level Security
-- -----------------------------------------------------------------------------
alter table public.companies enable row level security;
alter table public.company_members enable row level security;
alter table public.customers enable row level security;

-- companies: leitura apenas das empresas às quais o usuário pertence.
-- Nenhuma policy de insert/update/delete é criada — a única forma de criar
-- uma empresa é a função create_company_with_owner (security definer).
drop policy if exists "companies_select_member" on public.companies;
create policy "companies_select_member"
  on public.companies
  for select
  to authenticated
  using (
    id in (
      select cm.company_id
      from public.company_members cm
      where cm.user_id = auth.uid()
    )
  );

-- company_members: cada usuário só vê os próprios vínculos (suficiente
-- para descobrir sua empresa atual e sua role). Nenhuma policy de
-- insert/update/delete — mutações só via create_company_with_owner ou
-- rotinas administrativas futuras com service_role. Isso também cumpre a
-- exigência de que o usuário nunca possa alterar a própria role pelo
-- frontend: não há nenhum caminho de escrita disponível para ele.
drop policy if exists "company_members_select_own" on public.company_members;
create policy "company_members_select_own"
  on public.company_members
  for select
  to authenticated
  using (user_id = auth.uid());

-- customers: isolamento multi-tenant via company_members. Um usuário só
-- acessa clientes de empresas às quais pertence.
drop policy if exists "customers_select_own_company" on public.customers;
create policy "customers_select_own_company"
  on public.customers
  for select
  to authenticated
  using (
    company_id in (
      select cm.company_id from public.company_members cm where cm.user_id = auth.uid()
    )
  );

drop policy if exists "customers_insert_own_company" on public.customers;
create policy "customers_insert_own_company"
  on public.customers
  for insert
  to authenticated
  with check (
    company_id in (
      select cm.company_id from public.company_members cm where cm.user_id = auth.uid()
    )
  );

drop policy if exists "customers_update_own_company" on public.customers;
create policy "customers_update_own_company"
  on public.customers
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

-- Policy de delete existe para cumprir o requisito de isolamento também
-- na exclusão física, mas a aplicação (nesta etapa) usa exclusão lógica
-- (status = 'inactive') como fluxo padrão — ver docs/architecture.md.
drop policy if exists "customers_delete_own_company" on public.customers;
create policy "customers_delete_own_company"
  on public.customers
  for delete
  to authenticated
  using (
    company_id in (
      select cm.company_id from public.company_members cm where cm.user_id = auth.uid()
    )
  );
