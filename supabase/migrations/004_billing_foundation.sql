-- =============================================================================
-- Migration: 004_billing_foundation.sql
-- Descrição: ETAPA A do sistema de planos/assinaturas/pagamentos do Prime
--            Ges — fundação de banco (tabelas, enums, índices, triggers e
--            RLS). Nenhuma integração de gateway de pagamento é feita
--            aqui; esta migration só cria a estrutura de dados e semeia
--            os 5 planos oficiais como dados de referência.
--
-- Não recria nem altera profiles, companies, company_members ou
-- customers (migrations 001-003) — tabelas novas apenas, relacionadas a
-- companies via company_id, seguindo o mesmo padrão multi-tenant já
-- estabelecido.
--
-- Escopo (ver docs da tarefa "Sistema completo de planos, assinaturas,
-- pagamentos e controle de acesso" — ETAPA A):
--   - plans: catálogo de planos (dado de referência, não por empresa).
--   - billing_customers: vínculo empresa <-> cliente no gateway de
--     pagamento (ex: Mercado Pago), 1:1 por (company_id, gateway).
--   - subscriptions: histórico/estado da assinatura de cada empresa.
--   - company_entitlements: "o que esta empresa pode usar agora" —
--     camada de autorização consultada pelo backend a cada acesso
--     protegido (nunca confiar só no frontend).
--   - subscription_payments: histórico de cobranças.
--   - payment_events: log idempotente de eventos recebidos de webhooks.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Enums
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'plan_status') then
    create type public.plan_status as enum ('active', 'inactive');
  end if;

  if not exists (select 1 from pg_type where typname = 'billing_interval') then
    create type public.billing_interval as enum ('month', 'year');
  end if;

  -- Compartilhado entre subscriptions e company_entitlements — o
  -- entitlement reflete o status "efetivo" da assinatura no momento.
  if not exists (select 1 from pg_type where typname = 'subscription_status') then
    create type public.subscription_status as enum (
      'trialing',
      'active',
      'pending',
      'past_due',
      'cancelled',
      'expired',
      'suspended',
      'incomplete'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'payment_status') then
    create type public.payment_status as enum (
      'pending',
      'approved',
      'rejected',
      'cancelled',
      'refunded',
      'chargeback'
    );
  end if;
end
$$;

-- -----------------------------------------------------------------------------
-- 2. Tabela plans (catálogo — não é dado por empresa)
-- -----------------------------------------------------------------------------
create table if not exists public.plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  -- null = sem preço automático (plano CUSTOM/sob medida).
  price numeric(10, 2),
  currency text not null default 'BRL',
  -- null = período personalizado (CUSTOM). Duração real de acesso
  -- concedida por ciclo — propositalmente separada de billing_interval,
  -- que descreve apenas a cadência de cobrança recorrente.
  access_duration_days integer,
  billing_interval public.billing_interval,
  billing_interval_count integer,
  additional_user_limit integer not null default 0,
  trial boolean not null default false,
  support_enabled boolean not null default false,
  tickets_enabled boolean not null default false,
  exclusive_groups_enabled boolean not null default false,
  early_access_enabled boolean not null default false,
  status public.plan_status not null default 'active',
  -- Preenchidos quando o plano for de fato cadastrado no gateway.
  gateway text,
  gateway_plan_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint plans_price_non_negative check (price is null or price >= 0),
  constraint plans_access_duration_positive check (
    access_duration_days is null or access_duration_days > 0
  ),
  constraint plans_billing_interval_count_positive check (
    billing_interval_count is null or billing_interval_count > 0
  ),
  constraint plans_additional_user_limit_non_negative check (additional_user_limit >= 0)
);

comment on table public.plans is
  'Catálogo de planos comerciais do Prime Ges. Dado de referência (não pertence a nenhuma empresa) — mutação restrita a service_role/admin.';

drop trigger if exists plans_set_updated_at on public.plans;
create trigger plans_set_updated_at
  before update on public.plans
  for each row
  execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 3. Tabela billing_customers (empresa <-> cliente no gateway)
-- -----------------------------------------------------------------------------
create table if not exists public.billing_customers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  gateway text not null,
  gateway_customer_id text,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint billing_customers_unique_per_gateway unique (company_id, gateway)
);

comment on table public.billing_customers is
  'Vínculo entre uma empresa e o registro de cliente correspondente no gateway de pagamento (ex: Mercado Pago). Escrita restrita a service_role.';

create index if not exists billing_customers_company_id_idx on public.billing_customers (company_id);

drop trigger if exists billing_customers_set_updated_at on public.billing_customers;
create trigger billing_customers_set_updated_at
  before update on public.billing_customers
  for each row
  execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 4. Tabela subscriptions
-- -----------------------------------------------------------------------------
create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  plan_id uuid not null references public.plans (id),
  status public.subscription_status not null,
  started_at timestamptz not null default now(),
  current_period_start timestamptz not null,
  current_period_end timestamptz not null,
  cancel_at_period_end boolean not null default false,
  cancelled_at timestamptz,
  gateway text,
  gateway_subscription_id text,
  gateway_customer_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint subscriptions_period_valid check (current_period_end > current_period_start)
);

comment on table public.subscriptions is
  'Histórico e estado da assinatura de cada empresa. Nunca alterada pelo frontend — só por rotinas server-side (checkout, webhook, admin).';

create index if not exists subscriptions_company_id_idx on public.subscriptions (company_id);
create index if not exists subscriptions_status_idx on public.subscriptions (status);

-- Evita duas assinaturas "em aberto" simultâneas para a mesma empresa
-- (defesa contra dupla criação, ver seção "Concorrência e duplicidade").
create unique index if not exists subscriptions_one_open_per_company_idx
  on public.subscriptions (company_id)
  where status in ('trialing', 'active', 'pending', 'past_due');

drop trigger if exists subscriptions_set_updated_at on public.subscriptions;
create trigger subscriptions_set_updated_at
  before update on public.subscriptions
  for each row
  execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 5. Tabela company_entitlements
-- -----------------------------------------------------------------------------
-- "O que esta empresa pode usar neste momento." Camada de autorização
-- consultada pelo backend a cada acesso a área protegida — nunca o
-- frontend decide sozinho se o acesso está liberado.
create table if not exists public.company_entitlements (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null unique references public.companies (id) on delete cascade,
  plan_id uuid references public.plans (id),
  status public.subscription_status not null,
  access_starts_at timestamptz,
  access_expires_at timestamptz,
  max_additional_users integer not null default 0,
  support_enabled boolean not null default false,
  tickets_enabled boolean not null default false,
  exclusive_groups_enabled boolean not null default false,
  early_access_enabled boolean not null default false,
  updated_at timestamptz not null default now(),

  constraint company_entitlements_max_additional_users_non_negative check (
    max_additional_users >= 0
  )
);

comment on table public.company_entitlements is
  'Estado atual de autorização de cada empresa (uma linha por empresa). É esta tabela que o backend consulta para liberar/bloquear acesso — nunca subscriptions diretamente.';

drop trigger if exists company_entitlements_set_updated_at on public.company_entitlements;
create trigger company_entitlements_set_updated_at
  before update on public.company_entitlements
  for each row
  execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 6. Tabela subscription_payments
-- -----------------------------------------------------------------------------
create table if not exists public.subscription_payments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  subscription_id uuid not null references public.subscriptions (id) on delete cascade,
  plan_id uuid not null references public.plans (id),
  provider text not null,
  provider_payment_id text,
  amount numeric(10, 2) not null,
  currency text not null default 'BRL',
  status public.payment_status not null default 'pending',
  paid_at timestamptz,
  due_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint subscription_payments_amount_non_negative check (amount >= 0)
);

comment on table public.subscription_payments is
  'Histórico de cobranças de cada assinatura. Nunca mostra dados de cartão — apenas status e identificador do gateway.';

create index if not exists subscription_payments_company_id_idx on public.subscription_payments (company_id);
create index if not exists subscription_payments_subscription_id_idx on public.subscription_payments (subscription_id);

-- Idempotência: o mesmo pagamento do gateway nunca gera duas linhas.
create unique index if not exists subscription_payments_provider_payment_unique_idx
  on public.subscription_payments (provider, provider_payment_id)
  where provider_payment_id is not null;

drop trigger if exists subscription_payments_set_updated_at on public.subscription_payments;
create trigger subscription_payments_set_updated_at
  before update on public.subscription_payments
  for each row
  execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 7. Tabela payment_events (log idempotente de webhooks)
-- -----------------------------------------------------------------------------
create table if not exists public.payment_events (
  id uuid primary key default gen_random_uuid(),
  event_id text not null,
  provider text not null,
  event_type text not null,
  payload_hash text,
  subscription_id uuid references public.subscriptions (id),
  processed_at timestamptz,
  created_at timestamptz not null default now(),

  -- Mesmo evento do gateway processado duas vezes não duplica nada.
  constraint payment_events_provider_event_unique unique (provider, event_id)
);

comment on table public.payment_events is
  'Log bruto de eventos de webhook, usado para garantir idempotência (um evento do gateway só é efetivamente processado uma vez). Sem acesso via API pública — só service_role.';

create index if not exists payment_events_subscription_id_idx on public.payment_events (subscription_id);

-- -----------------------------------------------------------------------------
-- 8. Row Level Security
-- -----------------------------------------------------------------------------
alter table public.plans enable row level security;
alter table public.billing_customers enable row level security;
alter table public.subscriptions enable row level security;
alter table public.company_entitlements enable row level security;
alter table public.subscription_payments enable row level security;
alter table public.payment_events enable row level security;

-- plans: catálogo público (mesmo conteúdo já exibido na landing page),
-- leitura liberada para todos. Nenhuma policy de insert/update/delete —
-- mutação só via service_role (futuro painel /admin/planos).
drop policy if exists "plans_select_all" on public.plans;
create policy "plans_select_all"
  on public.plans
  for select
  to anon, authenticated
  using (true);

-- billing_customers: só membros da própria empresa enxergam; sem
-- policies de escrita (só service_role, no fluxo de checkout).
drop policy if exists "billing_customers_select_own_company" on public.billing_customers;
create policy "billing_customers_select_own_company"
  on public.billing_customers
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

-- subscriptions: membros veem a assinatura da própria empresa; admin
-- global vê todas. Sem policies de escrita — nunca alterado pelo
-- frontend (ver regra de segurança da tarefa).
drop policy if exists "subscriptions_select_own_company" on public.subscriptions;
create policy "subscriptions_select_own_company"
  on public.subscriptions
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

-- company_entitlements: idem subscriptions.
drop policy if exists "company_entitlements_select_own_company" on public.company_entitlements;
create policy "company_entitlements_select_own_company"
  on public.company_entitlements
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

-- subscription_payments: histórico de pagamentos só da própria empresa.
drop policy if exists "subscription_payments_select_own_company" on public.subscription_payments;
create policy "subscription_payments_select_own_company"
  on public.subscription_payments
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

-- payment_events: nenhuma policy de propósito — RLS habilitada sem
-- nenhuma regra bloqueia todo acesso via anon/authenticated por padrão.
-- Só service_role (que ignora RLS) processa webhooks e lê este log.

-- -----------------------------------------------------------------------------
-- 9. Seed: os 5 planos oficiais
-- -----------------------------------------------------------------------------
-- Idempotente (ON CONFLICT por code) — seguro rodar de novo.
insert into public.plans (
  code, name, description, price, currency, access_duration_days,
  billing_interval, billing_interval_count, additional_user_limit, trial,
  support_enabled, tickets_enabled, exclusive_groups_enabled, early_access_enabled,
  status
) values
  (
    'FREE_TRIAL', 'Teste Grátis',
    'Experimente o Prime Ges por 1 dia e conheça a plataforma.',
    0, 'BRL', 1, null, null, 0, true,
    false, false, false, false, 'active'
  ),
  (
    'MONTHLY', 'Mensal',
    'Tenha acesso completo ao Prime Ges durante 31 dias.',
    89.00, 'BRL', 31, 'month', 1, 2, false,
    true, true, true, true, 'active'
  ),
  (
    'QUARTERLY', 'Trimestral',
    'Acesso ao Prime Ges garantido por 93 dias.',
    240.00, 'BRL', 93, 'month', 3, 5, false,
    true, true, true, true, 'active'
  ),
  (
    'YEARLY', 'Anual',
    'Acesso ao Prime Ges garantido por 365 dias.',
    899.00, 'BRL', 365, 'year', 1, 10, false,
    true, true, true, true, 'active'
  ),
  (
    'CUSTOM', 'Sob medida',
    'Período e condições personalizadas — mediante orçamento com a equipe comercial.',
    null, 'BRL', null, null, null, null, false,
    true, true, true, true, 'active'
  )
on conflict (code) do nothing;
