-- RECUPERAÇÃO HISTÓRICA — 026_phase2_purchase_order_hardening
-- Reconstruído do estado aplicado no Supabase.

create or replace function public.validate_purchase_company_links()
returns trigger
language plpgsql
set search_path='public'
as $$
declare
  v_supplier_company uuid;
  v_product_company uuid;
  v_order_company uuid;
begin
  if tg_table_name='purchase_orders' then
    select company_id into v_supplier_company
    from public.suppliers where id=new.supplier_id;

    if v_supplier_company is distinct from new.company_id then
      raise exception 'Fornecedor não pertence à empresa atual.';
    end if;

  elsif tg_table_name='purchase_order_items' then
    select company_id into v_product_company
    from public.products where id=new.product_id;

    select company_id into v_order_company
    from public.purchase_orders where id=new.purchase_order_id;

    if v_product_company is distinct from new.company_id
       or v_order_company is distinct from new.company_id then
      raise exception 'Produto ou pedido de compra não pertence à empresa atual.';
    end if;

  elsif tg_table_name='supplier_products' then
    select company_id into v_supplier_company
    from public.suppliers where id=new.supplier_id;

    select company_id into v_product_company
    from public.products where id=new.product_id;

    if v_supplier_company is distinct from new.company_id
       or v_product_company is distinct from new.company_id then
      raise exception 'Fornecedor ou produto não pertence à empresa atual.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists purchase_orders_validate_company_links on public.purchase_orders;
create trigger purchase_orders_validate_company_links
before insert or update on public.purchase_orders
for each row execute function public.validate_purchase_company_links();

drop trigger if exists purchase_order_items_validate_company_links on public.purchase_order_items;
create trigger purchase_order_items_validate_company_links
before insert or update on public.purchase_order_items
for each row execute function public.validate_purchase_company_links();

drop trigger if exists supplier_products_validate_company_links on public.supplier_products;
create trigger supplier_products_validate_company_links
before insert or update on public.supplier_products
for each row execute function public.validate_purchase_company_links();

create or replace function public.cancel_purchase_order(
  p_purchase_order_id uuid,
  p_reason text default null
)
returns public.purchase_orders
language plpgsql
security definer
set search_path='public'
as $$
declare
  v_user_id uuid:=auth.uid();
  v_company_id uuid;
  v_role public.company_role;
  v_order public.purchase_orders;
begin
  select cm.company_id,cm.role into v_company_id,v_role
  from public.company_members cm where cm.user_id=v_user_id;

  if v_company_id is null then raise exception 'Nenhuma empresa encontrada para o usuário atual.'; end if;
  if v_role not in ('owner','admin') then raise exception 'Apenas owner/admin podem cancelar pedidos de compra.'; end if;

  select * into v_order
  from public.purchase_orders
  where id=p_purchase_order_id and company_id=v_company_id
  for update;

  if v_order is null then raise exception 'Pedido de compra não encontrado.'; end if;
  if v_order.status='cancelled' then raise exception 'Este pedido já está cancelado.'; end if;
  if v_order.status in ('received','partially_received') then
    raise exception 'Pedidos já recebidos parcial ou totalmente não podem ser cancelados. Cancele o recebimento correspondente primeiro.';
  end if;

  update public.purchase_orders
  set status='cancelled'
  where id=v_order.id
  returning * into v_order;

  insert into public.audit_logs(company_id,actor_user_id,entity_type,entity_id,action,metadata)
  values(
    v_company_id,v_user_id,'purchase_order',v_order.id,'purchase_order.cancelled',
    jsonb_build_object('reason',p_reason)
  );

  return v_order;
end;
$$;

create or replace function public.cancel_purchase_receipt(
  p_purchase_receipt_id uuid,
  p_reason text default null
)
returns public.purchase_receipts
language plpgsql
security definer
set search_path='public'
as $$
declare
  v_user_id uuid:=auth.uid();
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
    order by pri.product_id,pri.id
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

    if not exists(
      select 1
      from public.purchase_receipt_items pri2
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
        where pri2.product_id=v_item.product_id
          and pr2.status='posted'
          and pr2.id<>v_receipt.id
        order by pri2.created_at desc
        limit 1
      )
      where p.id=v_product.id;
    end if;
  end loop;

  update public.purchase_receipts
  set status='cancelled'
  where id=v_receipt.id;

  update public.accounts_payable
  set status='cancelled'
  where purchase_receipt_id=v_receipt.id
    and status='open';

  select * into v_order
  from public.purchase_orders
  where id=v_receipt.purchase_order_id
  for update;

  if v_order is not null then
    update public.purchase_orders
    set status=case
      when exists(
        select 1 from public.purchase_order_items poi
        where poi.purchase_order_id=v_order.id
          and poi.received_quantity>0
      ) then 'partially_received'
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

revoke all on function public.cancel_purchase_order(uuid,text) from public,anon,authenticated;
grant execute on function public.cancel_purchase_order(uuid,text) to authenticated;

revoke all on function public.cancel_purchase_receipt(uuid,text) from public,anon,authenticated;
grant execute on function public.cancel_purchase_receipt(uuid,text) to authenticated;

revoke all on function public.validate_purchase_company_links() from public,anon,authenticated;
