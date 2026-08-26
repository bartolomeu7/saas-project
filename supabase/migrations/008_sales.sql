-- =============================================================================
-- Migration: 008_sales.sql
-- Descrição: FASE 4 (Vendas + Itens + Pagamentos) — integração real entre
--            Clientes, Produtos e Serviços. Puramente aditiva: nenhuma
--            tabela existente (profiles, companies, company_members,
--            customers, audit_logs, customer_raffles,
--            customer_raffle_entries, product_categories, products,
--            service_categories, services) é alterada, e nenhuma
--            migration já aplicada é reexecutada.
--
-- Tabelas novas:
--   - sales: a venda (transação). Cliente opcional (venda balcão).
--   - sale_items: itens da venda — produto OU serviço, nunca ambos, com
--     snapshot de descrição/preço/custo no momento da venda (nunca
--     depende do catálogo para reconstruir uma venda histórica).
--   - sale_payments: pagamentos registrados para a venda (suporta mais
--     de um pagamento por venda desde já, mesmo que a UI desta fase
--     comece com um só).
--
-- Reaproveita as funções já criadas em migrations anteriores:
--   - public.set_updated_at() (migration 001)
--   - public.protect_company_id() (migration 006)
--
-- Funções novas (SECURITY DEFINER, escopo mínimo e deliberado — ver
-- seção 5 abaixo): public.complete_sale() e public.cancel_sale().
--
-- Baixa/restauração de estoque: atômica via UPDATE ... WHERE
-- stock_quantity >= quantity, nunca SELECT+UPDATE separados (protege
-- contra concorrência — duas vendas simultâneas do último item em
-- estoque nunca deixam stock_quantity negativo).
--
-- Margem (estimated_margin) é a única métrica derivada armazenada em
-- `sales`, por ser cara de recalcular via agregação de sale_items a
-- cada listagem; a % de margem nunca é armazenada — sempre calculada em
-- código a partir de estimated_margin/total_amount, mesmo padrão de
-- calculateMargin() usado em Produtos/Serviços.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Enums
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'sale_status') then
    create type public.sale_status as enum ('draft', 'completed', 'cancelled');
  end if;

  if not exists (select 1 from pg_type where typname = 'sale_payment_status') then
    create type public.sale_payment_status as enum ('pending', 'paid', 'cancelled', 'refunded');
  end if;

  if not exists (select 1 from pg_type where typname = 'sale_item_type') then
    create type public.sale_item_type as enum ('product', 'service');
  end if;

  if not exists (select 1 from pg_type where typname = 'sale_payment_method') then
    create type public.sale_payment_method as enum ('cash', 'pix', 'debit', 'credit', 'other');
  end if;
end
$$;

-- -----------------------------------------------------------------------------
-- 2. Tabela sales
-- -----------------------------------------------------------------------------
create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  -- Venda balcão: cliente é opcional de propósito (mercadinho, padaria,
  -- lanchonete). RESTRICT: nunca apaga cliente com venda vinculada (de
  -- qualquer forma clientes não têm exclusão física no sistema).
  customer_id uuid references public.customers (id) on delete restrict,
  -- Usuário que registrou a venda — sempre obtido de auth.uid() no
  -- servidor, nunca aceito como input do formulário.
  user_id uuid not null references auth.users (id),
  status public.sale_status not null default 'draft',
  payment_status public.sale_payment_status not null default 'pending',
  subtotal numeric(12, 2) not null default 0,
  discount_amount numeric(12, 2) not null default 0,
  total_amount numeric(12, 2) not null default 0,
  -- Custo estimado (soma de quantity × unit_cost dos itens) — histórico,
  -- nunca recalculado a partir do catálogo atual.
  total_cost numeric(12, 2) not null default 0,
  -- "Margem estimada" (nunca "lucro líquido"): não inclui despesas
  -- operacionais, impostos ou taxas — só a diferença entre o total
  -- vendido e o custo snapshot dos itens.
  estimated_margin numeric(12, 2) not null default 0,
  notes text,
  sold_at timestamptz not null default now(),
  completed_at timestamptz,
  cancelled_at timestamptz,
  cancelled_by uuid references auth.users (id),
  cancelled_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint sales_subtotal_non_negative check (subtotal >= 0),
  constraint sales_discount_non_negative check (discount_amount >= 0),
  constraint sales_total_non_negative check (total_amount >= 0),
  constraint sales_total_cost_non_negative check (total_cost >= 0),
  constraint sales_discount_not_exceeding_subtotal check (discount_amount <= subtotal)
);

comment on table public.sales is
  'Venda (transação) de uma empresa — pode conter produtos, serviços, ou ambos. Cliente é opcional (venda balcão). Registro histórico permanente: nunca é apagada, apenas concluída ou cancelada.';

create index if not exists sales_company_id_idx on public.sales (company_id);
create index if not exists sales_customer_id_idx on public.sales (customer_id);
create index if not exists sales_user_id_idx on public.sales (user_id);
create index if not exists sales_status_idx on public.sales (status);
create index if not exists sales_payment_status_idx on public.sales (payment_status);
create index if not exists sales_sold_at_idx on public.sales (sold_at);
create index if not exists sales_created_at_idx on public.sales (created_at);
create index if not exists sales_company_status_idx on public.sales (company_id, status);
create index if not exists sales_company_sold_at_idx on public.sales (company_id, sold_at desc);

drop trigger if exists sales_set_updated_at on public.sales;
create trigger sales_set_updated_at
  before update on public.sales
  for each row
  execute function public.set_updated_at();

drop trigger if exists sales_protect_company_id on public.sales;
create trigger sales_protect_company_id
  before update on public.sales
  for each row
  execute function public.protect_company_id();

-- -----------------------------------------------------------------------------
-- 3. Tabela sale_items
-- -----------------------------------------------------------------------------
create table if not exists public.sale_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  sale_id uuid not null references public.sales (id) on delete cascade,
  item_type public.sale_item_type not null,
  -- RESTRICT: nunca deixa apagar um produto/serviço referenciado por uma
  -- venda (defesa em profundidade — produtos/serviços não têm exclusão
  -- física no sistema de qualquer forma).
  product_id uuid references public.products (id) on delete restrict,
  service_id uuid references public.services (id) on delete restrict,
  -- Snapshot: nome do produto/serviço no momento da venda. Continua
  -- legível mesmo que o catálogo mude depois.
  description text not null,
  -- numeric (não integer): produtos vendidos em kg/g/l/ml precisam de
  -- quantidade fracionária. Mesma precisão de products.stock_quantity.
  quantity numeric(12, 3) not null,
  -- Snapshot de product.sale_price / service.sale_price e
  -- product.cost_price / service.cost_price — nunca recalculado a
  -- partir do catálogo atual depois de criado.
  unit_price numeric(12, 2) not null,
  unit_cost numeric(12, 2) not null default 0,
  discount_amount numeric(12, 2) not null default 0,
  -- subtotal = quantity × unit_price (bruto do item, antes do desconto).
  subtotal numeric(12, 2) not null,
  -- total_amount = subtotal - discount_amount (líquido do item).
  total_amount numeric(12, 2) not null,
  created_at timestamptz not null default now(),

  constraint sale_items_description_length check (char_length(description) between 1 and 200),
  constraint sale_items_quantity_positive check (quantity > 0),
  constraint sale_items_unit_price_non_negative check (unit_price >= 0),
  constraint sale_items_unit_cost_non_negative check (unit_cost >= 0),
  constraint sale_items_discount_non_negative check (discount_amount >= 0),
  constraint sale_items_subtotal_non_negative check (subtotal >= 0),
  constraint sale_items_total_non_negative check (total_amount >= 0),
  constraint sale_items_discount_not_exceeding_subtotal check (discount_amount <= subtotal),
  -- Um item representa UM produto OU UM serviço, nunca ambos nem nenhum.
  constraint sale_items_type_consistency check (
    (item_type = 'product' and product_id is not null and service_id is null)
    or
    (item_type = 'service' and service_id is not null and product_id is null)
  )
);

comment on table public.sale_items is
  'Itens de uma venda — produto ou serviço, nunca ambos no mesmo item. Guarda snapshot de descrição/preço/custo: uma venda concluída continua legível mesmo que o produto/serviço mude de preço, seja inativado, ou a categoria mude.';

create index if not exists sale_items_company_id_idx on public.sale_items (company_id);
create index if not exists sale_items_sale_id_idx on public.sale_items (sale_id);
create index if not exists sale_items_product_id_idx on public.sale_items (product_id);
create index if not exists sale_items_service_id_idx on public.sale_items (service_id);

drop trigger if exists sale_items_protect_company_id on public.sale_items;
create trigger sale_items_protect_company_id
  before update on public.sale_items
  for each row
  execute function public.protect_company_id();

-- -----------------------------------------------------------------------------
-- 4. Tabela sale_payments
-- -----------------------------------------------------------------------------
create table if not exists public.sale_payments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  sale_id uuid not null references public.sales (id) on delete cascade,
  method public.sale_payment_method not null,
  amount numeric(12, 2) not null,
  status public.sale_payment_status not null default 'pending',
  paid_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint sale_payments_amount_positive check (amount > 0)
);

comment on table public.sale_payments is
  'Pagamentos registrados para uma venda. Estrutura suporta múltiplos pagamentos por venda (ex: parte PIX + parte dinheiro), mesmo que a UI desta fase comece permitindo um só. Não integra com gateway/banco — apenas o registro do pagamento realizado.';

create index if not exists sale_payments_company_id_idx on public.sale_payments (company_id);
create index if not exists sale_payments_sale_id_idx on public.sale_payments (sale_id);
create index if not exists sale_payments_method_idx on public.sale_payments (method);
create index if not exists sale_payments_status_idx on public.sale_payments (status);

drop trigger if exists sale_payments_set_updated_at on public.sale_payments;
create trigger sale_payments_set_updated_at
  before update on public.sale_payments
  for each row
  execute function public.set_updated_at();

drop trigger if exists sale_payments_protect_company_id on public.sale_payments;
create trigger sale_payments_protect_company_id
  before update on public.sale_payments
  for each row
  execute function public.protect_company_id();

-- -----------------------------------------------------------------------------
-- 5. Trigger: recalcula sales.payment_status a partir dos pagamentos
-- -----------------------------------------------------------------------------
-- NÃO é SECURITY DEFINER (decisão explícita: SECURITY DEFINER só para
-- complete_sale/cancel_sale). Por isso a policy de UPDATE de `sales`
-- (seção 7) precisa permitir esta escrita mesmo numa venda já
-- completed — o bloqueio de edição de venda concluída para os demais
-- campos fica a cargo da camada de aplicação (Server Action), não da
-- RLS, exatamente pelo mesmo motivo.
create or replace function public.recompute_sale_payment_status()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_sale_id uuid := coalesce(new.sale_id, old.sale_id);
  v_total_amount numeric(12, 2);
  v_total_paid numeric(12, 2);
begin
  select total_amount into v_total_amount from public.sales where id = v_sale_id;

  select coalesce(sum(amount), 0) into v_total_paid
    from public.sale_payments
    where sale_id = v_sale_id and status = 'paid';

  update public.sales
    set payment_status = case
      when v_total_amount > 0 and v_total_paid >= v_total_amount then 'paid'::public.sale_payment_status
      else 'pending'::public.sale_payment_status
    end
    where id = v_sale_id;

  return coalesce(new, old);
end;
$$;

drop trigger if exists sale_payments_recompute_status on public.sale_payments;
create trigger sale_payments_recompute_status
  after insert or update on public.sale_payments
  for each row
  execute function public.recompute_sale_payment_status();

-- -----------------------------------------------------------------------------
-- 6. Row Level Security
-- -----------------------------------------------------------------------------
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.sale_payments enable row level security;

-- sales: isolamento por empresa. Sem policy de DELETE (histórico nunca é
-- apagado). UPDATE é isolamento simples de empresa — a regra "só
-- rascunho pode ser editado normalmente" é aplicada na Server Action,
-- não aqui (ver comentário da seção 5).
drop policy if exists "sales_select_own_company" on public.sales;
create policy "sales_select_own_company"
  on public.sales
  for select
  to authenticated
  using (
    company_id in (
      select cm.company_id from public.company_members cm where cm.user_id = auth.uid()
    )
  );

drop policy if exists "sales_insert_own_company" on public.sales;
create policy "sales_insert_own_company"
  on public.sales
  for insert
  to authenticated
  with check (
    company_id in (
      select cm.company_id from public.company_members cm where cm.user_id = auth.uid()
    )
    -- Nunca aceita user_id arbitrário do cliente: precisa ser o próprio
    -- usuário autenticado registrando a venda.
    and user_id = auth.uid()
  );

drop policy if exists "sales_update_own_company" on public.sales;
create policy "sales_update_own_company"
  on public.sales
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

-- sale_items: isolamento por empresa. INSERT/UPDATE sem restrição extra
-- de status na RLS (a Server Action só permite adicionar/editar item
-- enquanto a venda-pai está draft). DELETE é a EXCEÇÃO CONTROLADA
-- aprovada: só permite remover item de venda ainda em rascunho — depois
-- de completed/cancelled, os itens são permanentemente imutáveis.
drop policy if exists "sale_items_select_own_company" on public.sale_items;
create policy "sale_items_select_own_company"
  on public.sale_items
  for select
  to authenticated
  using (
    company_id in (
      select cm.company_id from public.company_members cm where cm.user_id = auth.uid()
    )
  );

drop policy if exists "sale_items_insert_own_company" on public.sale_items;
create policy "sale_items_insert_own_company"
  on public.sale_items
  for insert
  to authenticated
  with check (
    company_id in (
      select cm.company_id from public.company_members cm where cm.user_id = auth.uid()
    )
  );

drop policy if exists "sale_items_update_own_company" on public.sale_items;
create policy "sale_items_update_own_company"
  on public.sale_items
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

drop policy if exists "sale_items_delete_draft_only" on public.sale_items;
create policy "sale_items_delete_draft_only"
  on public.sale_items
  for delete
  to authenticated
  using (
    company_id in (
      select cm.company_id from public.company_members cm where cm.user_id = auth.uid()
    )
    and exists (
      select 1 from public.sales s where s.id = sale_id and s.status = 'draft'
    )
  );

-- sale_payments: isolamento por empresa. Sem policy de DELETE (histórico
-- de pagamento nunca é apagado — estornos usam status = 'refunded').
drop policy if exists "sale_payments_select_own_company" on public.sale_payments;
create policy "sale_payments_select_own_company"
  on public.sale_payments
  for select
  to authenticated
  using (
    company_id in (
      select cm.company_id from public.company_members cm where cm.user_id = auth.uid()
    )
  );

drop policy if exists "sale_payments_insert_own_company" on public.sale_payments;
create policy "sale_payments_insert_own_company"
  on public.sale_payments
  for insert
  to authenticated
  with check (
    company_id in (
      select cm.company_id from public.company_members cm where cm.user_id = auth.uid()
    )
  );

drop policy if exists "sale_payments_update_own_company" on public.sale_payments;
create policy "sale_payments_update_own_company"
  on public.sale_payments
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

-- -----------------------------------------------------------------------------
-- 7. Função: complete_sale — conclusão transacional da venda
-- -----------------------------------------------------------------------------
-- SECURITY DEFINER (escopo mínimo, deliberado): a policy de UPDATE de
-- `sales` sozinha não bastaria para bloquear conclusão indevida nem para
-- fazer a baixa de estoque atômica em `products` dentro da mesma
-- transação — por isso a função assume privilégio elevado e faz, ela
-- mesma, toda checagem de autorização (auth.uid(), company_members,
-- company_id da venda) antes de qualquer escrita.
create or replace function public.complete_sale(p_sale_id uuid)
returns public.sales
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sale public.sales;
  v_is_member boolean;
  v_item record;
  v_item_count integer;
  v_subtotal numeric(12, 2) := 0;
  v_total_cost numeric(12, 2) := 0;
  v_total numeric(12, 2) := 0;
  v_margin numeric(12, 2) := 0;
  v_stock_before numeric(12, 3);
  v_stock_after numeric(12, 3);
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.';
  end if;

  -- Trava a linha da venda: uma segunda chamada concorrente para a
  -- mesma venda espera aqui e, ao continuar, já vê status <> 'draft' —
  -- protege contra duplo clique/duplo envio de "Concluir venda".
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
    raise exception 'Apenas vendas em rascunho podem ser concluídas.';
  end if;

  select count(*) into v_item_count from public.sale_items where sale_id = p_sale_id;
  if v_item_count = 0 then
    raise exception 'Adicione ao menos um item antes de concluir a venda.';
  end if;

  -- Recalcula subtotal/custo a partir dos itens reais no banco — nunca
  -- confia em valor calculado no frontend nem em cache desatualizado.
  select coalesce(sum(total_amount), 0), coalesce(sum(quantity * unit_cost), 0)
    into v_subtotal, v_total_cost
    from public.sale_items
    where sale_id = p_sale_id;

  if v_sale.discount_amount > v_subtotal then
    raise exception 'O desconto da venda não pode ser maior que o subtotal.';
  end if;

  v_total := v_subtotal - v_sale.discount_amount;
  v_margin := v_total - v_total_cost;

  -- Baixa de estoque atômica, item a item. UPDATE...WHERE stock_quantity
  -- >= quantity é uma única operação de linha no Postgres — duas vendas
  -- concorrentes do mesmo produto serializam nesta linha; a que chegar
  -- depois já vê o estoque reduzido pela primeira.
  for v_item in
    select * from public.sale_items where sale_id = p_sale_id and item_type = 'product'
  loop
    select stock_quantity into v_stock_before
      from public.products where id = v_item.product_id;

    update public.products
      set stock_quantity = stock_quantity - v_item.quantity
      where id = v_item.product_id
        and company_id = v_sale.company_id
        and stock_quantity >= v_item.quantity
      returning stock_quantity into v_stock_after;

    if not found then
      raise exception 'Estoque insuficiente para "%".', v_item.description;
    end if;

    insert into public.audit_logs (company_id, actor_user_id, entity_type, entity_id, action, metadata)
    values (
      v_sale.company_id, auth.uid(), 'sale', p_sale_id, 'sale.stock_adjusted',
      jsonb_build_object(
        'product_id', v_item.product_id,
        'quantity', v_item.quantity,
        'stock_before', v_stock_before,
        'stock_after', v_stock_after,
        'reason', 'sale'
      )
    );
  end loop;

  update public.sales
    set status = 'completed',
        subtotal = v_subtotal,
        total_cost = v_total_cost,
        total_amount = v_total,
        estimated_margin = v_margin,
        completed_at = now()
    where id = p_sale_id
    returning * into v_sale;

  insert into public.audit_logs (company_id, actor_user_id, entity_type, entity_id, action, metadata)
  values (
    v_sale.company_id, auth.uid(), 'sale', p_sale_id, 'sale.completed',
    jsonb_build_object(
      'total_amount', v_total,
      'total_cost', v_total_cost,
      'estimated_margin', v_margin
    )
  );

  return v_sale;
end;
$$;

comment on function public.complete_sale(uuid) is
  'Conclui uma venda em rascunho de forma transacional e atômica: recalcula totais a partir dos itens reais, dá baixa de estoque item a item com proteção de concorrência (nunca deixa stock_quantity negativo), registra auditoria. Levanta exceção (e desfaz tudo) se a venda não existir, não pertencer ao usuário, não estiver em rascunho, não tiver itens, ou se o estoque de algum produto for insuficiente.';

revoke execute on function public.complete_sale(uuid) from public;
grant execute on function public.complete_sale(uuid) to authenticated;
-- Revogar de PUBLIC não remove o grant que o Supabase concede
-- separadamente a `anon` por padrão em toda função nova do schema
-- public — mesma observação já registrada na migration 003 para
-- create_company_with_owner. Revoga explicitamente de anon também.
revoke execute on function public.complete_sale(uuid) from anon;

-- -----------------------------------------------------------------------------
-- 8. Função: cancel_sale — cancelamento transacional da venda
-- -----------------------------------------------------------------------------
create or replace function public.cancel_sale(p_sale_id uuid, p_reason text default null)
returns public.sales
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sale public.sales;
  v_role public.company_role;
  v_item record;
  v_stock_before numeric(12, 3);
  v_stock_after numeric(12, 3);
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.';
  end if;

  select * into v_sale from public.sales where id = p_sale_id for update;
  if v_sale is null then
    raise exception 'Venda não encontrada.';
  end if;

  select cm.role into v_role
    from public.company_members cm
    where cm.company_id = v_sale.company_id and cm.user_id = auth.uid();

  if v_role is null then
    raise exception 'Você não tem acesso a esta venda.';
  end if;

  -- Permissão: owner e admin sempre podem cancelar; employee só pode
  -- cancelar vendas que ele mesmo registrou.
  if v_role = 'employee' and v_sale.user_id <> auth.uid() then
    raise exception 'Você só pode cancelar vendas registradas por você.';
  end if;

  if v_sale.status <> 'completed' then
    raise exception 'Apenas vendas concluídas podem ser canceladas.';
  end if;

  -- Restaura o estoque de cada item de produto (a venda só chega aqui
  -- com status completed, ou seja, o estoque foi sempre baixado por
  -- complete_sale — nunca precisa checar "se aplicável").
  for v_item in
    select * from public.sale_items where sale_id = p_sale_id and item_type = 'product'
  loop
    update public.products
      set stock_quantity = stock_quantity + v_item.quantity
      where id = v_item.product_id
        and company_id = v_sale.company_id
      returning stock_quantity into v_stock_after;

    if not found then
      raise exception 'Produto do item "%" não encontrado para restaurar estoque.', v_item.description;
    end if;

    v_stock_before := v_stock_after - v_item.quantity;

    insert into public.audit_logs (company_id, actor_user_id, entity_type, entity_id, action, metadata)
    values (
      v_sale.company_id, auth.uid(), 'sale', p_sale_id, 'sale.stock_adjusted',
      jsonb_build_object(
        'product_id', v_item.product_id,
        'quantity', v_item.quantity,
        'stock_before', v_stock_before,
        'stock_after', v_stock_after,
        'reason', 'sale_cancelled'
      )
    );
  end loop;

  update public.sales
    set status = 'cancelled',
        cancelled_at = now(),
        cancelled_by = auth.uid(),
        cancelled_reason = p_reason
    where id = p_sale_id
    returning * into v_sale;

  insert into public.audit_logs (company_id, actor_user_id, entity_type, entity_id, action, metadata)
  values (
    v_sale.company_id, auth.uid(), 'sale', p_sale_id, 'sale.cancelled',
    jsonb_build_object('reason', p_reason)
  );

  return v_sale;
end;
$$;

comment on function public.cancel_sale(uuid, text) is
  'Cancela uma venda concluída de forma transacional: valida permissão (owner/admin sempre; employee só a própria venda), restaura o estoque de cada item de produto, registra auditoria. Nunca apaga a venda. Levanta exceção se a venda não existir, o usuário não tiver acesso/permissão, ou a venda não estiver completed.';

revoke execute on function public.cancel_sale(uuid, text) from public;
grant execute on function public.cancel_sale(uuid, text) to authenticated;
revoke execute on function public.cancel_sale(uuid, text) from anon;
