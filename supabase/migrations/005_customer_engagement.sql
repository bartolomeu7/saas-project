-- =============================================================================
-- Migration: 005_customer_engagement.sql
-- Descrição: FASE 1 (Clientes avançado) do sistema de gestão adaptativo —
--            log de auditoria genérico + ferramenta de sorteio de
--            clientes. Puramente aditiva: nenhuma tabela existente
--            (profiles, companies, company_members, customers) é
--            alterada, e nenhuma migration já aplicada é reexecutada.
--
-- Tabelas novas:
--   - audit_logs: log genérico de eventos, reutilizável por qualquer
--     módulo futuro (entity_type/entity_id genéricos). Imutável via API
--     (sem policy de update/delete).
--   - customer_raffles: metadados de cada sorteio (critérios usados,
--     contagens, quem/quando executou). Imutável após criado.
--   - customer_raffle_entries: snapshot dos participantes de cada
--     sorteio — guarda nome/telefone/e-mail no momento do sorteio, para
--     que o resultado continue auditável mesmo se o cliente for editado
--     depois. Imutável.
--
-- Ranking de clientes (mais lucrativo / melhor cliente) não precisa de
-- tabela nova nesta fase: depende de dados de vendas/serviços que ainda
-- não existem (Fases 3/4), então a página correspondente consulta dados
-- reais disponíveis hoje e mostra estado vazio quando não há base de
-- cálculo — nada é armazenado ou inventado.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Tabela audit_logs (genérica, reutilizável pelos próximos módulos)
-- -----------------------------------------------------------------------------
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  actor_user_id uuid references auth.users (id) on delete set null,
  -- Genérico de propósito: 'customer', e futuramente 'sale', 'service',
  -- 'product', etc. — sem tabela dedicada por tipo de entidade.
  entity_type text not null,
  entity_id uuid not null,
  action text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

comment on table public.audit_logs is
  'Log de auditoria genérico, compartilhado por todos os módulos (entity_type/entity_id). Imutável via API — apenas inserção, nunca update/delete.';

create index if not exists audit_logs_company_id_idx on public.audit_logs (company_id);
create index if not exists audit_logs_entity_idx on public.audit_logs (entity_type, entity_id);
create index if not exists audit_logs_created_at_idx on public.audit_logs (created_at desc);

-- -----------------------------------------------------------------------------
-- 2. Tabela customer_raffles (metadados do sorteio)
-- -----------------------------------------------------------------------------
create table if not exists public.customer_raffles (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text,
  -- Snapshot dos critérios usados (período, status, etc.) — auditável
  -- mesmo que os filtros disponíveis mudem no futuro.
  criteria jsonb not null default '{}'::jsonb,
  participant_count integer not null,
  winner_count integer not null,
  executed_by uuid not null references auth.users (id),
  executed_at timestamptz not null default now(),

  constraint customer_raffles_counts_valid check (
    participant_count >= 0
    and winner_count >= 0
    and winner_count <= participant_count
  )
);

comment on table public.customer_raffles is
  'Sorteios de clientes já executados. Sorteio é atômico (definir critérios = executar) e imutável depois de criado — nenhuma policy de update/delete.';

create index if not exists customer_raffles_company_id_idx on public.customer_raffles (company_id);
create index if not exists customer_raffles_executed_at_idx on public.customer_raffles (executed_at desc);

-- -----------------------------------------------------------------------------
-- 3. Tabela customer_raffle_entries (snapshot dos participantes)
-- -----------------------------------------------------------------------------
create table if not exists public.customer_raffle_entries (
  id uuid primary key default gen_random_uuid(),
  raffle_id uuid not null references public.customer_raffles (id) on delete cascade,
  -- Redundante com raffle.company_id de propósito: mantém a policy de
  -- RLS simples e direta (mesmo padrão de customers/subscriptions).
  company_id uuid not null references public.companies (id) on delete cascade,
  customer_id uuid references public.customers (id) on delete set null,
  -- Snapshot no momento do sorteio: o resultado permanece auditável
  -- mesmo que o cliente seja editado (ou removido) depois.
  customer_name_snapshot text not null,
  customer_phone_snapshot text,
  customer_email_snapshot text,
  is_winner boolean not null default false,
  winner_position integer,

  constraint customer_raffle_entries_unique_per_raffle unique (raffle_id, customer_id)
);

comment on table public.customer_raffle_entries is
  'Participantes de cada sorteio, com snapshot dos dados do cliente no momento do sorteio. Imutável — sem policy de update/delete.';

create index if not exists customer_raffle_entries_raffle_id_idx on public.customer_raffle_entries (raffle_id);
create index if not exists customer_raffle_entries_company_id_idx on public.customer_raffle_entries (company_id);

-- -----------------------------------------------------------------------------
-- 4. Row Level Security
-- -----------------------------------------------------------------------------
alter table public.audit_logs enable row level security;
alter table public.customer_raffles enable row level security;
alter table public.customer_raffle_entries enable row level security;

-- audit_logs: leitura restrita à própria empresa (+ admin global).
-- Inserção permitida a membros da própria empresa, mas só em nome
-- deles mesmos (actor_user_id = auth.uid()) — evita que alguém grave um
-- evento se passando por outro usuário. Sem policy de update/delete:
-- log é imutável por design.
drop policy if exists "audit_logs_select_own_company" on public.audit_logs;
create policy "audit_logs_select_own_company"
  on public.audit_logs
  for select
  to authenticated
  using (
    company_id in (
      select cm.company_id from public.company_members cm where cm.user_id = auth.uid()
    )
    or exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid() and p.role in ('admin', 'super_admin')
    )
  );

drop policy if exists "audit_logs_insert_own_company" on public.audit_logs;
create policy "audit_logs_insert_own_company"
  on public.audit_logs
  for insert
  to authenticated
  with check (
    company_id in (
      select cm.company_id from public.company_members cm where cm.user_id = auth.uid()
    )
    and (actor_user_id is null or actor_user_id = auth.uid())
  );

-- customer_raffles: leitura restrita à própria empresa (+ admin).
-- Inserção só em nome do próprio usuário executor. Sem update/delete —
-- resultado de sorteio concluído nunca pode ser alterado.
drop policy if exists "customer_raffles_select_own_company" on public.customer_raffles;
create policy "customer_raffles_select_own_company"
  on public.customer_raffles
  for select
  to authenticated
  using (
    company_id in (
      select cm.company_id from public.company_members cm where cm.user_id = auth.uid()
    )
    or exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid() and p.role in ('admin', 'super_admin')
    )
  );

drop policy if exists "customer_raffles_insert_own_company" on public.customer_raffles;
create policy "customer_raffles_insert_own_company"
  on public.customer_raffles
  for insert
  to authenticated
  with check (
    company_id in (
      select cm.company_id from public.company_members cm where cm.user_id = auth.uid()
    )
    and executed_by = auth.uid()
  );

-- customer_raffle_entries: leitura restrita à própria empresa (+ admin).
-- Inserção liberada para a própria empresa (a Server Action grava o
-- sorteio e os participantes na mesma operação). Sem update/delete.
drop policy if exists "customer_raffle_entries_select_own_company" on public.customer_raffle_entries;
create policy "customer_raffle_entries_select_own_company"
  on public.customer_raffle_entries
  for select
  to authenticated
  using (
    company_id in (
      select cm.company_id from public.company_members cm where cm.user_id = auth.uid()
    )
    or exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid() and p.role in ('admin', 'super_admin')
    )
  );

drop policy if exists "customer_raffle_entries_insert_own_company" on public.customer_raffle_entries;
create policy "customer_raffle_entries_insert_own_company"
  on public.customer_raffle_entries
  for insert
  to authenticated
  with check (
    company_id in (
      select cm.company_id from public.company_members cm where cm.user_id = auth.uid()
    )
  );
