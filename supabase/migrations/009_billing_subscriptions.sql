-- =============================================================================
-- Migration: 009_billing_subscriptions.sql
-- Descrição: Assinatura do Prime Ges (cliente → assinatura → pagamento da
--            assinatura) via Pix, provedor EvoPay (docs.evopay.cash).
--            NÃO tem relação com sales/sale_items/sale_payments — aquelas
--            tabelas são vendas realizadas pelas empresas usuárias; esta
--            migration é sobre a cobrança do próprio Prime Ges.
--
-- Substitui o rascunho local 004_billing_foundation.sql (nunca aplicado —
-- não aparece em nenhuma migration já rodada no banco real). Reaproveita a
-- estrutura de plans/subscriptions/company_entitlements dele, com ajustes:
--   - remove billing_customers (EvoPay não tem conceito de "cliente" na
--     API — só campos soltos por cobrança).
--   - enxuga subscription_status para só os 5 status com necessidade real
--     hoje (trialing/pending/active/expired/cancelled).
--   - redesenha subscription_payments para os campos reais devolvidos pela
--     EvoPay (qrCodeText/qrCodeBase64/qrCodeUrl/taxAmount/endToEndId).
--   - renomeia gateway_* para provider_* (terminologia usada nesta fase).
--   - adiciona subscriptions.trial_claimed_by (uuid, único quando
--     preenchido) — trava o teste grátis por usuário autenticado, não só
--     por empresa, impedindo recriar conta para ganhar novo trial.
--   - limite de usuários auxiliares corrigido para a regra oficial atual:
--     FREE_TRIAL = 0 (1 usuário total, só o proprietário); MONTHLY,
--     QUARTERLY e YEARLY = 2 auxiliares cada (3 usuários totais) — não
--     mais o 2/5/10 escalonado do rascunho 004.
--
-- Nenhuma tabela existente (profiles, companies, company_members,
-- customers, audit_logs, customer_raffles, customer_raffle_entries,
-- product_categories, products, service_categories, services, sales,
-- sale_items, sale_payments) é alterada.
--
-- Escrita nas tabelas novas é restrita a service_role (webhook e criação
-- de cobrança rodam 100% server-side) — nenhuma policy de INSERT/UPDATE
-- para authenticated. public.plans só é legível autenticado (não expõe
-- provider/provider_plan_id); a view public.plans_public é o único
-- objeto com leitura aberta a anon, e só com colunas seguras.
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

  if not exists (select 1 from pg_type where typname = 'subscription_status') then
    create type public.subscription_status as enum (
      'trialing', 'pending', 'active', 'expired', 'cancelled'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'subscription_payment_status') then
    create type public.subscription_payment_status as enum (
      'pending', 'paid', 'expired', 'cancelled', 'failed', 'refunded'
    );
  end if;
end
$$;

-- -----------------------------------------------------------------------------
-- 2. Tabela plans (catálogo — dado de referência, não pertence a nenhuma empresa)
-- -----------------------------------------------------------------------------
create table if not exists public.plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  -- null = sem preço automático (plano CUSTOM/sob medida).
  price numeric(10, 2),
  currency text not null default 'BRL',
  -- FONTE DE VERDADE do acesso concedido — todo cálculo de expires_at
  -- (trial e renovação) usa access_duration_days, nunca deriva de
  -- billing_interval/billing_interval_count. null = período
  -- personalizado (CUSTOM), único caso permitido pela constraint abaixo.
  access_duration_days integer,
  -- Só descreve a cadência de cobrança recorrente (rótulo/relatório) —
  -- nunca usado para calcular validade de acesso. QUARTERLY usa
  -- ('month', 3), YEARLY usa ('year', 1).
  billing_interval public.billing_interval,
  billing_interval_count integer,
  additional_user_limit integer not null default 0,
  trial boolean not null default false,
  support_enabled boolean not null default false,
  tickets_enabled boolean not null default false,
  exclusive_groups_enabled boolean not null default false,
  early_access_enabled boolean not null default false,
  status public.plan_status not null default 'active',
  -- Não usados pela EvoPay hoje (sem registro de plano na API dela) —
  -- mantidos para um provedor futuro que suporte isso.
  provider text,
  provider_plan_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint plans_price_non_negative check (price is null or price >= 0),
  constraint plans_access_duration_positive check (
    access_duration_days is null or access_duration_days > 0
  ),
  constraint plans_billing_interval_count_positive check (
    billing_interval_count is null or billing_interval_count > 0
  ),
  constraint plans_additional_user_limit_non_negative check (additional_user_limit >= 0),
  -- Reforça "access_duration_days é a fonte de verdade": todo plano
  -- vendável/reivindicável precisa ter duração explícita — só o CUSTOM
  -- (negociado manualmente) pode ficar sem.
  constraint plans_access_duration_required_unless_custom check (
    code = 'CUSTOM' or access_duration_days is not null
  )
);

comment on table public.plans is
  'Catálogo de planos comerciais do Prime Ges (assinatura da plataforma, não vendas das empresas usuárias). Dado de referência — mutação restrita a service_role.';

drop trigger if exists plans_set_updated_at on public.plans;
create trigger plans_set_updated_at
  before update on public.plans
  for each row
  execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 3. Tabela subscriptions
-- -----------------------------------------------------------------------------
-- Uma única linha "atual" por empresa (company_id UNIQUE) — renovação
-- NUNCA insere uma nova linha aqui, sempre faz UPDATE nesta mesma linha
-- (troca plan_id/status e estende expires_at). O histórico completo de
-- cada cobrança/renovação fica em subscription_payments, não aqui.
create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null unique references public.companies (id) on delete cascade,
  plan_id uuid not null references public.plans (id),
  status public.subscription_status not null,
  starts_at timestamptz not null default now(),
  -- Única fonte de verdade sobre validade — o guard sempre confere isto
  -- junto com status, nunca confia só no status armazenado.
  expires_at timestamptz not null,
  cancelled_at timestamptz,
  -- Não usados pela EvoPay hoje (sem conceito de "cliente"/"assinatura
  -- recorrente" na API dela) — mantidos para um provedor futuro que
  -- suporte cobrança recorrente nativa.
  provider text,
  provider_customer_id text,
  provider_subscription_id text,
  -- Trava o teste grátis por usuário autenticado (não só por empresa):
  -- só preenchido em assinaturas do plano FREE_TRIAL. Índice único parcial
  -- abaixo impede o mesmo usuário reivindicar um segundo trial criando
  -- outra empresa.
  trial_claimed_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint subscriptions_expires_after_starts check (expires_at > starts_at)
);

comment on table public.subscriptions is
  'Estado ATUAL (uma linha por empresa — company_id é UNIQUE) da assinatura do Prime Ges. Renovação faz UPDATE nesta mesma linha, nunca INSERT de uma nova; o histórico de cobranças/renovações fica em subscription_payments. Nunca alterada pelo frontend — só por service_role (checkout, webhook, criação de empresa).';

-- company_id já é UNIQUE (índice implícito da constraint) — cobre tanto
-- a busca "assinatura desta empresa" quanto a garantia de uma única
-- linha por empresa, sem precisar de índice parcial "uma em aberto".
create index if not exists subscriptions_status_idx on public.subscriptions (status);
create index if not exists subscriptions_expires_at_idx on public.subscriptions (expires_at);

-- Um usuário autenticado só pode ter reivindicado um trial (em qualquer empresa).
create unique index if not exists subscriptions_one_trial_per_user_idx
  on public.subscriptions (trial_claimed_by)
  where trial_claimed_by is not null;

drop trigger if exists subscriptions_set_updated_at on public.subscriptions;
create trigger subscriptions_set_updated_at
  before update on public.subscriptions
  for each row
  execute function public.set_updated_at();

drop trigger if exists subscriptions_protect_company_id on public.subscriptions;
create trigger subscriptions_protect_company_id
  before update on public.subscriptions
  for each row
  execute function public.protect_company_id();

-- -----------------------------------------------------------------------------
-- 4. Tabela company_entitlements
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
  'Estado atual de autorização de cada empresa (uma linha por empresa) — o que o backend consulta para liberar/bloquear acesso. Sempre recalculado junto de subscriptions, nunca a fonte primária de verdade sozinha (expires_at ainda precisa ser conferido em tempo real pelo guard).';

drop trigger if exists company_entitlements_set_updated_at on public.company_entitlements;
create trigger company_entitlements_set_updated_at
  before update on public.company_entitlements
  for each row
  execute function public.set_updated_at();

drop trigger if exists company_entitlements_protect_company_id on public.company_entitlements;
create trigger company_entitlements_protect_company_id
  before update on public.company_entitlements
  for each row
  execute function public.protect_company_id();

-- -----------------------------------------------------------------------------
-- 5. Tabela subscription_payments (cobranças Pix da assinatura — campos
--    reais devolvidos pela EvoPay, não inventados)
-- -----------------------------------------------------------------------------
create table if not exists public.subscription_payments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  subscription_id uuid references public.subscriptions (id) on delete set null,
  plan_id uuid not null references public.plans (id),
  provider text not null default 'evopay',
  -- "id" (CUID) devolvido pela EvoPay na criação da cobrança — usado para
  -- consultar GET /v1/pix?id=... na confirmação.
  provider_transaction_id text,
  status public.subscription_payment_status not null default 'pending',
  -- amount = valor do plano, exatamente o que a empresa paga (a Prime Ges
  -- absorve a taxa da EvoPay — decisão de negócio, não do provedor).
  amount numeric(10, 2) not null,
  tax_amount numeric(10, 2),
  amount_with_tax numeric(10, 2),
  currency text not null default 'BRL',
  -- Snapshot do Pix devolvido pela EvoPay na criação — nunca gerado
  -- localmente. pix_qr_code_text (copia-e-cola) e pix_qr_code_url são a
  -- persistência padrão. pix_qr_code_base64 é OPCIONAL de propósito —
  -- a aplicação só preenche quando realmente precisar recuperar a
  -- cobrança sem depender da URL da imagem (ex: URL parou de responder);
  -- não persistir em toda cobrança evita inchar o banco com base64 de
  -- imagem sem necessidade real.
  pix_qr_code_text text,
  pix_qr_code_url text,
  pix_qr_code_base64 text,
  payer_name text,
  payer_document text,
  end_to_end_id text,
  external_reference text,
  -- Informativo apenas (a EvoPay não expõe vencimento configurável na
  -- criação da cobrança) — usado só para a UI sugerir gerar nova cobrança;
  -- nunca decide status sozinho.
  due_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint subscription_payments_amount_non_negative check (amount >= 0)
);

comment on table public.subscription_payments is
  'Histórico de cobranças Pix da assinatura do Prime Ges (não confundir com sale_payments, que são pagamentos recebidos pelas empresas usuárias). Nunca alterada pelo frontend — só por service_role, a partir de resposta autenticada da EvoPay.';

create index if not exists subscription_payments_company_id_idx on public.subscription_payments (company_id);
create index if not exists subscription_payments_subscription_id_idx on public.subscription_payments (subscription_id);
create index if not exists subscription_payments_status_idx on public.subscription_payments (status);

-- Idempotência: a mesma transação da EvoPay nunca gera duas linhas.
create unique index if not exists subscription_payments_provider_transaction_unique_idx
  on public.subscription_payments (provider, provider_transaction_id)
  where provider_transaction_id is not null;

drop trigger if exists subscription_payments_set_updated_at on public.subscription_payments;
create trigger subscription_payments_set_updated_at
  before update on public.subscription_payments
  for each row
  execute function public.set_updated_at();

drop trigger if exists subscription_payments_protect_company_id on public.subscription_payments;
create trigger subscription_payments_protect_company_id
  before update on public.subscription_payments
  for each row
  execute function public.protect_company_id();

-- -----------------------------------------------------------------------------
-- 6. Tabela payment_events (log idempotente de webhooks)
-- -----------------------------------------------------------------------------
-- A EvoPay não tem um "event id" próprio — a própria documentação
-- instrui deduplicar pela combinação (id da transação + status). Por
-- isso event_id aqui é sintético: '{provider_transaction_id}:{status}'.
create table if not exists public.payment_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  event_id text not null,
  event_type text not null,
  payload jsonb,
  subscription_payment_id uuid references public.subscription_payments (id),
  processed boolean not null default false,
  processed_at timestamptz,
  created_at timestamptz not null default now(),

  constraint payment_events_provider_event_unique unique (provider, event_id)
);

comment on table public.payment_events is
  'Log de eventos de webhook de pagamento da assinatura, para idempotência (o mesmo evento processado duas vezes não duplica renovação). Sem acesso via API pública — só service_role.';

create index if not exists payment_events_subscription_payment_id_idx on public.payment_events (subscription_payment_id);

-- -----------------------------------------------------------------------------
-- 7. Row Level Security
-- -----------------------------------------------------------------------------
alter table public.plans enable row level security;
alter table public.subscriptions enable row level security;
alter table public.company_entitlements enable row level security;
alter table public.subscription_payments enable row level security;
alter table public.payment_events enable row level security;

-- plans: a TABELA em si só é legível por usuários autenticados — não é
-- secreta (não guarda credenciais), mas provider/provider_plan_id são
-- detalhe interno de integração sem motivo para ficar público. Nenhuma
-- policy de insert/update/delete — mutação só via service_role.
drop policy if exists "plans_select_all" on public.plans;
drop policy if exists "plans_select_authenticated" on public.plans;
create policy "plans_select_authenticated"
  on public.plans
  for select
  to authenticated
  using (true);

-- subscriptions: membros veem a assinatura da própria empresa. Sem
-- policies de escrita — nunca alterado pelo frontend.
drop policy if exists "subscriptions_select_own_company" on public.subscriptions;
create policy "subscriptions_select_own_company"
  on public.subscriptions
  for select
  to authenticated
  using (
    company_id in (
      select cm.company_id from public.company_members cm where cm.user_id = auth.uid()
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
  );

-- payment_events: nenhuma policy de propósito — RLS habilitada sem
-- nenhuma regra bloqueia todo acesso via anon/authenticated por padrão.
-- Só service_role (que ignora RLS) processa e lê este log.

-- -----------------------------------------------------------------------------
-- 7b. Função pública segura (landing page / visitante não autenticado)
-- -----------------------------------------------------------------------------
-- RLS filtra LINHA, não COLUNA — por isso a página pública de preços não
-- lê public.plans diretamente (que exigiria expor provider/provider_plan_id
-- a anon). Esta função expõe só os campos realmente necessários no
-- frontend: nada de credenciais, segredo ou dado sensível, e nada de
-- detalhe de integração com o provedor.
--
-- É FUNÇÃO (SECURITY DEFINER), não VIEW: uma view comum sobre uma tabela
-- com RLS é sinalizada como erro pelo Security Advisor do Supabase
-- (contorna RLS via dono da view de forma implícita/menos visível) — o
-- padrão recomendado para "expor um subconjunto seguro e público de uma
-- tabela protegida" é uma função, mesmo padrão já usado em
-- create_company_with_owner/complete_sale/cancel_sale.
create or replace function public.get_public_plans()
returns table (
  id uuid,
  code text,
  name text,
  description text,
  price numeric(10, 2),
  currency text,
  access_duration_days integer,
  additional_user_limit integer,
  trial boolean,
  support_enabled boolean,
  tickets_enabled boolean,
  exclusive_groups_enabled boolean,
  early_access_enabled boolean,
  status public.plan_status
)
language sql
security definer
set search_path = public
stable
as $$
  select id, code, name, description, price, currency, access_duration_days,
         additional_user_limit, trial, support_enabled, tickets_enabled,
         exclusive_groups_enabled, early_access_enabled, status
  from public.plans
  where status = 'active';
$$;

comment on function public.get_public_plans() is
  'Catálogo público de planos (landing page, anon) — colunas seguras de plans, sem provider/provider_plan_id nem qualquer dado de integração.';

revoke execute on function public.get_public_plans() from public;
grant execute on function public.get_public_plans() to anon, authenticated;

-- -----------------------------------------------------------------------------
-- 8. Seed: os 5 planos oficiais (idempotente — ON CONFLICT por code)
-- -----------------------------------------------------------------------------
-- additional_user_limit = usuários AUXILIARES (além do proprietário):
--   FREE_TRIAL: 0 auxiliares → 1 usuário total (só o proprietário).
--   MONTHLY/QUARTERLY/YEARLY: 2 auxiliares → 3 usuários totais, igual
--   para os três planos pagos (regra oficial atual — substitui o 2/5/10
--   herdado do rascunho 004).
--   CUSTOM: 0 por enquanto (configurável manualmente depois — ainda não
--   há painel para isso; 0 é só o valor padrão seguro, não uma regra de
--   negócio definitiva).
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
    240.00, 'BRL', 93, 'month', 3, 2, false,
    true, true, true, true, 'active'
  ),
  (
    'YEARLY', 'Anual',
    'Acesso ao Prime Ges garantido por 365 dias.',
    899.00, 'BRL', 365, 'year', 1, 2, false,
    true, true, true, true, 'active'
  ),
  (
    'CUSTOM', 'Sob medida',
    'Período e condições personalizadas — mediante orçamento com a equipe comercial.',
    null, 'BRL', null, null, null, 0, false,
    true, true, true, true, 'active'
  )
on conflict (code) do nothing;

-- -----------------------------------------------------------------------------
-- 9. create_company_with_owner: passa a criar o trial atomicamente
-- -----------------------------------------------------------------------------
-- Estende a função existente (migration 002) para que nunca exista
-- empresa sem estado de assinatura definido. Se o usuário autenticado já
-- reivindicou um trial antes (em qualquer empresa), a empresa ainda é
-- criada normalmente — só não ganha um novo trial (subscriptions/
-- company_entitlements ficam sem linha, e o guard trata "sem linha" como
-- "sem acesso", levando para /assinatura).
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
  v_trial_plan public.plans;
  v_trial_already_used boolean;
  v_expires_at timestamptz;
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

  select exists (
    select 1 from public.subscriptions where trial_claimed_by = v_user_id
  ) into v_trial_already_used;

  if not v_trial_already_used then
    select * into v_trial_plan from public.plans where code = 'FREE_TRIAL';

    -- v_trial_plan.id (campo escalar) em vez de "v_trial_plan is not null":
    -- para tipos linha/compostos, "ROW IS NOT NULL" só é verdadeiro
    -- quando TODOS os campos são não-nulos — como billing_interval,
    -- billing_interval_count, provider e provider_plan_id são NULL na
    -- linha do FREE_TRIAL, essa checagem falhava silenciosamente mesmo
    -- com o plano encontrado corretamente (bug real, achado em teste).
    if v_trial_plan.id is not null and v_trial_plan.access_duration_days is not null then
      v_expires_at := now() + (v_trial_plan.access_duration_days || ' days')::interval;

      insert into public.subscriptions (
        company_id, plan_id, status, starts_at, expires_at, trial_claimed_by
      ) values (
        v_company.id, v_trial_plan.id, 'trialing', now(), v_expires_at, v_user_id
      );

      insert into public.company_entitlements (
        company_id, plan_id, status, access_starts_at, access_expires_at,
        max_additional_users, support_enabled, tickets_enabled,
        exclusive_groups_enabled, early_access_enabled
      ) values (
        v_company.id, v_trial_plan.id, 'trialing', now(), v_expires_at,
        v_trial_plan.additional_user_limit, v_trial_plan.support_enabled,
        v_trial_plan.tickets_enabled, v_trial_plan.exclusive_groups_enabled,
        v_trial_plan.early_access_enabled
      );
    end if;
  end if;

  return v_company;
end;
$$;

comment on function public.create_company_with_owner is
  'Cria uma empresa e vincula o usuário autenticado como owner, atomicamente — e concede o teste grátis de 1 dia se este usuário (não só esta empresa) ainda não reivindicou um antes. Único caminho de escrita para companies/company_members/trial inicial.';
