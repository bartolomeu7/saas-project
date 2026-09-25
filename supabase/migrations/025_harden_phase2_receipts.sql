-- =============================================================================
-- Migration 025 — reconstruída a partir do SQL REALMENTE aplicado no Supabase.
--
-- Fonte da verdade: supabase_migrations.schema_migrations
--   version 20260922001144, name "025_harden_phase2_receipts".
-- O corpo abaixo (a partir da linha "-- FASE 2 hardening — ...") é o texto
-- aplicado no banco live, sem alterações. NÃO reaplicar no banco existente.
-- Ver supabase/migrations/README.md (mapa arquivo ↔ histórico live).
-- =============================================================================

-- FASE 2 hardening — recebimento idempotente e estorno seguro.

alter table public.purchase_receipt_items
  add column if not exists previous_cost_price numeric(12,2) not null default 0;

drop policy if exists "purchase_orders_insert_own_company" on public.purchase_orders;
drop policy if exists "purchase_orders_update_own_company" on public.purchase_orders;
drop policy if exists "purchase_order_items_insert_own_company" on public.purchase_order_items;
drop policy if exists "purchase_order_items_update_own_company" on public.purchase_order_items;
drop policy if exists "supplier_products_insert_own_company" on public.supplier_products;
drop policy if exists "supplier_products_update_own_company" on public.supplier_products;

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

  select cm.company_id, cm.role into v_company_id, v_role
  from public.company_members cm where cm.user_id = v_user_id;

  if v_company_id is null then raise exception 'Nenhuma empresa encontrada para o usuário atual.'; end if;
  if v_role not in ('owner','admin') then raise exception 'Apenas owner/admin podem receber compras.'; end if;

  select * into v_order
  from public.purchase_orders
  where id = p_purchase_order_id and company_id = v_company_id
  for update;

  if v_order is null then raise exception 'Pedido de compra não encontrado.'; end if;
  if v_order.status in ('received','cancelled') then raise exception 'Este pedido não pode mais receber mercadoria.'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'Informe ao menos um item recebido.'; end if;

  insert into public.purchase_receipts(company_id,purchase_order_id,supplier_id,status,received_by,notes)
  values(v_company_id,v_order.id,v_order.supplier_id,'posted',v_user_id,nullif(trim(p_notes),'')) returning * into v_receipt;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    select * into v_order_item
    from public.purchase_order_items
    where id = (v_item->>'purchase_order_item_id')::uuid
      and purchase_order_id = v_order.id
      and company_id = v_company_id
    for update;

    if v_order_item is null then raise exception 'Item do pedido não encontrado.'; end if;

    v_qty := (v_item->>'quantity')::numeric;
    v_remaining := v_order_item.quantity - v_order_item.received_quantity;

    if v_qty <= 0 then raise exception 'A quantidade recebida deve ser maior que zero.'; end if;
    if v_qty > v_remaining then raise exception 'A quantidade recebida excede o saldo do item "%".',v_order_item.description; end if;

    select * into v_product
    from public.products
    where id=v_order_item.product_id and company_id=v_company_id
    for update;

    if v_product is null then raise exception 'Produto do item não encontrado.'; end if;

    v_unit_cost := v_order_item.unit_cost;

    insert into public.purchase_receipt_items(
      company_id,purchase_receipt_id,purchase_order_item_id,product_id,
      quantity,unit_cost,total_amount,previous_cost_price
    )
    values(
      v_company_id,v_receipt.id,v_order_item.id,v_order_item.product_id,
      v_qty,v_unit_cost,round(v_qty*v_unit_cost,2),v_product.cost_price
    )
    returning id into v_receipt_item_id;

    update public.products
    set stock_quantity = stock_quantity + v_qty,
        cost_price = v_unit_cost
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

    v_total := v_total + round(v_qty*v_unit_cost,2);
    v_received_line_count := v_received_line_count + 1;
  end loop;

  if v_received_line_count=0 then raise exception 'Nenhum item foi recebido.'; end if;

  update public.purchase_receipts set total_amount=round(v_total,2)
  where id=v_receipt.id returning * into v_receipt;

  select not exists(
    select 1 from public.purchase_order_items poi
    where poi.purchase_order_id=v_order.id and poi.received_quantity<poi.quantity
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

create or replace function public.cancel_purchase_receipt(
  p_purchase_receipt_id uuid,
  p_reason text default null
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
  v_receipt public.purchase_receipts;
  v_item record;
  v_product public.products;
  v_order public.purchase_orders;
  v_payable_status public.accounts_payable_status;
begin
  if v_user_id is null then raise exception 'Usuário não autenticado.'; end if;

  select cm.company_id,cm.role into v_company_id,v_role
  from public.company_members cm where cm.user_id=v_user_id;

  if v_company_id is null then raise exception 'Nenhuma empresa encontrada para o usuário atual.'; end if;
  if v_role not in ('owner','admin') then raise exception 'Apenas owner/admin podem cancelar recebimentos.'; end if;

  select * into v_receipt
  from public.purchase_receipts
  where id=p_purchase_receipt_id and company_id=v_company_id
  for update;

  if v_receipt is null then raise exception 'Recebimento não encontrado.'; end if;
  if v_receipt.status<>'posted' then raise exception 'Este recebimento já está cancelado.'; end if;

  select status into v_payable_status
  from public.accounts_payable
  where purchase_receipt_id=v_receipt.id
  for update;

  if v_payable_status='paid' then
    raise exception 'Não é possível cancelar um recebimento cuja conta a pagar já foi quitada.';
  end if;

  for v_item in
    select pri.*,poi.purchase_order_id
    from public.purchase_receipt_items pri
    join public.purchase_order_items poi on poi.id=pri.purchase_order_item_id
    where pri.purchase_receipt_id=v_receipt.id
    for update
  loop
    select * into v_product
    from public.products
    where id=v_item.product_id and company_id=v_company_id
    for update;

    if v_product is null then raise exception 'Produto do recebimento não encontrado.'; end if;
    if v_product.stock_quantity<v_item.quantity then
      raise exception 'Estoque atual insuficiente para estornar "%".',v_product.name;
    end if;

    update public.products
    set stock_quantity=v_product.stock_quantity-v_item.quantity
    where id=v_product.id;

    insert into public.stock_movements(
      company_id,product_id,direction,quantity,stock_before,stock_after,
      reason,source,reference_id,created_by
    )
    values(
      v_company_id,v_product.id,'out',v_item.quantity,
      v_product.stock_quantity,v_product.stock_quantity-v_item.quantity,
      coalesce(nullif(trim(p_reason),''),'Cancelamento de recebimento'),
      'purchase_cancellation',v_item.id,v_user_id
    );

    update public.purchase_order_items
    set received_quantity=received_quantity-v_item.quantity
    where id=v_item.purchase_order_item_id;

    -- Reconstitui o último custo conhecido ainda válido. Se não existir
    -- outro recebimento postado para o produto, volta ao custo snapshot.
    if not exists(
      select 1 from public.purchase_receipt_items pri2
      join public.purchase_receipts pr2 on pr2.id=pri2.purchase_receipt_id
      where pri2.product_id=v_item.product_id
        and pr2.status='posted'
        and pr2.id<>v_receipt.id
    ) then
      update public.products
      set cost_price=v_item.previous_cost_price
      where id=v_product.id;
    else
      update public.products p
      set cost_price=(
        select pri2.unit_cost
        from public.purchase_receipt_items pri2
        join public.purchase_receipts pr2 on pr2.id=pri2.purchase_receipt_id
        where pri2.product_id=v_item.product_id and pr2.status='posted' and pr2.id<>v_receipt.id
        order by pri2.created_at desc
        limit 1
      )
      where p.id=v_product.id;
    end if;
  end loop;

  update public.purchase_receipts set status='cancelled' where id=v_receipt.id;
  update public.accounts_payable set status='cancelled' where purchase_receipt_id=v_receipt.id and status='open';

  select * into v_order from public.purchase_orders
  where id=v_receipt.purchase_order_id for update;

  if v_order is not null then
    update public.purchase_orders
    set status=case
      when exists(select 1 from public.purchase_order_items poi where poi.purchase_order_id=v_order.id and poi.received_quantity>0)
      then 'partially_received'
      else 'ordered'
    end,
    received_at=null
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
