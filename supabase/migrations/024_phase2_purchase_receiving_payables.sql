-- RECUPERAÇÃO HISTÓRICA — 024_phase2_purchase_receiving_payables
-- Reconstruído a partir do estado efetivamente aplicado no Supabase.
-- Não reaplicar em produção: a migration 024 já consta no histórico do projeto.
-- O objetivo deste arquivo é tornar o GitHub reproduzível a partir da 023.

create type public.purchase_receipt_status as enum ('posted','cancelled');
create type public.accounts_payable_status as enum ('open','paid','cancelled');

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
  created_at timestamptz not null default now()
);

create index purchase_receipts_company_idx
  on public.purchase_receipts(company_id, received_at desc);
create index purchase_receipts_order_idx
  on public.purchase_receipts(purchase_order_id);
create index purchase_receipts_supplier_idx
  on public.purchase_receipts(supplier_id);

create table public.purchase_receipt_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  purchase_receipt_id uuid not null references public.purchase_receipts(id) on delete cascade,
  purchase_order_item_id uuid not null references public.purchase_order_items(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  quantity numeric(12,3) not null,
  unit_cost numeric(12,2) not null,
  total_amount numeric(12,2) not null,
  created_at timestamptz not null default now()
);

create index purchase_receipt_items_receipt_idx
  on public.purchase_receipt_items(purchase_receipt_id);
create index purchase_receipt_items_order_item_idx
  on public.purchase_receipt_items(purchase_order_item_id);
create index purchase_receipt_items_product_idx
  on public.purchase_receipt_items(product_id);

create table public.accounts_payable (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  supplier_id uuid not null references public.suppliers(id) on delete restrict,
  purchase_order_id uuid references public.purchase_orders(id) on delete set null,
  purchase_receipt_id uuid references public.purchase_receipts(id) on delete set null,
  description text not null,
  amount numeric(12,2) not null,
  issue_date date not null default current_date,
  due_date date,
  status public.accounts_payable_status not null default 'open',
  paid_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index accounts_payable_company_status_idx
  on public.accounts_payable(company_id, status, due_date);
create index accounts_payable_supplier_idx
  on public.accounts_payable(supplier_id);

alter table public.purchase_receipts enable row level security;
alter table public.purchase_receipt_items enable row level security;
alter table public.accounts_payable enable row level security;

create policy purchase_receipts_select_own_company
on public.purchase_receipts for select
to authenticated
using (company_id in (
  select cm.company_id
  from public.company_members cm
  where cm.user_id = (select auth.uid())
));

create policy purchase_receipt_items_select_own_company
on public.purchase_receipt_items for select
to authenticated
using (company_id in (
  select cm.company_id
  from public.company_members cm
  where cm.user_id = (select auth.uid())
));

create policy accounts_payable_select_own_company
on public.accounts_payable for select
to authenticated
using (company_id in (
  select cm.company_id
  from public.company_members cm
  where cm.user_id = (select auth.uid())
));

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
set search_path=public
as $$
declare
  v_user_id uuid:=auth.uid();
  v_company_id uuid;
  v_role public.company_role;
  v_supplier public.suppliers;
  v_order public.purchase_orders;
  v_item jsonb;
  v_product public.products;
  v_qty numeric(12,3);
  v_unit_cost numeric(12,2);
  v_subtotal numeric(12,2):=0;
  v_count integer:=0;
begin
  if v_user_id is null then raise exception 'Usuário não autenticado.'; end if;

  select cm.company_id,cm.role into v_company_id,v_role
  from public.company_members cm where cm.user_id=v_user_id;

  if v_company_id is null then raise exception 'Nenhuma empresa encontrada para o usuário atual.'; end if;
  if v_role not in ('owner','admin') then raise exception 'Apenas owner/admin podem criar pedidos de compra.'; end if;

  select * into v_supplier
  from public.suppliers
  where id=p_supplier_id and company_id=v_company_id
  for share;

  if v_supplier is null or v_supplier.status<>'active' then
    raise exception 'Fornecedor não encontrado ou inativo.';
  end if;

  if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then
    raise exception 'Adicione pelo menos um produto ao pedido.';
  end if;

  insert into public.purchase_orders(
    company_id,supplier_id,status,order_number,ordered_at,expected_at,due_date,notes,created_by
  )
  values(
    v_company_id,p_supplier_id,'ordered',
    'PC-'||to_char(current_date,'YYYYMMDD')||'-'||upper(substr(gen_random_uuid()::text,1,6)),
    now(),p_expected_at,p_due_date,nullif(trim(p_notes),''),v_user_id
  )
  returning * into v_order;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_count:=v_count+1;
    if not(v_item ? 'product_id') or not(v_item ? 'quantity') or not(v_item ? 'unit_cost') then
      raise exception 'Item de compra incompleto.';
    end if;

    v_qty:=(v_item->>'quantity')::numeric;
    v_unit_cost:=(v_item->>'unit_cost')::numeric;

    if v_qty<=0 or v_unit_cost<0 then
      raise exception 'Quantidade e custo do item precisam ser válidos.';
    end if;

    select * into v_product
    from public.products
    where id=(v_item->>'product_id')::uuid
      and company_id=v_company_id
      and status='active'
    for share;

    if v_product is null then
      raise exception 'Produto inválido ou inativo no pedido.';
    end if;

    insert into public.purchase_order_items(
      company_id,purchase_order_id,product_id,description,quantity,unit_cost,total_amount
    )
    values(
      v_company_id,v_order.id,v_product.id,v_product.name,
      v_qty,v_unit_cost,round(v_qty*v_unit_cost,2)
    );

    v_subtotal:=v_subtotal+round(v_qty*v_unit_cost,2);

    insert into public.supplier_products(company_id,supplier_id,product_id,unit_cost)
    values(v_company_id,p_supplier_id,v_product.id,v_unit_cost)
    on conflict(supplier_id,product_id) do update set
      unit_cost=excluded.unit_cost,updated_at=now();
  end loop;

  if v_count=0 then raise exception 'O pedido precisa ter itens.'; end if;

  update public.purchase_orders
  set subtotal=round(v_subtotal,2),total_amount=round(v_subtotal,2)
  where id=v_order.id
  returning * into v_order;

  insert into public.audit_logs(company_id,actor_user_id,entity_type,entity_id,action,metadata)
  values(
    v_company_id,v_user_id,'purchase_order',v_order.id,'purchase_order.created',
    jsonb_build_object('supplier_id',p_supplier_id,'total_amount',v_subtotal,'item_count',v_count)
  );

  return v_order;
end;
$$;

create or replace function public.receive_purchase_order(
  p_purchase_order_id uuid,
  p_items jsonb,
  p_notes text default null
)
returns public.purchase_receipts
language plpgsql
security definer
set search_path=public
as $$
declare
  v_user_id uuid := auth.uid();
  v_company_id uuid;
  v_role public.company_role;
  v_order public.purchase_orders;
  v_receipt public.purchase_receipts;
  v_receipt_item_id uuid;
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
  if v_user_id is null then raise exception 'Usuário não autenticado.'; end if;

  select cm.company_id,cm.role into v_company_id,v_role
  from public.company_members cm where cm.user_id=v_user_id;

  if v_company_id is null then raise exception 'Nenhuma empresa encontrada para o usuário atual.'; end if;
  if v_role not in ('owner','admin') then raise exception 'Apenas owner/admin podem receber compras.'; end if;

  select * into v_order
  from public.purchase_orders
  where id=p_purchase_order_id and company_id=v_company_id
  for update;

  if v_order is null then raise exception 'Pedido de compra não encontrado.'; end if;
  if v_order.status in ('received','cancelled') then raise exception 'Este pedido não pode mais receber mercadoria.'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Informe ao menos um item recebido.';
  end if;

  insert into public.purchase_receipts(
    company_id,purchase_order_id,supplier_id,status,received_by,notes
  )
  values(
    v_company_id,v_order.id,v_order.supplier_id,'posted',
    v_user_id,nullif(trim(p_notes),'')
  )
  returning * into v_receipt;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    select * into v_order_item
    from public.purchase_order_items
    where id=(v_item->>'purchase_order_item_id')::uuid
      and purchase_order_id=v_order.id
      and company_id=v_company_id
    for update;

    if v_order_item is null then raise exception 'Item do pedido não encontrado.'; end if;

    v_qty:=(v_item->>'quantity')::numeric;
    v_remaining:=v_order_item.quantity-v_order_item.received_quantity;

    if v_qty<=0 then raise exception 'A quantidade recebida deve ser maior que zero.'; end if;
    if v_qty>v_remaining then
      raise exception 'A quantidade recebida excede o saldo do item "%".',v_order_item.description;
    end if;

    select * into v_product
    from public.products
    where id=v_order_item.product_id and company_id=v_company_id
    for update;

    if v_product is null then raise exception 'Produto do item não encontrado.'; end if;

    v_unit_cost:=v_order_item.unit_cost;

    insert into public.purchase_receipt_items(
      company_id,purchase_receipt_id,purchase_order_item_id,product_id,
      quantity,unit_cost,total_amount
    )
    values(
      v_company_id,v_receipt.id,v_order_item.id,v_order_item.product_id,
      v_qty,v_unit_cost,round(v_qty*v_unit_cost,2)
    )
    returning id into v_receipt_item_id;

    update public.products
    set stock_quantity=stock_quantity+v_qty,cost_price=v_unit_cost
    where id=v_product.id;

    insert into public.stock_movements(
      company_id,product_id,direction,quantity,stock_before,stock_after,
      reason,source,reference_id,created_by
    )
    values(
      v_company_id,v_product.id,'in',v_qty,v_product.stock_quantity,
      v_product.stock_quantity+v_qty,'Recebimento de compra','purchase',
      v_receipt_item_id,v_user_id
    );

    update public.purchase_order_items
    set received_quantity=received_quantity+v_qty
    where id=v_order_item.id;

    v_total:=v_total+round(v_qty*v_unit_cost,2);
    v_received_line_count:=v_received_line_count+1;
  end loop;

  if v_received_line_count=0 then raise exception 'Nenhum item foi recebido.'; end if;

  update public.purchase_receipts
  set total_amount=round(v_total,2)
  where id=v_receipt.id
  returning * into v_receipt;

  select not exists(
    select 1 from public.purchase_order_items poi
    where poi.purchase_order_id=v_order.id
      and poi.received_quantity<poi.quantity
  ) into v_all_received;

  update public.purchase_orders
  set status=case when v_all_received then 'received' else 'partially_received' end,
      received_at=case when v_all_received then now() else received_at end
  where id=v_order.id;

  insert into public.accounts_payable(
    company_id,supplier_id,purchase_order_id,purchase_receipt_id,
    description,amount,issue_date,due_date,status,created_by
  )
  values(
    v_company_id,v_order.supplier_id,v_order.id,v_receipt.id,
    'Compra #'||coalesce(v_order.order_number,left(v_order.id::text,8)),
    round(v_total,2),current_date,v_order.due_date,'open',v_user_id
  );

  insert into public.audit_logs(company_id,actor_user_id,entity_type,entity_id,action,metadata)
  values(
    v_company_id,v_user_id,'purchase_receipt',v_receipt.id,'purchase.received',
    jsonb_build_object('purchase_order_id',v_order.id,'total_amount',v_total,'all_received',v_all_received)
  );

  return v_receipt;
end;
$$;

revoke all on function public.create_purchase_order(uuid,jsonb,timestamptz,date,text) from public,anon,authenticated;
grant execute on function public.create_purchase_order(uuid,jsonb,timestamptz,date,text) to authenticated;

revoke all on function public.receive_purchase_order(uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.receive_purchase_order(uuid,jsonb,text) to authenticated;
