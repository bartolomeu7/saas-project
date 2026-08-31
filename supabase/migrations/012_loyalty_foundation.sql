-- =============================================================================
-- Migration: 012_loyalty_foundation.sql
-- Descrição: Etapa 1C — fundação de Fidelidade de Clientes (banco + ledger +
--            segurança). Migration aditiva: nenhuma tabela/coluna anterior
--            removida, nenhuma migration anterior alterada.
--
-- Cria: loyalty_settings, loyalty_tier_thresholds, loyalty_accounts,
--       loyalty_transactions, loyalty_multipliers, loyalty_campaigns.
-- Altera (aditivamente): public.sales ganha 2 colunas para rastrear o
--       resgate de pontos aplicado como desconto naquela venda específica
--       (necessário para exibir/reverter corretamente — não fazia parte da
--       lista original de "tabelas novas", mas é a única forma de saber
--       quanto de sales.discount_amount veio de fidelidade).
--
-- Reaproveita integralmente: RLS por company_members, protect_company_id(),
-- set_updated_at(), audit_logs (5 ações novas). NÃO cria: cron de expiração
-- (função fica pronta, mas não é agendada), fluxo de devolução/estorno
-- (documentado como fora de escopo até esses módulos existirem), sistema de
-- cupom separado, fila de aprovação assíncrona.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. Tipos enumerados (mesmo padrão já usado em business_type, sale_status,
--    product_status etc. — vocabulário fixo e pequeno).
-- -----------------------------------------------------------------------------
create type public.loyalty_transaction_type as enum ('ganho', 'resgate', 'ajuste', 'expirado', 'reversao');
create type public.loyalty_transaction_source as enum ('sale', 'manual', 'campaign', 'birthday', 'first_purchase', 'expiration', 'reversal');
create type public.loyalty_campaign_status as enum ('active', 'inactive');
create type public.loyalty_grant_on as enum ('completion', 'full_payment');

-- -----------------------------------------------------------------------------
-- 1. public.sales — 2 colunas aditivas para rastrear resgate de pontos
--    aplicado nesta venda (quanto foi resgatado e quanto de desconto isso
--    gerou). Sem isso não é possível exibir/estornar corretamente o resgate
--    de uma venda específica.
-- -----------------------------------------------------------------------------
alter table public.sales
  add column if not exists loyalty_points_redeemed integer not null default 0
    check (loyalty_points_redeemed >= 0),
  add column if not exists loyalty_discount_amount numeric(12, 2) not null default 0
    check (loyalty_discount_amount >= 0);

comment on column public.sales.loyalty_points_redeemed is
  'Quantidade de pontos de fidelidade resgatados nesta venda (0 se nenhum). Preenchido só por public.redeem_loyalty_points().';
comment on column public.sales.loyalty_discount_amount is
  'Parte de sales.discount_amount que veio de resgate de pontos de fidelidade (subconjunto, não um desconto adicional).';

-- -----------------------------------------------------------------------------
-- 2. loyalty_settings — 1 linha por empresa, tudo configurável.
-- -----------------------------------------------------------------------------
create table public.loyalty_settings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null unique references public.companies (id) on delete cascade,
  enabled boolean not null default false,
  points_per_currency_unit numeric(10, 4) not null default 1
    check (points_per_currency_unit >= 0),
  min_purchase_amount_for_points numeric(12, 2) not null default 0
    check (min_purchase_amount_for_points >= 0),
  redemption_value_per_point numeric(10, 6) not null default 0.01
    check (redemption_value_per_point >= 0),
  min_points_to_redeem integer not null default 0
    check (min_points_to_redeem >= 0),
  max_redeem_percent_per_sale numeric(5, 2)
    check (max_redeem_percent_per_sale is null or (max_redeem_percent_per_sale > 0 and max_redeem_percent_per_sale <= 100)),
  points_expire boolean not null default false,
  points_expire_after_days integer
    check (points_expire_after_days is null or points_expire_after_days > 0),
  birthday_bonus_points integer not null default 0 check (birthday_bonus_points >= 0),
  first_purchase_bonus_points integer not null default 0 check (first_purchase_bonus_points >= 0),
  grant_on public.loyalty_grant_on not null default 'completion',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint loyalty_settings_expire_requires_days
    check (not points_expire or points_expire_after_days is not null)
);

comment on table public.loyalty_settings is
  'Configuração de fidelidade por empresa (1 linha). enabled=false por padrão — nenhuma empresa é afetada até habilitar explicitamente.';
comment on column public.loyalty_settings.points_per_currency_unit is
  'Quantos pontos por R$1 gasto. Configurável — nunca uma regra fixa em código.';
comment on column public.loyalty_settings.grant_on is
  'Quando conceder pontos: completion (padrão, na conclusão da venda) ou full_payment (preparado para o futuro — ainda sem gatilho implementado nesta etapa).';

create trigger loyalty_settings_set_updated_at
  before update on public.loyalty_settings
  for each row execute function public.set_updated_at();

create trigger loyalty_settings_protect_company_id
  before update on public.loyalty_settings
  for each row execute function public.protect_company_id();

alter table public.loyalty_settings enable row level security;

create policy loyalty_settings_select_own_company
  on public.loyalty_settings for select
  using (company_id in (select cm.company_id from public.company_members cm where cm.user_id = auth.uid()));

create policy loyalty_settings_insert_own_company
  on public.loyalty_settings for insert
  with check (company_id in (select cm.company_id from public.company_members cm where cm.user_id = auth.uid()));

create policy loyalty_settings_update_own_company
  on public.loyalty_settings for update
  using (company_id in (select cm.company_id from public.company_members cm where cm.user_id = auth.uid()))
  with check (company_id in (select cm.company_id from public.company_members cm where cm.user_id = auth.uid()));

-- -----------------------------------------------------------------------------
-- 3. loyalty_tier_thresholds — níveis configuráveis por empresa. Nomes e
--    limites (baseados em pontos vitalícios ganhos) totalmente editáveis;
--    nenhuma linha é semeada aqui — a camada de aplicação usa um fallback
--    padrão (Bronze/Prata/Ouro/Platinum) em código quando a empresa ainda
--    não configurou nada, evitando inserir dado "de exemplo" no banco.
-- -----------------------------------------------------------------------------
create table public.loyalty_tier_thresholds (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null check (char_length(btrim(name)) > 0),
  min_lifetime_points integer not null check (min_lifetime_points >= 0),
  sort_order integer not null check (sort_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, sort_order),
  unique (company_id, name)
);

comment on table public.loyalty_tier_thresholds is
  'Níveis de fidelidade configuráveis por empresa. Classificação do cliente é sempre calculada em código a partir de loyalty_accounts.lifetime_points — esta tabela só guarda os limites, nunca o nível já calculado de um cliente.';

create index loyalty_tier_thresholds_company_idx on public.loyalty_tier_thresholds (company_id, sort_order);

create trigger loyalty_tier_thresholds_set_updated_at
  before update on public.loyalty_tier_thresholds
  for each row execute function public.set_updated_at();

create trigger loyalty_tier_thresholds_protect_company_id
  before update on public.loyalty_tier_thresholds
  for each row execute function public.protect_company_id();

alter table public.loyalty_tier_thresholds enable row level security;

create policy loyalty_tier_thresholds_select_own_company
  on public.loyalty_tier_thresholds for select
  using (company_id in (select cm.company_id from public.company_members cm where cm.user_id = auth.uid()));

create policy loyalty_tier_thresholds_insert_own_company
  on public.loyalty_tier_thresholds for insert
  with check (company_id in (select cm.company_id from public.company_members cm where cm.user_id = auth.uid()));

create policy loyalty_tier_thresholds_update_own_company
  on public.loyalty_tier_thresholds for update
  using (company_id in (select cm.company_id from public.company_members cm where cm.user_id = auth.uid()))
  with check (company_id in (select cm.company_id from public.company_members cm where cm.user_id = auth.uid()));

create policy loyalty_tier_thresholds_delete_own_company
  on public.loyalty_tier_thresholds for delete
  using (company_id in (select cm.company_id from public.company_members cm where cm.user_id = auth.uid()));

-- -----------------------------------------------------------------------------
-- 4. loyalty_accounts — 1 linha por cliente. balance é um cache deliberado
--    (nunca fonte única de verdade — sempre reconciliável somando
--    loyalty_transactions.points) que existe por 2 motivos: (a) somar todo
--    o histórico a cada leitura não escala; (b) resgate concorrente exige
--    travar uma linha (FOR UPDATE), o que não é possível sobre uma soma
--    virtual.
--
--    balance PODE ficar negativo, mas só em um cenário específico e
--    inevitável: o cancelamento de uma venda A que gerou pontos, quando
--    esses pontos já foram gastos numa venda B diferente e posterior. Ao
--    cancelar A, os pontos que ela gerou deixam de existir — mas como já
--    viraram desconto em B, não há "de onde tirar" para zerar a reversão
--    sem desfazer B também (o que não faz sentido: B pode já ter sido paga
--    e entregue). Reverter uma venda NUNCA desfaz outra venda.
--    IMPORTANTE: se a mesma venda que gerou pontos também os usou via
--    resgate (dela mesma), a reversão de cancelamento desfaz as DUAS coisas
--    (ganho e resgate) e o efeito líquido é zero — esse caso NÃO gera saldo
--    negativo. Só o cenário entre vendas diferentes é irredutível.
--
--    Enquanto negativo: novos resgates são bloqueados (redeem_loyalty_points
--    exige balance > 0), mas novas compras/ganhos continuam normais e o
--    saldo se recupera naturalmente.
--
--    lifetime_points é o total histórico de pontos genuinamente ganhos
--    (nunca reduzido por resgate/expiração/reversão-de-resgate — só por
--    reversão de um ganho ou ajuste manual negativo) e é a base do cálculo
--    de nível.
-- -----------------------------------------------------------------------------
create table public.loyalty_accounts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  customer_id uuid not null unique references public.customers (id) on delete cascade,
  balance integer not null default 0,
  lifetime_points integer not null default 0 check (lifetime_points >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.loyalty_accounts is
  'Saldo de pontos por cliente (1 linha). balance pode ficar negativo, mas só quando pontos de uma venda cancelada já foram gastos em OUTRA venda (cancelar uma venda nunca desfaz uma venda diferente) — ver nota completa acima da criação da tabela. Enquanto negativo, novos resgates são bloqueados por public.redeem_loyalty_points(), mas novas compras/ganhos continuam normalmente. Nunca gravada diretamente pelo client — só por funções SECURITY DEFINER.';
comment on column public.loyalty_accounts.lifetime_points is
  'Total histórico de pontos genuinamente ganhos — não diminui com resgate nem expiração (resgatar/expirar não rebaixa o nível do cliente). Base do cálculo de nível, sempre em código.';

create index loyalty_accounts_company_idx on public.loyalty_accounts (company_id);

create trigger loyalty_accounts_set_updated_at
  before update on public.loyalty_accounts
  for each row execute function public.set_updated_at();

create trigger loyalty_accounts_protect_company_id
  before update on public.loyalty_accounts
  for each row execute function public.protect_company_id();

alter table public.loyalty_accounts enable row level security;

-- Somente SELECT para o client — toda escrita é feita pelas funções
-- SECURITY DEFINER abaixo, que ignoram RLS pela natureza da própria
-- definição (rodam com o privilégio do dono da função).
create policy loyalty_accounts_select_own_company
  on public.loyalty_accounts for select
  using (company_id in (select cm.company_id from public.company_members cm where cm.user_id = auth.uid()));

-- -----------------------------------------------------------------------------
-- 5. loyalty_transactions — ledger append-only (nunca UPDATE de negócio,
--    nunca DELETE). Único índice único garante, no banco, que uma venda
--    nunca gera pontos duas vezes.
-- -----------------------------------------------------------------------------
create table public.loyalty_transactions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  customer_id uuid not null references public.customers (id) on delete cascade,
  type public.loyalty_transaction_type not null,
  points integer not null check (points <> 0),
  balance_after integer not null,
  source public.loyalty_transaction_source not null,
  reference_type text,
  reference_id uuid,
  reason text,
  performed_by uuid references auth.users (id) on delete set null,
  expires_at timestamptz,
  remaining_points integer not null default 0,
  created_at timestamptz not null default now(),
  constraint loyalty_transactions_reason_required_for_adjustment
    check (type <> 'ajuste' or reason is not null),
  constraint loyalty_transactions_sign_matches_type check (
    (type = 'ganho' and points > 0)
    or (type = 'resgate' and points < 0)
    or (type = 'expirado' and points < 0)
    or (type = 'reversao')
    or (type = 'ajuste')
  ),
  constraint loyalty_transactions_remaining_points_valid check (
    (points > 0 and remaining_points >= 0 and remaining_points <= points)
    or (points < 0 and remaining_points = 0)
  )
);

comment on table public.loyalty_transactions is
  'Ledger imutável de pontos de fidelidade — fonte de verdade real (loyalty_accounts.balance é sempre reconciliável somando esta tabela). Sem policy de UPDATE/DELETE para o client; as poucas colunas mutáveis internamente (remaining_points, para FIFO de resgate/expiração) só são tocadas pelas funções SECURITY DEFINER.';
comment on column public.loyalty_transactions.remaining_points is
  'Quanto deste crédito ainda não foi consumido por resgate/expiração (FIFO) — relevante para QUALQUER transação com points > 0 (ganho, ajuste positivo, ou reversão que devolve pontos resgatados), não só ganho: todo crédito positivo é um "lote" resgatável. Sempre 0 para transações com points < 0 (resgate, ajuste negativo, expiração, reversão que remove um ganho).';
comment on column public.loyalty_transactions.expires_at is
  'Só preenchido em ganho quando loyalty_settings.points_expire=true no momento da concessão. Créditos de ajuste manual e de reversão nunca expiram (null) — só pontos genuinamente ganhos em vendas têm prazo.';

create index loyalty_transactions_company_customer_idx
  on public.loyalty_transactions (company_id, customer_id, created_at desc);
create index loyalty_transactions_type_idx
  on public.loyalty_transactions (company_id, customer_id, type);
create index loyalty_transactions_fifo_idx
  on public.loyalty_transactions (customer_id, expires_at)
  where remaining_points > 0;

-- Proteção contra pontos duplicados: existe no banco, não só na aplicação.
create unique index loyalty_transactions_sale_earn_unique
  on public.loyalty_transactions (reference_id)
  where type = 'ganho' and source = 'sale';

-- Idempotência da reversão: uma transação original (ganho OU resgate) só
-- pode ser revertida uma única vez. Cancelar a mesma venda duas vezes não
-- gera duas reversões — a segunda tentativa não encontra nada pendente de
-- reverter (ver reverse_loyalty_points_for_sale), e esta constraint é a
-- garantia de banco por trás dessa checagem.
create unique index loyalty_transactions_reversal_unique
  on public.loyalty_transactions (reference_id)
  where type = 'reversao';

create trigger loyalty_transactions_protect_company_id
  before update on public.loyalty_transactions
  for each row execute function public.protect_company_id();

alter table public.loyalty_transactions enable row level security;

create policy loyalty_transactions_select_own_company
  on public.loyalty_transactions for select
  using (company_id in (select cm.company_id from public.company_members cm where cm.user_id = auth.uid()));

-- -----------------------------------------------------------------------------
-- 6. loyalty_multipliers — FKs reais (não polimórfico), exatamente um entre
--    product_id/service_id. Categoria fica para uma versão futura.
-- -----------------------------------------------------------------------------
create table public.loyalty_multipliers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  product_id uuid references public.products (id) on delete cascade,
  service_id uuid references public.services (id) on delete cascade,
  multiplier numeric(6, 3) not null check (multiplier >= 0 and multiplier <= 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint loyalty_multipliers_exactly_one_target check (
    (product_id is not null and service_id is null)
    or (product_id is null and service_id is not null)
  ),
  unique (company_id, product_id),
  unique (company_id, service_id)
);

comment on table public.loyalty_multipliers is
  'Multiplicador de pontos por produto OU serviço (nunca ambos). Sem override, o multiplicador efetivo é 1.0. Limite de 100x é proteção contra erro de configuração (ex.: digitar 1000 em vez de 1.0).';

create index loyalty_multipliers_company_idx on public.loyalty_multipliers (company_id);

create trigger loyalty_multipliers_set_updated_at
  before update on public.loyalty_multipliers
  for each row execute function public.set_updated_at();

create trigger loyalty_multipliers_protect_company_id
  before update on public.loyalty_multipliers
  for each row execute function public.protect_company_id();

alter table public.loyalty_multipliers enable row level security;

create policy loyalty_multipliers_select_own_company
  on public.loyalty_multipliers for select
  using (company_id in (select cm.company_id from public.company_members cm where cm.user_id = auth.uid()));

create policy loyalty_multipliers_insert_own_company
  on public.loyalty_multipliers for insert
  with check (company_id in (select cm.company_id from public.company_members cm where cm.user_id = auth.uid()));

create policy loyalty_multipliers_update_own_company
  on public.loyalty_multipliers for update
  using (company_id in (select cm.company_id from public.company_members cm where cm.user_id = auth.uid()))
  with check (company_id in (select cm.company_id from public.company_members cm where cm.user_id = auth.uid()));

create policy loyalty_multipliers_delete_own_company
  on public.loyalty_multipliers for delete
  using (company_id in (select cm.company_id from public.company_members cm where cm.user_id = auth.uid()));

-- -----------------------------------------------------------------------------
-- 7. loyalty_campaigns — multiplicador e/ou bônus fixo, por período.
--    product_id/service_id (no máximo um) permitem alvo futuro por item;
--    nesta etapa, a função de concessão só aplica campanhas de venda
--    inteira (ambos nulos) — ver nota na função grant_loyalty_points_for_sale.
-- -----------------------------------------------------------------------------
create table public.loyalty_campaigns (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null check (char_length(btrim(name)) > 0),
  description text,
  multiplier numeric(6, 3) check (multiplier is null or (multiplier >= 0 and multiplier <= 100)),
  bonus_points integer check (bonus_points is null or bonus_points >= 0),
  product_id uuid references public.products (id) on delete cascade,
  service_id uuid references public.services (id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status public.loyalty_campaign_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint loyalty_campaigns_period_valid check (ends_at > starts_at),
  constraint loyalty_campaigns_has_effect check (multiplier is not null or bonus_points is not null),
  constraint loyalty_campaigns_not_both_targets check (not (product_id is not null and service_id is not null))
);

comment on table public.loyalty_campaigns is
  'Campanhas de pontos por período. Nesta etapa (1C), a concessão de pontos só aplica campanhas com product_id e service_id nulos (venda inteira) — alvo por produto/serviço específico fica documentado para uma etapa futura, para não implementar "campanhas automáticas complexas" agora.';

create index loyalty_campaigns_company_active_idx
  on public.loyalty_campaigns (company_id, starts_at, ends_at)
  where status = 'active';

create trigger loyalty_campaigns_set_updated_at
  before update on public.loyalty_campaigns
  for each row execute function public.set_updated_at();

create trigger loyalty_campaigns_protect_company_id
  before update on public.loyalty_campaigns
  for each row execute function public.protect_company_id();

alter table public.loyalty_campaigns enable row level security;

create policy loyalty_campaigns_select_own_company
  on public.loyalty_campaigns for select
  using (company_id in (select cm.company_id from public.company_members cm where cm.user_id = auth.uid()));

create policy loyalty_campaigns_insert_own_company
  on public.loyalty_campaigns for insert
  with check (company_id in (select cm.company_id from public.company_members cm where cm.user_id = auth.uid()));

create policy loyalty_campaigns_update_own_company
  on public.loyalty_campaigns for update
  using (company_id in (select cm.company_id from public.company_members cm where cm.user_id = auth.uid()))
  with check (company_id in (select cm.company_id from public.company_members cm where cm.user_id = auth.uid()));

create policy loyalty_campaigns_delete_own_company
  on public.loyalty_campaigns for delete
  using (company_id in (select cm.company_id from public.company_members cm where cm.user_id = auth.uid()));

-- =============================================================================
-- 8. Funções SECURITY DEFINER — único caminho de escrita para
--    loyalty_accounts/loyalty_transactions. Mesmo padrão de complete_sale()/
--    cancel_sale() (migration de sales): travam a linha relevante, recalculam
--    tudo a partir de dados reais, nunca confiam no frontend, gravam
--    audit_logs na mesma transação.
-- =============================================================================

-- Concede pontos para uma venda concluída. Chamada pelo trigger abaixo, nunca
-- diretamente pelo client (EXECUTE revogado de authenticated/anon no final).
create or replace function public.grant_loyalty_points_for_sale(p_sale_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_sale public.sales;
  v_settings public.loyalty_settings;
  v_customer public.customers;
  v_item record;
  v_item_multiplier numeric(6, 3);
  v_base_points integer := 0;
  v_campaign_multiplier numeric(6, 3);
  v_campaign_bonus integer;
  v_sale_points integer;
  v_first_purchase_points integer;
  v_birthday_points integer;
  v_total_points integer;
  v_is_first_purchase boolean;
  v_already_birthday_bonused boolean;
  v_existing_id uuid;
  v_expires_at timestamptz;
  v_new_balance integer;
begin
  select * into v_sale from public.sales where id = p_sale_id;
  if v_sale is null or v_sale.customer_id is null then
    return; -- Venda balcão (sem cliente) nunca gera pontos.
  end if;

  select * into v_settings from public.loyalty_settings where company_id = v_sale.company_id;
  if v_settings is null or not v_settings.enabled or v_settings.grant_on <> 'completion' then
    return; -- Fidelidade desabilitada, ou grant_on=full_payment (sem gatilho nesta etapa).
  end if;

  -- Idempotência defensiva além do índice único — evita depender de capturar
  -- uma exceção no fluxo normal. Verifica QUALQUER ganho já registrado para
  -- esta venda (não só source='sale'): a venda pode gerar até 3 linhas
  -- (compra/primeira-compra/aniversário — ver abaixo), e basta uma delas já
  -- existir para sabermos que esta venda já foi processada.
  select id into v_existing_id
    from public.loyalty_transactions
    where reference_id = p_sale_id and type = 'ganho'
    limit 1;
  if v_existing_id is not null then
    return;
  end if;

  select * into v_customer from public.customers where id = v_sale.customer_id;

  for v_item in
    select * from public.sale_items where sale_id = p_sale_id
  loop
    v_item_multiplier := null;
    if v_item.item_type = 'product' and v_item.product_id is not null then
      select multiplier into v_item_multiplier
        from public.loyalty_multipliers
        where company_id = v_sale.company_id and product_id = v_item.product_id;
    elsif v_item.item_type = 'service' and v_item.service_id is not null then
      select multiplier into v_item_multiplier
        from public.loyalty_multipliers
        where company_id = v_sale.company_id and service_id = v_item.service_id;
    end if;

    v_base_points := v_base_points
      + floor(v_item.total_amount * v_settings.points_per_currency_unit * coalesce(v_item_multiplier, 1))::integer;
  end loop;

  -- Campanhas ativas de venda inteira no instante da conclusão (alvo por
  -- item específico fica para uma etapa futura — ver comentário na tabela).
  select coalesce(max(multiplier), 1), coalesce(sum(bonus_points), 0)
    into v_campaign_multiplier, v_campaign_bonus
    from public.loyalty_campaigns
    where company_id = v_sale.company_id
      and status = 'active'
      and product_id is null
      and service_id is null
      and starts_at <= v_sale.completed_at
      and ends_at >= v_sale.completed_at;

  v_sale_points := floor(v_base_points * coalesce(v_campaign_multiplier, 1))::integer + coalesce(v_campaign_bonus, 0);
  v_first_purchase_points := 0;
  v_birthday_points := 0;

  select not exists (
    select 1 from public.sales
    where customer_id = v_sale.customer_id
      and company_id = v_sale.company_id
      and status = 'completed'
      and id <> p_sale_id
  ) into v_is_first_purchase;
  if v_is_first_purchase and v_settings.first_purchase_bonus_points > 0 then
    v_first_purchase_points := v_settings.first_purchase_bonus_points;
  end if;

  -- Bônus de aniversário: registrado como uma linha PRÓPRIA do ledger
  -- (source='birthday', não misturado na linha da compra) — é essa linha
  -- que a checagem "já bonificado este ano" abaixo encontra. Sem uma linha
  -- dedicada, não haveria como saber depois que o bônus já foi concedido,
  -- e ele seria repetido em toda venda feita no dia do aniversário.
  if v_customer.birth_date is not null
     and extract(month from v_customer.birth_date) = extract(month from v_sale.completed_at)
     and extract(day from v_customer.birth_date) = extract(day from v_sale.completed_at)
  then
    select exists (
      select 1 from public.loyalty_transactions
      where customer_id = v_sale.customer_id
        and company_id = v_sale.company_id
        and source = 'birthday'
        and created_at >= date_trunc('year', v_sale.completed_at)
    ) into v_already_birthday_bonused;

    if not v_already_birthday_bonused and v_settings.birthday_bonus_points > 0 then
      v_birthday_points := v_settings.birthday_bonus_points;
    end if;
  end if;

  -- Venda abaixo do mínimo configurado não gera pontos de nenhuma origem
  -- (compra, primeira compra ou aniversário) — é a mesma venda, sem valor
  -- suficiente para qualificar em nenhuma das três.
  if v_sale.total_amount < v_settings.min_purchase_amount_for_points then
    v_sale_points := 0;
    v_first_purchase_points := 0;
    v_birthday_points := 0;
  end if;

  v_total_points := v_sale_points + v_first_purchase_points + v_birthday_points;

  if v_total_points <= 0 then
    return;
  end if;

  insert into public.loyalty_accounts (company_id, customer_id)
    values (v_sale.company_id, v_sale.customer_id)
    on conflict (customer_id) do nothing;

  perform 1 from public.loyalty_accounts where customer_id = v_sale.customer_id for update;

  v_expires_at := case when v_settings.points_expire
    then v_sale.completed_at + make_interval(days => v_settings.points_expire_after_days)
    else null end;

  update public.loyalty_accounts
    set balance = balance + v_total_points,
        lifetime_points = lifetime_points + v_total_points
    where customer_id = v_sale.customer_id
    returning balance into v_new_balance;

  -- Até 3 linhas de ganho para a mesma venda, uma por origem — cada uma
  -- rastreável e resgatável (FIFO) separadamente. v_new_balance já é o
  -- saldo FINAL (depois de somar as 3 origens de uma vez só, acima); o
  -- balance_after de cada linha é esse final menos o que ainda "falta
  -- aplicar" das origens seguintes — nunca soma/subtrai de forma
  -- cumulativa, só calcula cada snapshot a partir do saldo final já
  -- conhecido.
  if v_sale_points > 0 then
    insert into public.loyalty_transactions (
      company_id, customer_id, type, points, balance_after, source,
      reference_type, reference_id, performed_by, expires_at, remaining_points
    ) values (
      v_sale.company_id, v_sale.customer_id, 'ganho', v_sale_points,
      v_new_balance - v_first_purchase_points - v_birthday_points, 'sale',
      'sale', p_sale_id, v_sale.user_id, v_expires_at, v_sale_points
    );
  end if;

  if v_first_purchase_points > 0 then
    insert into public.loyalty_transactions (
      company_id, customer_id, type, points, balance_after, source,
      reference_type, reference_id, performed_by, expires_at, remaining_points
    ) values (
      v_sale.company_id, v_sale.customer_id, 'ganho', v_first_purchase_points,
      v_new_balance - v_birthday_points, 'first_purchase',
      'sale', p_sale_id, v_sale.user_id, v_expires_at, v_first_purchase_points
    );
  end if;

  if v_birthday_points > 0 then
    insert into public.loyalty_transactions (
      company_id, customer_id, type, points, balance_after, source,
      reference_type, reference_id, performed_by, expires_at, remaining_points
    ) values (
      v_sale.company_id, v_sale.customer_id, 'ganho', v_birthday_points, v_new_balance, 'birthday',
      'sale', p_sale_id, v_sale.user_id, v_expires_at, v_birthday_points
    );
  end if;

  insert into public.audit_logs (company_id, actor_user_id, entity_type, entity_id, action, metadata)
  values (
    v_sale.company_id, v_sale.user_id, 'loyalty_account', v_sale.customer_id, 'loyalty.points_earned',
    jsonb_build_object(
      'sale_id', p_sale_id, 'points', v_total_points,
      'sale_points', v_sale_points, 'first_purchase_points', v_first_purchase_points, 'birthday_points', v_birthday_points,
      'balance_after', v_new_balance
    )
  );
end;
$$;

comment on function public.grant_loyalty_points_for_sale(uuid) is
  'Concede pontos de uma venda concluída. Chamada só pelo trigger sales_loyalty_points — EXECUTE revogado de authenticated/anon.';

-- Reverte TUDO que uma venda cancelada fez no ledger de fidelidade: o GANHO
-- (se a venda concluída gerou pontos) e cada RESGATE (se a venda usou pontos
-- como desconto) — nunca só um dos dois. Idempotente: cada transação
-- original só é revertida uma vez (checagem explícita + índice único
-- loyalty_transactions_reversal_unique como garantia de banco); cancelar a
-- mesma venda duas vezes não gera duas reversões, porque cancel_sale() já
-- impede um segundo cancelamento físico (só aceita vendas 'completed'), e
-- mesmo que esta função fosse chamada de novo por qualquer outro motivo,
-- ela não encontraria nada pendente de reverter na segunda vez.
create or replace function public.reverse_loyalty_points_for_sale(p_sale_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_sale public.sales;
  v_ganho public.loyalty_transactions;
  v_resgate record;
  v_already_reversed boolean;
  v_new_balance integer;
  v_credit integer;
begin
  select * into v_sale from public.sales where id = p_sale_id;
  if v_sale is null or v_sale.customer_id is null then
    return;
  end if;

  -- Trava a conta uma única vez: cobre as duas atualizações de saldo
  -- abaixo (ganho e resgate) na mesma transação.
  perform 1 from public.loyalty_accounts where customer_id = v_sale.customer_id for update;

  -- 1) Reverte o GANHO desta venda, se existir e ainda não tiver sido revertido.
  select * into v_ganho
    from public.loyalty_transactions
    where reference_id = p_sale_id and type = 'ganho' and source = 'sale'
    limit 1;

  -- IMPORTANTE: "v_ganho is not null" NÃO funciona aqui — para um tipo
  -- linha/composto, "IS NOT NULL" só é verdadeiro se TODOS os campos forem
  -- não-nulos, e "reason" é sempre null numa linha de ganho (só é
  -- obrigatório em 'ajuste'). Checar um campo escalar sempre-preenchido
  -- (id) evita essa armadilha clássica do PL/pgSQL.
  if v_ganho.id is not null then
    select exists (
      select 1 from public.loyalty_transactions
      where reference_id = v_ganho.id and type = 'reversao'
    ) into v_already_reversed;

    if not v_already_reversed then
      update public.loyalty_accounts
        set balance = balance - v_ganho.points,
            lifetime_points = greatest(0, lifetime_points - v_ganho.points)
        where customer_id = v_sale.customer_id
        returning balance into v_new_balance;

      -- Anula o lote por completo: o que ainda não tinha sido gasto/expirado
      -- deixa de estar disponível para resgate ou expiração futura.
      update public.loyalty_transactions set remaining_points = 0 where id = v_ganho.id;

      insert into public.loyalty_transactions (
        company_id, customer_id, type, points, balance_after, source, reference_type, reference_id, performed_by
      ) values (
        v_sale.company_id, v_sale.customer_id, 'reversao', -v_ganho.points, v_new_balance, 'reversal',
        'loyalty_transaction', v_ganho.id, v_sale.cancelled_by
      );

      insert into public.audit_logs (company_id, actor_user_id, entity_type, entity_id, action, metadata)
      values (
        v_sale.company_id, v_sale.cancelled_by, 'loyalty_account', v_sale.customer_id, 'loyalty.points_reversed',
        jsonb_build_object(
          'sale_id', p_sale_id, 'reversed_transaction_id', v_ganho.id, 'kind', 'earn',
          'points_reversed', v_ganho.points, 'balance_after', v_new_balance
        )
      );
    end if;
  end if;

  -- 2) Reverte cada RESGATE desta venda ainda não revertido — devolve
  -- exatamente os pontos gastos naquela venda, como um novo lote
  -- imediatamente disponível (sem expiração: crédito corretivo, não ganho
  -- genuíno) e sem afetar lifetime_points (resgatar nunca reduziu o nível,
  -- então devolver também não deve alterá-lo).
  for v_resgate in
    select lt.* from public.loyalty_transactions lt
    where lt.reference_id = p_sale_id and lt.type = 'resgate' and lt.source = 'sale'
      and not exists (
        select 1 from public.loyalty_transactions r
        where r.reference_id = lt.id and r.type = 'reversao'
      )
    for update
  loop
    v_credit := -v_resgate.points; -- resgate.points é negativo; o crédito de volta é positivo.

    update public.loyalty_accounts
      set balance = balance + v_credit
      where customer_id = v_sale.customer_id
      returning balance into v_new_balance;

    insert into public.loyalty_transactions (
      company_id, customer_id, type, points, balance_after, source, reference_type, reference_id,
      performed_by, remaining_points
    ) values (
      v_sale.company_id, v_sale.customer_id, 'reversao', v_credit, v_new_balance, 'reversal',
      'loyalty_transaction', v_resgate.id, v_sale.cancelled_by, v_credit
    );

    insert into public.audit_logs (company_id, actor_user_id, entity_type, entity_id, action, metadata)
    values (
      v_sale.company_id, v_sale.cancelled_by, 'loyalty_account', v_sale.customer_id, 'loyalty.points_reversed',
      jsonb_build_object(
        'sale_id', p_sale_id, 'reversed_transaction_id', v_resgate.id, 'kind', 'redeem',
        'points_reversed', v_credit, 'balance_after', v_new_balance
      )
    );
  end loop;
end;
$$;

comment on function public.reverse_loyalty_points_for_sale(uuid) is
  'Reverte o ganho E cada resgate de pontos de uma venda cancelada (nunca só um dos dois), de forma idempotente. Saldo só fica negativo se os pontos ganhos por ESTA venda já tinham sido gastos em OUTRA venda — ver comentário em loyalty_accounts. EXECUTE revogado de authenticated/anon.';

-- Gatilho único que decide QUANDO chamar as funções acima — nunca duplica
-- essa decisão em mais de um lugar. Não altera complete_sale()/cancel_sale()
-- (zero risco de regressão nas funções de Vendas já em produção).
create or replace function public.handle_sale_status_change_for_loyalty()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.status = 'completed' and old.status = 'draft' then
    perform public.grant_loyalty_points_for_sale(new.id);
  elsif new.status = 'cancelled' and old.status = 'completed' then
    perform public.reverse_loyalty_points_for_sale(new.id);
  end if;
  return new;
end;
$$;

create trigger sales_loyalty_points
  after update on public.sales
  for each row
  when (old.status is distinct from new.status)
  execute function public.handle_sale_status_change_for_loyalty();

-- Resgate: única forma de gastar pontos. Roda inteiramente no servidor,
-- trava a conta, valida tudo contra dados reais, aplica o desconto na
-- própria venda (ainda em rascunho) e grava o ledger — tudo atômico.
create or replace function public.redeem_loyalty_points(p_sale_id uuid, p_points integer)
returns numeric
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_sale public.sales;
  v_is_member boolean;
  v_settings public.loyalty_settings;
  v_account public.loyalty_accounts;
  v_current_subtotal numeric(12, 2);
  v_discount numeric(12, 2);
  v_max_discount numeric(12, 2);
  v_new_balance integer;
  v_remaining_to_consume integer;
  v_lot record;
  v_consume integer;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.';
  end if;

  if p_points is null or p_points <= 0 then
    raise exception 'Informe uma quantidade de pontos válida.';
  end if;

  select * into v_sale from public.sales where id = p_sale_id for update;
  if v_sale is null then
    raise exception 'Venda não encontrada.';
  end if;

  select exists (
    select 1 from public.company_members cm
    where cm.company_id = v_sale.company_id and cm.user_id = auth.uid()
  ) into v_is_member;
  if not v_is_member then
    raise exception 'Você não tem acesso a esta venda.';
  end if;

  if v_sale.status <> 'draft' then
    raise exception 'Só é possível usar pontos em uma venda ainda em rascunho.';
  end if;

  if v_sale.customer_id is null then
    raise exception 'Selecione um cliente para usar pontos de fidelidade.';
  end if;

  select * into v_settings from public.loyalty_settings where company_id = v_sale.company_id;
  if v_settings is null or not v_settings.enabled then
    raise exception 'A fidelidade não está habilitada para esta empresa.';
  end if;

  if p_points < v_settings.min_points_to_redeem then
    raise exception 'Quantidade mínima de pontos para resgate: %.', v_settings.min_points_to_redeem;
  end if;

  select * into v_account
    from public.loyalty_accounts
    where customer_id = v_sale.customer_id
    for update;

  if v_account is null or v_account.balance <= 0 then
    raise exception 'Saldo de pontos insuficiente.';
  end if;

  if p_points > v_account.balance then
    raise exception 'Saldo insuficiente: disponível %, solicitado %.', v_account.balance, p_points;
  end if;

  v_discount := round(p_points * v_settings.redemption_value_per_point, 2);

  if v_settings.max_redeem_percent_per_sale is not null then
    -- sales.subtotal só é calculado por complete_sale() na conclusão —
    -- durante o rascunho (única fase em que resgate é permitido) essa
    -- coluna ainda não reflete os itens já adicionados. Recalcula aqui a
    -- partir de sale_items, mesmo padrão de complete_sale().
    select coalesce(sum(total_amount), 0) into v_current_subtotal
      from public.sale_items where sale_id = p_sale_id;
    v_max_discount := round(v_current_subtotal * v_settings.max_redeem_percent_per_sale / 100, 2);
    if v_discount > v_max_discount then
      raise exception 'O desconto por pontos não pode exceder % por cento do valor da venda.', v_settings.max_redeem_percent_per_sale;
    end if;
  end if;

  -- Consome qualquer crédito positivo disponível (ganho, ajuste positivo,
  -- ou reversão que devolveu um resgate) — todos são "lotes" resgatáveis,
  -- não só ganho. Lotes que expiram em breve são consumidos primeiro;
  -- créditos sem expiração (ajuste/reversão) ficam por último.
  v_remaining_to_consume := p_points;
  for v_lot in
    select id, remaining_points
      from public.loyalty_transactions
      where customer_id = v_sale.customer_id
        and remaining_points > 0
        and (expires_at is null or expires_at > now())
      order by (expires_at is null), expires_at asc, created_at asc
      for update
  loop
    exit when v_remaining_to_consume <= 0;
    v_consume := least(v_lot.remaining_points, v_remaining_to_consume);
    update public.loyalty_transactions
      set remaining_points = remaining_points - v_consume
      where id = v_lot.id;
    v_remaining_to_consume := v_remaining_to_consume - v_consume;
  end loop;

  if v_remaining_to_consume > 0 then
    raise exception 'Inconsistência no saldo de fidelidade — contate o suporte.';
  end if;

  update public.loyalty_accounts
    set balance = balance - p_points
    where customer_id = v_sale.customer_id
    returning balance into v_new_balance;

  insert into public.loyalty_transactions (
    company_id, customer_id, type, points, balance_after, source, reference_type, reference_id, performed_by
  ) values (
    v_sale.company_id, v_sale.customer_id, 'resgate', -p_points, v_new_balance, 'sale', 'sale', p_sale_id, auth.uid()
  );

  update public.sales
    set discount_amount = discount_amount + v_discount,
        loyalty_points_redeemed = loyalty_points_redeemed + p_points,
        loyalty_discount_amount = loyalty_discount_amount + v_discount
    where id = p_sale_id;

  insert into public.audit_logs (company_id, actor_user_id, entity_type, entity_id, action, metadata)
  values (
    v_sale.company_id, auth.uid(), 'loyalty_account', v_sale.customer_id, 'loyalty.points_redeemed',
    jsonb_build_object('sale_id', p_sale_id, 'points', p_points, 'discount_amount', v_discount, 'balance_after', v_new_balance)
  );

  return v_discount;
end;
$$;

comment on function public.redeem_loyalty_points(uuid, integer) is
  'Resgata pontos como desconto em uma venda em rascunho. Trava loyalty_accounts, valida saldo/mínimo/limite percentual, consome lotes FIFO, aplica o desconto na venda — tudo atômico. Chamável pelo client autenticado.';

-- Ajuste manual — único caminho para owner/admin creditar/debitar pontos
-- fora do fluxo de vendas. Motivo obrigatório, auditoria obrigatória.
create or replace function public.adjust_loyalty_points(p_customer_id uuid, p_points integer, p_reason text)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_customer public.customers;
  v_role public.company_role;
  v_new_balance integer;
  v_remaining_points integer;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.';
  end if;

  if p_points is null or p_points = 0 then
    raise exception 'Informe uma quantidade de pontos diferente de zero.';
  end if;

  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'Informe o motivo do ajuste.';
  end if;

  select * into v_customer from public.customers where id = p_customer_id;
  if v_customer is null then
    raise exception 'Cliente não encontrado.';
  end if;

  select cm.role into v_role
    from public.company_members cm
    where cm.company_id = v_customer.company_id and cm.user_id = auth.uid();

  if v_role is null or v_role not in ('owner', 'admin') then
    raise exception 'Apenas owner/admin podem ajustar pontos manualmente.';
  end if;

  insert into public.loyalty_accounts (company_id, customer_id)
    values (v_customer.company_id, p_customer_id)
    on conflict (customer_id) do nothing;

  perform 1 from public.loyalty_accounts where customer_id = p_customer_id for update;

  update public.loyalty_accounts
    set balance = balance + p_points,
        lifetime_points = greatest(0, lifetime_points + p_points)
    where customer_id = p_customer_id
    returning balance into v_new_balance;

  -- Ajuste positivo vira um lote resgatável (como um ganho), sem expiração
  -- (crédito corretivo). Ajuste negativo não é lote (remaining_points=0).
  v_remaining_points := case when p_points > 0 then p_points else 0 end;

  insert into public.loyalty_transactions (
    company_id, customer_id, type, points, balance_after, source, reason, performed_by, remaining_points
  ) values (
    v_customer.company_id, p_customer_id, 'ajuste', p_points, v_new_balance, 'manual', p_reason, auth.uid(), v_remaining_points
  );

  insert into public.audit_logs (company_id, actor_user_id, entity_type, entity_id, action, metadata)
  values (
    v_customer.company_id, auth.uid(), 'loyalty_account', p_customer_id, 'loyalty.points_adjusted',
    jsonb_build_object('points', p_points, 'reason', p_reason, 'balance_after', v_new_balance)
  );

  return v_new_balance;
end;
$$;

comment on function public.adjust_loyalty_points(uuid, integer, text) is
  'Ajuste manual de pontos — só owner/admin (checado dentro da função, já que SECURITY DEFINER ignora RLS). Motivo obrigatório. Chamável pelo client autenticado.';

-- Expiração — arquitetura pronta (FIFO por lote via remaining_points/
-- expires_at), mas SEM cron/agendamento nesta etapa, conforme instruído.
-- Varre todas as empresas (uso pensado para um job futuro com privilégio
-- elevado) — por isso nunca é exposta a authenticated/anon.
create or replace function public.expire_loyalty_points_batch()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_lot record;
  v_count integer := 0;
  v_new_balance integer;
begin
  for v_lot in
    select * from public.loyalty_transactions
    where type = 'ganho' and remaining_points > 0 and expires_at is not null and expires_at <= now()
    for update
  loop
    perform 1 from public.loyalty_accounts where customer_id = v_lot.customer_id for update;

    update public.loyalty_accounts
      set balance = balance - v_lot.remaining_points
      where customer_id = v_lot.customer_id
      returning balance into v_new_balance;

    insert into public.loyalty_transactions (
      company_id, customer_id, type, points, balance_after, source, reference_type, reference_id
    ) values (
      v_lot.company_id, v_lot.customer_id, 'expirado', -v_lot.remaining_points, v_new_balance, 'expiration',
      'loyalty_transaction', v_lot.id
    );

    insert into public.audit_logs (company_id, actor_user_id, entity_type, entity_id, action, metadata)
    values (
      v_lot.company_id, null, 'loyalty_account', v_lot.customer_id, 'loyalty.points_expired',
      jsonb_build_object('lot_id', v_lot.id, 'points_expired', v_lot.remaining_points, 'balance_after', v_new_balance)
    );

    update public.loyalty_transactions set remaining_points = 0 where id = v_lot.id;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

comment on function public.expire_loyalty_points_batch() is
  'Expira lotes de ganho vencidos (FIFO), em todas as empresas. Arquitetura pronta para um job agendado futuro — NÃO é chamada por nenhum cron/trigger nesta etapa. Nunca exposta via RPC (EXECUTE revogado de authenticated/anon).';

-- -----------------------------------------------------------------------------
-- 9. Permissões de execução — funções internas nunca chamáveis via RPC pelo
--    client; só as duas de uso direto (resgate, ajuste) ficam liberadas.
-- -----------------------------------------------------------------------------
revoke execute on function public.grant_loyalty_points_for_sale(uuid) from public, anon, authenticated;
revoke execute on function public.reverse_loyalty_points_for_sale(uuid) from public, anon, authenticated;
revoke execute on function public.expire_loyalty_points_batch() from public, anon, authenticated;

-- REVOKE explícito de anon é necessário aqui: este projeto Supabase tem um
-- DEFAULT PRIVILEGE que concede EXECUTE diretamente a anon/authenticated/
-- service_role em toda função nova no schema public (não é um grant via
-- PUBLIC — "revoke ... from public" não o remove). Sem este revoke,
-- redeem_loyalty_points/adjust_loyalty_points ficariam chamáveis por um
-- usuário não autenticado via RPC (a função rejeitaria internamente por
-- auth.uid() is null, mas a exposição em si é desnecessária).
revoke execute on function public.redeem_loyalty_points(uuid, integer) from anon;
revoke execute on function public.adjust_loyalty_points(uuid, integer, text) from anon;
grant execute on function public.redeem_loyalty_points(uuid, integer) to authenticated;
grant execute on function public.adjust_loyalty_points(uuid, integer, text) to authenticated;
