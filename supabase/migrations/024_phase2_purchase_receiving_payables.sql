-- =============================================================================
-- Migration 024 — reconstruída a partir do SQL REALMENTE aplicado no Supabase.
--
-- Fonte da verdade: supabase_migrations.schema_migrations
--   version 20260922001123, name "024_phase2_purchase_receiving_payables".
-- O corpo abaixo (a partir da linha "-- FASE 2 — ...") é o texto aplicado no
-- banco live, sem alterações. NÃO reaplicar este arquivo no banco existente:
-- ele já está aplicado (create type/table sem "if not exists" falhariam).
-- Ver supabase/migrations/README.md (mapa arquivo ↔ histórico live).
-- =============================================================================

-- FASE 2 — Compras completa + Recebimento + Estoque + Contas a pagar
-- Modelagem funcional inspirada por OCA purchase-workflow/Dolibarr/ERPNext.
-- Implementação própria e integrada à arquitetura Prime Ges.

create type public.purchase_receipt_status as enum ('posted','cancelled');
create type public.accounts_payable_status as enum ('open','paid','cancelled');

alter table public.purchase_orders
  add column if not exists due_date date;

create table public.purchase_receipts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  purchase_order_id uuid not null references public.purchase_orders(id) on delete restrict,
  supplier_id uuid not null references public.suppliers(id) on delete restrict,
  status public.purchase_receipt_status not null default 'posted',
  received_at timestamptz not null default now(),
  received_by uuid not null references auth.users(id),
  total_amount numeric(12,2) not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  constraint purchase_receipts_total_non_negative check (total_amount >= 0)
);

create index purchase_receipts_company_idx on public.purchase_receipts(company_id, received_at desc);
create index purchase_receipts_order_idx on public.purchase_receipts(purchase_order_id);
create index purchase_receipts_supplier_idx on public.purchase_receipts(supplier_id);

create table public.purchase_receipt_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  purchase_receipt_id uuid not null references public.purchase_receipts(id) on delete restrict,
  purchase_order_item_id uuid not null references public.purchase_order_items(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  quantity numeric(12,3) not null,
  unit_cost numeric(12,2) not null,
  total_amount numeric(12,2) not null,
  created_at timestamptz not null default now(),
  constraint purchase_receipt_items_qty_positive check (quantity > 0),
  constraint purchase_receipt_items_cost_non_negative check (unit_cost >= 0),
  constraint purchase_receipt_items_total_non_negative check (total_amount >= 0)
);

create index purchase_receipt_items_receipt_idx on public.purchase_receipt_items(purchase_receipt_id);
create index purchase_receipt_items_order_item_idx on public.purchase_receipt_items(purchase_order_item_id);
create index purchase_receipt_items_product_idx on public.purchase_receipt_items(product_id);

create table public.accounts_payable (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  supplier_id uuid not null references public.suppliers(id) on delete restrict,
  purchase_order_id uuid references public.purchase_orders(id) on delete restrict,
  purchase_receipt_id uuid references public.purchase_receipts(id) on delete restrict,
  description text not null,
  amount numeric(12,2) not null,
  issue_date date not null default current_date,
  due_date date,
  status public.accounts_payable_status not null default 'open',
  paid_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint accounts_payable_amount_positive check (amount > 0),
  constraint accounts_payable_paid_consistency check (
    (status = 'paid' and paid_at is not null) or
    (status <> 'paid' and paid_at is null)
  )
);

create unique index accounts_payable_receipt_unique
  on public.accounts_payable(purchase_receipt_id)
  where purchase_receipt_id is not null;

create index accounts_payable_company_status_idx
  on public.accounts_payable(company_id,status,due_date);

create index accounts_payable_supplier_idx
  on public.accounts_payable(supplier_id);

create trigger purchase_receipts_protect_company_id
  before update on public.purchase_receipts
  for each row execute function public.protect_company_id();

create trigger purchase_receipt_items_protect_company_id
  before update on public.purchase_receipt_items
  for each row execute function public.protect_company_id();

create trigger accounts_payable_set_updated_at
  before update on public.accounts_payable
  for each row execute function public.set_updated_at();

create trigger accounts_payable_protect_company_id
  before update on public.accounts_payable
  for each row execute function public.protect_company_id();

alter table public.purchase_receipts enable row level security;
alter table public.purchase_receipt_items enable row level security;
alter table public.accounts_payable enable row level security;

create policy "purchase_receipts_select_own_company"
  on public.purchase_receipts
  for select to authenticated
  using (company_id in (
    select cm.company_id from public.company_members cm where cm.user_id = auth.uid()
  ));

create policy "purchase_receipt_items_select_own_company"
  on public.purchase_receipt_items
  for select to authenticated
  using (company_id in (
    select cm.company_id from public.company_members cm where cm.user_id = auth.uid()
  ));

create policy "accounts_payable_select_own_company"
  on public.accounts_payable
  for select to authenticated
  using (company_id in (
    select cm.company_id from public.company_members cm where cm.user_id = auth.uid()
  ));

-- Defensa de tenant para compras/recebimentos: fornecedor e produto
-- precisam pertencer à mesma empresa resolvida no registro.
create or replace function public.validate_purchase_company_links()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_supplier_company uuid;
  v_product_company uuid;
  v_order_company uuid;
begin
  if tg_table_name = 'purchase_orders' then
    select company_id into v_supplier_company from public.suppliers where id = new.supplier_id;
    if v_supplier_company is distinct from new.company_id then
      raise exception 'Fornecedor não pertence à empresa atual.';
    end if;
  elsif tg_table_name = 'purchase_order_items' then
    select company_id into v_product_company from public.products where id = new.product_id;
    select company_id into v_order_company from public.purchase_orders where id = new.purchase_order_id;
    if v_product_company is distinct from new.company_id or v_order_company is distinct from new.company_id then
      raise exception 'Produto ou pedido de compra não pertence à empresa atual.';
    end if;
  elsif tg_table_name = 'supplier_products' then
    select company_id into v_supplier_company from public.suppliers where id = new.supplier_id;
    select company_id into v_product_company from public.products where id = new.product_id;
    if v_supplier_company is distinct from new.company_id or v_product_company is distinct from new.company_id then
      raise exception 'Fornecedor ou produto não pertence à empresa atual.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists purchase_orders_validate_links on public.purchase_orders;
create trigger purchase_orders_validate_links
before insert or update on public.purchase_orders
for each row execute function public.validate_purchase_company_links();

drop trigger if exists purchase_order_items_validate_links on public.purchase_order_items;
create trigger purchase_order_items_validate_links
before insert or update on public.purchase_order_items
for each row execute function public.validate_purchase_company_links();

drop trigger if exists supplier_products_validate_links on public.supplier_products;
create trigger supplier_products_validate_links
before insert or update on public.supplier_products
for each row execute function public.validate_purchase_company_links();

create or replace function public.create_purchase_order(
  p_supplier_id uuid,
  p_items jsonb,
  p_expected_at timestamptz default null,
  p_due_date date default null,
  p_notes text default null
)
returns public.purchase_orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_company_id uuid;
  v_role public.company_role;
  v_supplier public.suppliers;
  v_order public.purchase_orders;
  v_item jsonb;
  v_product public.products;
  v_qty numeric(12,3);
  v_unit_cost numeric(12,2);
  v_subtotal numeric(12,2) := 0;
  v_total numeric(12,2) := 0;
  v_count integer := 0;
begin
  if v_user_id is null then
    raise exception 'Usuário não autenticado.';
  end if;

  select cm.company_id, cm.role into v_company_id, v_role
  from public.company_members cm
  where cm.user_id = v_user_id;

  if v_company_id is null then
    raise exception 'Nenhuma empresa encontrada para o usuário atual.';
  end if;
  if v_role not in ('owner','admin') then
    raise exception 'Apenas owner/admin podem criar pedidos de compra.';
  end if;

  select * into v_supplier
  from public.suppliers
  where id = p_supplier_id and company_id = v_company_id
  for share;
  if v_supplier is null or v_supplier.status <> 'active' then
    raise exception 'Fornecedor não encontrado ou inativo.';
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Adicione pelo menos um produto ao pedido.';
  end if;

  insert into public.purchase_orders(
    company_id, supplier_id, status, expected_at, due_date, notes, created_by
  )
  values (
    v_company_id, p_supplier_id, 'ordered', p_expected_at, p_due_date, nullif(trim(p_notes),''), v_user_id
  )
  returning * into v_order;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_count := v_count + 1;
    if not (v_item ? 'product_id') or not (v_item ? 'quantity') or not (v_item ? 'unit_cost') then
      raise exception 'Item de compra incompleto.';
    end if;

    v_qty := (v_item->>'quantity')::numeric;
    v_unit_cost := (v_item->>'unit_cost')::numeric;

    if v_qty <= 0 or v_unit_cost < 0 then
      raise exception 'Quantidade e custo do item precisam ser válidos.';
    end if;

    select * into v_product
    from public.products
    where id = (v_item->>'product_id')::uuid
      and company_id = v_company_id
      and status = 'active'
    for share;

    if v_product is null then
      raise exception 'Produto inválido ou inativo no pedido.';
    end if;

    insert into public.purchase_order_items(
      company_id, purchase_order_id, product_id, description, quantity, unit_cost, total_amount
    )
    values (
      v_company_id, v_order.id, v_product.id, v_product.name,
      v_qty, v_unit_cost, round(v_qty * v_unit_cost, 2)
    );

    v_subtotal := v_subtotal + round(v_qty * v_unit_cost, 2);

    insert into public.supplier_products(
      company_id, supplier_id, product_id, unit_cost
    )
    values (
      v_company_id, p_supplier_id, v_product.id, v_unit_cost
    )
    on conflict (supplier_id,product_id)
    do update set
      unit_cost = excluded.unit_cost,
      updated_at = now();
  end loop;

  if v_count = 0 then
    raise exception 'O pedido precisa ter itens.';
  end if;

  v_total := round(v_subtotal,2);

  update public.purchase_orders
  set subtotal = v_subtotal,
      total_amount = v_total
  where id = v_order.id
  returning * into v_order;

  insert into public.audit_logs(company_id,actor_user_id,entity_type,entity_id,action,metadata)
  values (
    v_company_id,v_user_id,'purchase_order',v_order.id,'purchase_order.created',
    jsonb_build_object('supplier_id',p_supplier_id,'total_amount',v_total,'item_count',v_count)
  );

  return v_order;
end;
$$;

revoke all on function public.create_purchase_order(uuid,jsonb,timestamptz,date,text) from public;
revoke execute on function public.create_purchase_order(uuid,jsonb,timestamptz,date,text) from anon;
grant execute on function public.create_purchase_order(uuid,jsonb,timestamptz,date,text) to authenticated;

create or replace function public.receive_purchase_order(
  p_purchase_order_id uuid,
  p_items jsonb,
  p_notes text default null
)
returns public.purchase_receipts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_company_id uuid;
  v_role public.company_role;
  v_order public.purchase_orders;
  v_receipt public.purchase_receipts;
  v_item jsonb;
  v_order_item public.purchase_order_items;
  v_product public.products;
  v_qty numeric(12,3);
  v_remaining numeric(12,3);
  v_total numeric(12,2) := 0;
  v_received_line_count integer := 0;
  v_all_received boolean;
  v_unit_cost numeric(12,2);
begin
  if v_user_id is null then
    raise exception 'Usuário não autenticado.';
  end if;

  select cm.company_id, cm.role into v_company_id, v_role
  from public.company_members cm where cm.user_id = v_user_id;

  if v_company_id is null then
    raise exception 'Nenhuma empresa encontrada para o usuário atual.';
  end if;
  if v_role not in ('owner','admin') then
    raise exception 'Apenas owner/admin podem receber compras.';
  end if;

  select * into v_order
  from public.purchase_orders
  where id = p_purchase_order_id and company_id = v_company_id
  for update;

  if v_order is null then
    raise exception 'Pedido de compra não encontrado.';
  end if;
  if v_order.status in ('received','cancelled') then
    raise exception 'Este pedido não pode mais receber mercadoria.';
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Informe ao menos um item recebido.';
  end if;

  insert into public.purchase_receipts(
    company_id,purchase_order_id,supplier_id,status,received_by,notes
  )
  values (
    v_company_id,v_order.id,v_order.supplier_id,'posted',v_user_id,nullif(trim(p_notes),'')
  )
  returning * into v_receipt;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    select * into v_order_item
    from public.purchase_order_items
    where id = (v_item->>'purchase_order_item_id')::uuid
      and purchase_order_id = v_order.id
      and company_id = v_company_id
    for update;

    if v_order_item is null then
      raise exception 'Item do pedido não encontrado.';
    end if;

    v_qty := (v_item->>'quantity')::numeric;
    v_remaining := v_order_item.quantity - v_order_item.received_quantity;

    if v_qty <= 0 then
      raise exception 'A quantidade recebida deve ser maior que zero.';
    end if;
    if v_qty > v_remaining then
      raise exception 'A quantidade recebida excede o saldo do item "%".',v_order_item.description;
    end if;

    select * into v_product
    from public.products
    where id = v_order_item.product_id and company_id = v_company_id
    for update;

    if v_product is null then
      raise exception 'Produto do item não encontrado.';
    end if;

    v_unit_cost := v_order_item.unit_cost;

    insert into public.purchase_receipt_items(
      company_id,purchase_receipt_id,purchase_order_item_id,product_id,quantity,unit_cost,total_amount
    )
    values (
      v_company_id,v_receipt.id,v_order_item.id,v_order_item.product_id,
      v_qty,v_unit_cost,round(v_qty*v_unit_cost,2)
    );

    update public.products
    set stock_quantity = stock_quantity + v_qty,
        cost_price = v_unit_cost
    where id = v_product.id;

    insert into public.stock_movements(
      company_id,product_id,direction,quantity,stock_before,stock_after,
      reason,source,reference_id,created_by
    )
    values (
      v_company_id,v_product.id,'in',v_qty,v_product.stock_quantity,
      v_product.stock_quantity + v_qty,'Recebimento de compra','purchase',
      v_receipt.id,v_user_id
    );

    update public.purchase_order_items
    set received_quantity = received_quantity + v_qty
    where id = v_order_item.id;

    v_total := v_total + round(v_qty*v_unit_cost,2);
    v_received_line_count := v_received_line_count + 1;
  end loop;

  if v_received_line_count = 0 then
    raise exception 'Nenhum item foi recebido.';
  end if;

  update public.purchase_receipts
  set total_amount = round(v_total,2)
  where id = v_receipt.id
  returning * into v_receipt;

  select not exists (
    select 1 from public.purchase_order_items poi
    where poi.purchase_order_id = v_order.id
      and poi.received_quantity < poi.quantity
  ) into v_all_received;

  update public.purchase_orders
  set status = case when v_all_received then 'received' else 'partially_received' end,
      received_at = case when v_all_received then now() else received_at end
  where id = v_order.id;

  insert into public.accounts_payable(
    company_id,supplier_id,purchase_order_id,purchase_receipt_id,
    description,amount,issue_date,due_date,status,created_by
  )
  values (
    v_company_id,v_order.supplier_id,v_order.id,v_receipt.id,
    'Compra #' || coalesce(v_order.order_number,left(v_order.id::text,8)),
    round(v_total,2),current_date,v_order.due_date,'open',v_user_id
  );

  insert into public.audit_logs(company_id,actor_user_id,entity_type,entity_id,action,metadata)
  values (
    v_company_id,v_user_id,'purchase_receipt',v_receipt.id,'purchase.received',
    jsonb_build_object(
      'purchase_order_id',v_order.id,
      'total_amount',v_total,
      'all_received',v_all_received
    )
  );

  return v_receipt;
end;
$$;

revoke all on function public.receive_purchase_order(uuid,jsonb,text) from public;
revoke execute on function public.receive_purchase_order(uuid,jsonb,text) from anon;
grant execute on function public.receive_purchase_order(uuid,jsonb,text) to authenticated;

create or replace function public.cancel_purchase_receipt(
  p_purchase_receipt_id uuid,
  p_reason text default null
)
returns public.purchase_receipts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_company_id uuid;
  v_role public.company_role;
  v_receipt public.purchase_receipts;
  v_item record;
  v_product public.products;
  v_order public.purchase_orders;
begin
  select cm.company_id,cm.role into v_company_id,v_role
  from public.company_members cm where cm.user_id=v_user_id;

  if v_company_id is null then raise exception 'Nenhuma empresa encontrada para o usuário atual.'; end if;
  if v_role not in ('owner','admin') then raise exception 'Apenas owner/admin podem cancelar recebimentos.'; end if;

  select * into v_receipt
  from public.purchase_receipts
  where id=p_purchase_receipt_id and company_id=v_company_id
  for update;

  if v_receipt is null then raise exception 'Recebimento não encontrado.'; end if;
  if v_receipt.status <> 'posted' then raise exception 'Este recebimento já está cancelado.'; end if;

  for v_item in
    select pri.*,poi.purchase_order_id
    from public.purchase_receipt_items pri
    join public.purchase_order_items poi on poi.id=pri.purchase_order_item_id
    where pri.purchase_receipt_id=v_receipt.id
    for update
  loop
    select * into v_product from public.products
    where id=v_item.product_id and company_id=v_company_id for update;

    if v_product.stock_quantity < v_item.quantity then
      raise exception 'Estoque atual insuficiente para estornar "%".',v_product.name;
    end if;

    update public.products
    set stock_quantity=stock_quantity-v_item.quantity
    where id=v_product.id;

    insert into public.stock_movements(
      company_id,product_id,direction,quantity,stock_before,stock_after,
      reason,source,reference_id,created_by
    )
    values(
      v_company_id,v_product.id,'out',v_item.quantity,
      v_product.stock_quantity+v_item.quantity,v_product.stock_quantity,
      coalesce(nullif(trim(p_reason),''),'Cancelamento de recebimento'),
      'purchase_cancellation',v_receipt.id,v_user_id
    );

    update public.purchase_order_items
    set received_quantity=received_quantity-v_item.quantity
    where id=v_item.purchase_order_item_id;
  end loop;

  update public.purchase_receipts set status='cancelled' where id=v_receipt.id;

  update public.accounts_payable
  set status='cancelled'
  where purchase_receipt_id=v_receipt.id and status='open';

  select * into v_order from public.purchase_orders
  where id=v_receipt.purchase_order_id for update;

  if v_order is not null then
    update public.purchase_orders
    set status = case
      when exists (
        select 1 from public.purchase_order_items poi
        where poi.purchase_order_id=v_order.id and poi.received_quantity>0
      )
      then 'partially_received'
      else 'ordered'
    end,
    received_at = null
    where id=v_order.id;
  end if;

  insert into public.audit_logs(company_id,actor_user_id,entity_type,entity_id,action,metadata)
  values(
    v_company_id,v_user_id,'purchase_receipt',v_receipt.id,'purchase.receipt_cancelled',
    jsonb_build_object('reason',p_reason,'purchase_order_id',v_receipt.purchase_order_id)
  );

  return v_receipt;
end;
$$;

revoke all on function public.cancel_purchase_receipt(uuid,text) from public;
revoke execute on function public.cancel_purchase_receipt(uuid,text) from anon;
grant execute on function public.cancel_purchase_receipt(uuid,text) to authenticated;

comment on table public.purchase_receipts is 'Recebimentos de pedidos de compra. Suporta recebimento parcial e múltiplos recebimentos por pedido.';
comment on table public.accounts_payable is 'Base de contas a pagar gerada por recebimentos de compras; o módulo Financeiro da Fase 3 consumirá e ampliará esta tabela.';
