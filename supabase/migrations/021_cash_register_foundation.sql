-- FASE 4 — Módulo Caixa (fundação de schema).
--
-- *** MIGRATION CRIADA, MAS NÃO APLICADA — aguardando confirmação explícita
-- antes de rodar contra o banco de produção (única base existente, sem
-- staging separado), conforme instrução explícita desta fase. ***
--
-- Decisões de negócio já confirmadas pelo usuário antes desta migration
-- (ver relatório "Fase 4A/4B — Auditoria e Arquitetura do Caixa"):
--   1) Um único caixa ABERTO por empresa por vez.
--   2) MVP inclui lançamentos manuais (sangria/suprimento/despesa avulsa),
--      não só automáticos.
--   3) Todos os métodos de pagamento (cash/pix/debit/credit) contam como
--      entrada no caixa — o saldo em espécie é um subtotal calculado
--      filtrando method='cash'.
--   4) Owner/admin abrem, fecham e lançam manualmente; employee só
--      visualiza (enforced nas funções abaixo, nunca só no frontend).
--
-- Decisões técnicas derivadas diretamente das decisões acima (documentadas
-- para revisão, não são novas invenções de regra de negócio):
--   a) Cada `sale_payments` que vira 'paid' gera UMA movimentação de caixa
--      (não uma por venda) — é o único jeito de manter o `method` de cada
--      pagamento rastreável no caixa quando uma venda usa formas de
--      pagamento diferentes.
--   b) Se não houver caixa aberto no momento em que um pagamento de venda
--      é confirmado, a venda/pagamento NÃO é bloqueado (Vendas continua
--      funcionando exatamente como hoje) — o pagamento simplesmente não
--      gera lançamento de caixa. Bloquear Vendas por causa do Caixa seria
--      alterar o comportamento de um módulo já estável sem necessidade
--      direta pedida nesta fase.
--   c) A diferença de fechamento (esperado vs. informado) é sempre sobre o
--      saldo EM ESPÉCIE — é o único componente fisicamente conferível;
--      Pix/débito/crédito entram no resumo do período, não na conferência
--      de gaveta.
--   d) Cancelamento de venda (`cancel_sale`) NÃO gera nenhuma movimentação
--      automática de estorno no caixa nesta primeira versão — o sistema
--      não tem refund financeiro real (`cancel_sale` nunca tocou
--      `sale_payments`, confirmado em auditorias anteriores), e fingir uma
--      "saída de estorno" automática criaria uma movimentação de caixa sem
--      um pagamento real sendo de fato devolvido. Fica registrado como
--      limitação conhecida, não resolvida por este módulo.
--   e) Sem tolerância de diferença de fechamento (toda diferença é
--      registrada) e sem reabertura de caixa fechado nesta versão.
--
-- ============================================================
-- 1. TIPOS (enums)
-- ============================================================
-- Reaproveita public.sale_payment_method (cash/pix/debit/credit/other) já
-- existente para o campo `method` das movimentações — é exatamente a
-- mesma estrutura de forma de pagamento que Vendas já usa, sem duplicar.

create type public.cash_register_status as enum ('open', 'closed');
create type public.cash_movement_direction as enum ('in', 'out');
create type public.cash_movement_source as enum ('sale_payment', 'manual');

-- ============================================================
-- 2. TABELA cash_registers — um turno/sessão de caixa
-- ============================================================
create table public.cash_registers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  status public.cash_register_status not null default 'open',

  opened_by uuid not null references auth.users(id),
  opened_at timestamptz not null default now(),
  opening_balance numeric(12, 2) not null default 0,

  closed_by uuid references auth.users(id),
  closed_at timestamptz,
  -- Calculado no fechamento: opening_balance + entradas em dinheiro -
  -- saídas em dinheiro (nunca inclui Pix/débito/crédito — ver decisão c).
  expected_cash_balance numeric(12, 2),
  -- O que o operador contou fisicamente na gaveta.
  informed_cash_balance numeric(12, 2),
  -- informed - expected. Nunca "tolerado" automaticamente (decisão e).
  cash_difference numeric(12, 2),

  notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint cash_registers_opening_balance_non_negative check (opening_balance >= 0),
  constraint cash_registers_informed_balance_non_negative check (informed_cash_balance is null or informed_cash_balance >= 0),
  constraint cash_registers_closed_after_opened check (closed_at is null or closed_at >= opened_at),
  -- Todos os campos de fechamento nascem e morrem juntos: um caixa 'open'
  -- nunca tem nenhum deles preenchido; um 'closed' sempre tem todos os
  -- três valores calculados (nunca um fechamento "pela metade").
  constraint cash_registers_closed_fields_consistent check (
    (status = 'open' and closed_by is null and closed_at is null
      and expected_cash_balance is null and informed_cash_balance is null and cash_difference is null)
    or
    (status = 'closed' and closed_by is not null and closed_at is not null
      and expected_cash_balance is not null and informed_cash_balance is not null and cash_difference is not null)
  )
);

comment on table public.cash_registers is
  'Um caixa único por empresa por vez (decisão de negócio confirmada) — cada linha é um turno/sessão de abertura-até-fechamento. Histórico nunca é apagado; "reabrir" um caixa fechado não é suportado nesta versão.';

-- Garantia definitiva (não só a checagem em código dentro do RPC abaixo):
-- nunca mais de um caixa 'open' por empresa, sob qualquer concorrência,
-- porque é o próprio índice único que rejeita a segunda linha — mesmo
-- padrão de defesa em profundidade já usado para min_lifetime_points de
-- fidelidade (migration 020: constraint no banco, não só lock).
create unique index cash_registers_one_open_per_company
  on public.cash_registers (company_id)
  where (status = 'open');

create index cash_registers_company_id_idx on public.cash_registers (company_id);

create trigger cash_registers_set_updated_at
  before update on public.cash_registers
  for each row execute function public.set_updated_at();

create trigger cash_registers_protect_company_id
  before update on public.cash_registers
  for each row execute function public.protect_company_id();

-- ============================================================
-- 3. TABELA cash_movements — cada entrada/saída, imutável
-- ============================================================
create table public.cash_movements (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  cash_register_id uuid not null references public.cash_registers(id) on delete cascade,

  direction public.cash_movement_direction not null,
  amount numeric(12, 2) not null,
  method public.sale_payment_method not null,
  description text not null,

  -- Origem: distingue lançamento automático (de um pagamento de venda) de
  -- manual (sangria/suprimento/despesa avulsa) — essencial para a UI
  -- diferenciar os dois e para nunca permitir editar/duplicar um
  -- automático manualmente.
  source public.cash_movement_source not null,
  -- Referência opcional (só preenchida quando source='sale_payment').
  -- ON DELETE CASCADE de propósito: o único caso em que um sale_payments
  -- é apagado é a correção de corrida em addSalePaymentAction
  -- (confirmPaymentWithinBalance, que apaga um pagamento que estourou o
  -- limite da venda) — se o pagamento nunca deveria ter existido, o
  -- lançamento de caixa correspondente também não deve sobreviver.
  sale_payment_id uuid references public.sale_payments(id) on delete cascade,

  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),

  constraint cash_movements_amount_positive check (amount > 0),
  constraint cash_movements_description_not_blank check (char_length(trim(description)) > 0),
  constraint cash_movements_source_reference_consistent check (
    (source = 'sale_payment' and sale_payment_id is not null)
    or
    (source = 'manual' and sale_payment_id is null)
  )
);

comment on table public.cash_movements is
  'Movimentações de caixa, imutáveis (sem policy de UPDATE/DELETE para authenticated — mesmo padrão de sales/sale_payments: correção é sempre um novo registro, nunca uma edição retroativa). direction (in/out) controla o sinal do efeito no saldo, nunca o sinal de `amount`, que é sempre positivo.';

-- Idempotência real: um mesmo sale_payment nunca gera mais de uma
-- movimentação, mesmo se o trigger disparasse mais de uma vez (ex.: um
-- futuro UPDATE que "reafirme" status='paid').
create unique index cash_movements_sale_payment_unique
  on public.cash_movements (sale_payment_id)
  where (sale_payment_id is not null);

create index cash_movements_cash_register_id_idx on public.cash_movements (cash_register_id);
create index cash_movements_company_id_idx on public.cash_movements (company_id);
create index cash_movements_created_at_idx on public.cash_movements (created_at);

create trigger cash_movements_protect_company_id
  before update on public.cash_movements
  for each row execute function public.protect_company_id();

-- ============================================================
-- 4. RLS
-- ============================================================
alter table public.cash_registers enable row level security;
alter table public.cash_movements enable row level security;

-- SELECT: qualquer membro da empresa, incluindo employee (decisão 4:
-- employee só visualiza, nunca abre/fecha/lança).
create policy "cash_registers_select_own_company"
  on public.cash_registers
  for select
  to authenticated
  using (company_id in (select cm.company_id from public.company_members cm where cm.user_id = auth.uid()));

create policy "cash_movements_select_own_company"
  on public.cash_movements
  for select
  to authenticated
  using (company_id in (select cm.company_id from public.company_members cm where cm.user_id = auth.uid()));

-- Nenhuma policy de INSERT/UPDATE/DELETE para `authenticated` em nenhuma
-- das duas tabelas, de propósito: todo write passa exclusivamente pelas
-- funções SECURITY DEFINER da seção 5, que verificam owner/admin
-- internamente antes de qualquer escrita. Mesmo padrão de
-- payment_events/company_entitlements (billing), que também não têm
-- policy de INSERT para authenticated. Isso é reforço de backend real,
-- não apenas esconder o botão no frontend.

-- ============================================================
-- 5. FUNÇÕES (RPCs SECURITY DEFINER)
-- ============================================================

-- 5.1 Abertura — trava por empresa (advisory lock) + índice único parcial
-- como garantia definitiva. auth.uid() sempre resolve a empresa e o papel
-- do próprio chamador; nada disso é aceito como parâmetro do cliente.
create or replace function public.open_cash_register(
  p_opening_balance numeric,
  p_notes text default null
)
returns public.cash_registers
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_user_id uuid := auth.uid();
  v_company_id uuid;
  v_role public.company_role;
  v_register public.cash_registers;
begin
  if v_user_id is null then
    raise exception 'Usuário não autenticado.';
  end if;

  select cm.company_id, cm.role into v_company_id, v_role
    from public.company_members cm where cm.user_id = v_user_id;

  if v_company_id is null then
    raise exception 'Nenhuma empresa encontrada para o usuário atual.';
  end if;

  if v_role not in ('owner', 'admin') then
    raise exception 'Apenas owner/admin podem abrir o caixa.';
  end if;

  if p_opening_balance is null or p_opening_balance < 0 then
    raise exception 'O saldo inicial não pode ser negativo.';
  end if;

  -- Serializa aberturas concorrentes da mesma empresa (duas abas, duplo
  -- clique). O índice único parcial (seção 2) é a garantia definitiva
  -- mesmo sem este lock — ele só evita uma violação de constraint crua no
  -- caso comum, devolvendo a mensagem amigável abaixo.
  perform pg_advisory_xact_lock(hashtext(v_company_id::text || ':cash_register'));

  if exists (
    select 1 from public.cash_registers where company_id = v_company_id and status = 'open'
  ) then
    raise exception 'Já existe um caixa aberto para esta empresa.';
  end if;

  insert into public.cash_registers (company_id, opened_by, opening_balance, notes)
  values (v_company_id, v_user_id, p_opening_balance, p_notes)
  returning * into v_register;

  insert into public.audit_logs (company_id, actor_user_id, entity_type, entity_id, action, metadata)
  values (
    v_company_id, v_user_id, 'cash_register', v_register.id, 'cash_register.opened',
    jsonb_build_object('opening_balance', p_opening_balance)
  );

  return v_register;
end;
$$;

comment on function public.open_cash_register(numeric, text) is
  'Abre um novo caixa para a empresa do usuário autenticado. Só owner/admin. Protegido contra corrida por advisory lock + índice único parcial (garantia definitiva). Nunca aceita company_id do cliente — sempre resolvido a partir de auth.uid().';

-- 5.2 Fechamento — trava a linha do caixa (FOR UPDATE), não só a empresa,
-- porque a operação já identifica o registro exato pelo id.
create or replace function public.close_cash_register(
  p_cash_register_id uuid,
  p_informed_cash_balance numeric,
  p_notes text default null
)
returns public.cash_registers
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_user_id uuid := auth.uid();
  v_role public.company_role;
  v_register public.cash_registers;
  v_cash_in numeric(12, 2);
  v_cash_out numeric(12, 2);
  v_expected numeric(12, 2);
begin
  if v_user_id is null then
    raise exception 'Usuário não autenticado.';
  end if;

  -- Trava a linha: uma segunda chamada concorrente de fechamento do MESMO
  -- caixa espera aqui e, ao continuar, já vê status='closed' — nunca as
  -- duas conseguem fechar "ao mesmo tempo".
  select * into v_register from public.cash_registers where id = p_cash_register_id for update;
  if v_register is null then
    raise exception 'Caixa não encontrado.';
  end if;

  select cm.role into v_role
    from public.company_members cm
    where cm.company_id = v_register.company_id and cm.user_id = v_user_id;

  if v_role is null then
    raise exception 'Você não tem acesso a este caixa.';
  end if;

  if v_role not in ('owner', 'admin') then
    raise exception 'Apenas owner/admin podem fechar o caixa.';
  end if;

  if v_register.status <> 'open' then
    raise exception 'Este caixa já está fechado.';
  end if;

  if p_informed_cash_balance is null or p_informed_cash_balance < 0 then
    raise exception 'O saldo informado não pode ser negativo.';
  end if;

  -- Só dinheiro entra na conferência de fechamento (decisão c) — Pix,
  -- débito e cartão não passam pela gaveta física.
  select coalesce(sum(amount), 0) into v_cash_in
    from public.cash_movements
    where cash_register_id = p_cash_register_id and direction = 'in' and method = 'cash';

  select coalesce(sum(amount), 0) into v_cash_out
    from public.cash_movements
    where cash_register_id = p_cash_register_id and direction = 'out' and method = 'cash';

  v_expected := v_register.opening_balance + v_cash_in - v_cash_out;

  update public.cash_registers
    set status = 'closed',
        closed_by = v_user_id,
        closed_at = now(),
        expected_cash_balance = v_expected,
        informed_cash_balance = p_informed_cash_balance,
        cash_difference = p_informed_cash_balance - v_expected,
        notes = coalesce(p_notes, notes)
    where id = p_cash_register_id
    returning * into v_register;

  insert into public.audit_logs (company_id, actor_user_id, entity_type, entity_id, action, metadata)
  values (
    v_register.company_id, v_user_id, 'cash_register', v_register.id, 'cash_register.closed',
    jsonb_build_object(
      'expected_cash_balance', v_expected,
      'informed_cash_balance', p_informed_cash_balance,
      'cash_difference', p_informed_cash_balance - v_expected
    )
  );

  return v_register;
end;
$$;

comment on function public.close_cash_register(uuid, numeric, text) is
  'Fecha um caixa aberto, calculando o saldo esperado em espécie (opening_balance + entradas em dinheiro - saídas em dinheiro) e a diferença contra o saldo informado. Trava a linha (FOR UPDATE) para impedir fechamento duplo concorrente. Só owner/admin. Sem tolerância de diferença nem reabertura (decisão e).';

-- 5.3 Lançamento manual — exige caixa aberto; nunca cria um novo caixa.
create or replace function public.create_cash_movement(
  p_direction public.cash_movement_direction,
  p_amount numeric,
  p_method public.sale_payment_method,
  p_description text
)
returns public.cash_movements
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_user_id uuid := auth.uid();
  v_company_id uuid;
  v_role public.company_role;
  v_register_id uuid;
  v_movement public.cash_movements;
begin
  if v_user_id is null then
    raise exception 'Usuário não autenticado.';
  end if;

  select cm.company_id, cm.role into v_company_id, v_role
    from public.company_members cm where cm.user_id = v_user_id;

  if v_company_id is null then
    raise exception 'Nenhuma empresa encontrada para o usuário atual.';
  end if;

  if v_role not in ('owner', 'admin') then
    raise exception 'Apenas owner/admin podem lançar movimentações manuais.';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'O valor deve ser maior que zero.';
  end if;

  if p_description is null or char_length(trim(p_description)) = 0 then
    raise exception 'Informe uma descrição para a movimentação.';
  end if;

  -- Trava a linha do caixa aberto (se existir) antes de decidir — mesma
  -- técnica de complete_sale/cancel_sale.
  select id into v_register_id
    from public.cash_registers
    where company_id = v_company_id and status = 'open'
    for update;

  if v_register_id is null then
    raise exception 'Não há caixa aberto. Abra o caixa antes de lançar movimentações.';
  end if;

  insert into public.cash_movements (
    company_id, cash_register_id, direction, amount, method, description, source, created_by
  ) values (
    v_company_id, v_register_id, p_direction, p_amount, p_method, trim(p_description), 'manual', v_user_id
  )
  returning * into v_movement;

  insert into public.audit_logs (company_id, actor_user_id, entity_type, entity_id, action, metadata)
  values (
    v_company_id, v_user_id, 'cash_movement', v_movement.id, 'cash_movement.created',
    jsonb_build_object('direction', p_direction, 'amount', p_amount, 'method', p_method, 'source', 'manual')
  );

  return v_movement;
end;
$$;

comment on function public.create_cash_movement(public.cash_movement_direction, numeric, public.sale_payment_method, text) is
  'Lançamento manual de entrada/saída (sangria, suprimento, despesa avulsa). Só owner/admin, só com caixa aberto. Nunca aceita cash_register_id do cliente — sempre resolve o caixa aberto da empresa do próprio chamador.';

-- 5.4 Gatilho automático — cada sale_payments que fica 'paid' gera UMA
-- movimentação (decisão técnica "a" do cabeçalho). Roda dentro da mesma
-- transação de addSalePaymentAction, herdando qualquer trava que já
-- exista ali; não bloqueia a venda se não houver caixa aberto (decisão
-- técnica "b").
create or replace function public.create_cash_movement_from_sale_payment()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_register_id uuid;
  v_created_by uuid;
begin
  if new.status <> 'paid' then
    return new;
  end if;

  -- Só reage à TRANSIÇÃO para 'paid', nunca a um UPDATE que apenas
  -- reafirma um status que já era 'paid' (ex.: um futuro UPDATE de notes).
  if tg_op = 'UPDATE' and old.status = 'paid' then
    return new;
  end if;

  select id into v_register_id
    from public.cash_registers
    where company_id = new.company_id and status = 'open'
    for update;

  if v_register_id is null then
    -- Nenhum caixa aberto: a venda/pagamento prossegue normalmente (não é
    -- responsabilidade deste trigger impedir Vendas de funcionar) — só não
    -- gera lançamento. Fica "fora do caixa", reconciliável olhando Vendas.
    return new;
  end if;

  v_created_by := coalesce(auth.uid(), (select s.user_id from public.sales s where s.id = new.sale_id));

  insert into public.cash_movements (
    company_id, cash_register_id, direction, amount, method, description, source, sale_payment_id, created_by
  ) values (
    new.company_id, v_register_id, 'in', new.amount, new.method,
    'Pagamento de venda', 'sale_payment', new.id, v_created_by
  )
  on conflict (sale_payment_id) where sale_payment_id is not null do nothing;

  return new;
end;
$$;

comment on function public.create_cash_movement_from_sale_payment() is
  'Trigger em sale_payments: cada pagamento que vira paid gera uma movimentação de entrada no caixa aberto da empresa, se houver um. Idempotente via cash_movements_sale_payment_unique — nunca duplica mesmo sob reexecução.';

drop trigger if exists sale_payments_create_cash_movement on public.sale_payments;
create trigger sale_payments_create_cash_movement
  after insert or update of status on public.sale_payments
  for each row
  execute function public.create_cash_movement_from_sale_payment();

-- ============================================================
-- 6. GRANTS
-- ============================================================
-- As três RPCs são chamadas diretamente pelo cliente autenticado (não são
-- restritas a service_role, diferente de confirm_subscription_payment,
-- que é acionada só pelo webhook/admin client) — a autorização real (só
-- owner/admin) já está dentro de cada função.
revoke all on function public.open_cash_register(numeric, text) from public;
revoke all on function public.open_cash_register(numeric, text) from anon;
grant execute on function public.open_cash_register(numeric, text) to authenticated;

revoke all on function public.close_cash_register(uuid, numeric, text) from public;
revoke all on function public.close_cash_register(uuid, numeric, text) from anon;
grant execute on function public.close_cash_register(uuid, numeric, text) to authenticated;

revoke all on function public.create_cash_movement(public.cash_movement_direction, numeric, public.sale_payment_method, text) from public;
revoke all on function public.create_cash_movement(public.cash_movement_direction, numeric, public.sale_payment_method, text) from anon;
grant execute on function public.create_cash_movement(public.cash_movement_direction, numeric, public.sale_payment_method, text) to authenticated;
