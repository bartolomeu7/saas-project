-- Phase B — integridade transacional
-- Esta migration foi aplicada ao Supabase antes de ser versionada no GitHub.
-- O banco de produção NÃO deve reaplicar o arquivo: a alteração já consta no
-- histórico live como phase_b_integrity_hardening.
-- Objetivo: manter GitHub reproduzível e registrar a implementação aplicada.

create or replace function public.adjust_product_stock(
  p_product_id uuid,
  p_new_quantity numeric,
  p_reason text
)
returns public.products
language plpgsql
security definer
set search_path=public
as $$
declare
  v_user_id uuid := auth.uid();
  v_company_id uuid;
  v_role public.company_role;
  v_product public.products;
  v_previous numeric(12,3);
  v_delta numeric(12,3);
  v_direction public.stock_movement_direction;
  v_event_id uuid := gen_random_uuid();
  v_reason text;
begin
  if v_user_id is null then raise exception 'Usuário não autenticado.'; end if;
  if p_new_quantity is null or p_new_quantity < 0 then
    raise exception 'A quantidade de estoque não pode ser negativa.';
  end if;

  v_reason := nullif(trim(p_reason), '');
  if v_reason is null then raise exception 'Informe o motivo do ajuste de estoque.'; end if;
  if char_length(v_reason) > 500 then
    raise exception 'O motivo do ajuste deve ter no máximo 500 caracteres.';
  end if;

  select cm.company_id, cm.role into v_company_id, v_role
  from public.company_members cm
  where cm.user_id = v_user_id
  order by cm.created_at asc
  limit 1;

  if v_company_id is null then raise exception 'Nenhuma empresa encontrada para o usuário atual.'; end if;
  if v_role not in ('owner','admin') then
    raise exception 'Apenas owner/admin podem ajustar estoque manualmente.';
  end if;

  select * into v_product
  from public.products
  where id = p_product_id and company_id = v_company_id
  for update;

  if v_product is null then raise exception 'Produto não encontrado.'; end if;

  v_previous := v_product.stock_quantity;
  v_delta := round(p_new_quantity - v_previous, 3);

  if v_delta = 0 then raise exception 'O novo estoque é igual ao estoque atual.'; end if;

  v_direction := case when v_delta > 0 then 'in' else 'out' end;

  update public.products
  set stock_quantity = p_new_quantity
  where id = v_product.id;

  insert into public.stock_movements(
    company_id, product_id, direction, quantity, stock_before, stock_after,
    reason, source, reference_id, created_by
  )
  values(
    v_company_id, v_product.id, v_direction, abs(v_delta),
    v_previous, p_new_quantity, v_reason, 'manual', v_event_id, v_user_id
  );

  insert into public.audit_logs(
    company_id, actor_user_id, entity_type, entity_id, action, metadata
  )
  values(
    v_company_id, v_user_id, 'product', v_product.id, 'product_stock_adjusted',
    jsonb_build_object(
      'previousStock', v_previous,
      'newStock', p_new_quantity,
      'difference', v_delta,
      'reason', v_reason,
      'stockMovementId', v_event_id
    )
  );

  select * into v_product from public.products where id = v_product.id;
  return v_product;
end;
$$;

revoke all on function public.adjust_product_stock(uuid,numeric,text) from public, anon, authenticated;
grant execute on function public.adjust_product_stock(uuid,numeric,text) to authenticated;

create or replace function public.complete_sale(p_sale_id uuid)
returns public.sales
language plpgsql
security definer
set search_path=public
as $$
declare
  v_sale public.sales;
  v_is_member boolean;
  v_item record;
  v_item_count integer;
  v_subtotal numeric(12,2):=0;
  v_total_cost numeric(12,2):=0;
  v_total numeric(12,2):=0;
  v_margin numeric(12,2):=0;
  v_stock_before numeric(12,3);
  v_stock_after numeric(12,3);
begin
  if auth.uid() is null then raise exception 'Usuário não autenticado.'; end if;

  select * into v_sale from public.sales where id=p_sale_id for update;
  if v_sale is null then raise exception 'Venda não encontrada.'; end if;

  select exists(
    select 1 from public.company_members cm
    where cm.company_id=v_sale.company_id and cm.user_id=auth.uid()
  ) into v_is_member;

  if not v_is_member then raise exception 'Você não tem acesso a esta venda.'; end if;
  if v_sale.status<>'draft' then
    raise exception 'Apenas vendas em rascunho podem ser concluídas.';
  end if;

  select count(*) into v_item_count from public.sale_items where sale_id=p_sale_id;
  if v_item_count=0 then raise exception 'Adicione ao menos um item antes de concluir a venda.'; end if;

  select coalesce(sum(total_amount),0), coalesce(sum(quantity*unit_cost),0)
  into v_subtotal,v_total_cost
  from public.sale_items where sale_id=p_sale_id;

  if v_sale.discount_amount+v_sale.loyalty_discount_amount>v_subtotal then
    raise exception 'O desconto da venda não pode ser maior que o subtotal.';
  end if;

  v_total:=greatest(0,v_subtotal-v_sale.discount_amount-v_sale.loyalty_discount_amount);
  v_margin:=v_total-v_total_cost;

  for v_item in
    select * from public.sale_items
    where sale_id=p_sale_id and item_type='product'
    order by product_id,id
  loop
    select stock_quantity into v_stock_before
    from public.products where id=v_item.product_id for update;

    update public.products
    set stock_quantity=stock_quantity-v_item.quantity
    where id=v_item.product_id
      and company_id=v_sale.company_id
      and stock_quantity>=v_item.quantity
    returning stock_quantity into v_stock_after;

    if not found then raise exception 'Estoque insuficiente para "%".',v_item.description; end if;

    insert into public.stock_movements(
      company_id,product_id,direction,quantity,stock_before,stock_after,
      reason,source,reference_id,created_by
    )
    values(
      v_sale.company_id,v_item.product_id,'out',v_item.quantity,
      v_stock_before,v_stock_after,'sale','sale',p_sale_id,auth.uid()
    );

    insert into public.audit_logs(
      company_id,actor_user_id,entity_type,entity_id,action,metadata
    )
    values(
      v_sale.company_id,auth.uid(),'sale',p_sale_id,'sale.stock_adjusted',
      jsonb_build_object(
        'product_id',v_item.product_id,
        'quantity',v_item.quantity,
        'stock_before',v_stock_before,
        'stock_after',v_stock_after,
        'reason','sale'
      )
    );
  end loop;

  update public.sales
  set status='completed', subtotal=v_subtotal, total_cost=v_total_cost,
      total_amount=v_total, estimated_margin=v_margin, completed_at=now()
  where id=p_sale_id
  returning * into v_sale;

  insert into public.audit_logs(
    company_id,actor_user_id,entity_type,entity_id,action,metadata
  )
  values(
    v_sale.company_id,auth.uid(),'sale',p_sale_id,'sale.completed',
    jsonb_build_object(
      'total_amount',v_total,
      'total_cost',v_total_cost,
      'estimated_margin',v_margin
    )
  );

  return v_sale;
end;
$$;

revoke all on function public.complete_sale(uuid) from public, anon, authenticated;
grant execute on function public.complete_sale(uuid) to authenticated;

create or replace function public.cancel_sale(
  p_sale_id uuid,
  p_reason text default null
)
returns public.sales
language plpgsql
security definer
set search_path=public
as $$
declare
  v_sale public.sales;
  v_role public.company_role;
  v_item record;
  v_stock_before numeric(12,3);
  v_stock_after numeric(12,3);
begin
  if auth.uid() is null then raise exception 'Usuário não autenticado.'; end if;

  select * into v_sale from public.sales where id=p_sale_id for update;
  if v_sale is null then raise exception 'Venda não encontrada.'; end if;

  select cm.role into v_role
  from public.company_members cm
  where cm.company_id=v_sale.company_id and cm.user_id=auth.uid();

  if v_role is null then raise exception 'Você não tem acesso a esta venda.'; end if;
  if v_role='employee' and v_sale.user_id<>auth.uid() then
    raise exception 'Você só pode cancelar vendas registradas por você.';
  end if;
  if v_sale.status<>'completed' then
    raise exception 'Apenas vendas concluídas podem ser canceladas.';
  end if;

  for v_item in
    select * from public.sale_items
    where sale_id=p_sale_id and item_type='product'
    order by product_id,id
  loop
    select stock_quantity into v_stock_before
    from public.products
    where id=v_item.product_id and company_id=v_sale.company_id
    for update;

    if not found then
      raise exception 'Produto do item "%" não encontrado para restaurar estoque.',v_item.description;
    end if;

    update public.products
    set stock_quantity=stock_quantity+v_item.quantity
    where id=v_item.product_id
    returning stock_quantity into v_stock_after;

    v_stock_before:=v_stock_after-v_item.quantity;

    insert into public.stock_movements(
      company_id,product_id,direction,quantity,stock_before,stock_after,
      reason,source,reference_id,created_by
    )
    values(
      v_sale.company_id,v_item.product_id,'in',v_item.quantity,
      v_stock_before,v_stock_after,'sale_cancelled','sale_cancellation',p_sale_id,auth.uid()
    );

    insert into public.audit_logs(
      company_id,actor_user_id,entity_type,entity_id,action,metadata
    )
    values(
      v_sale.company_id,auth.uid(),'sale',p_sale_id,'sale.stock_adjusted',
      jsonb_build_object(
        'product_id',v_item.product_id,
        'quantity',v_item.quantity,
        'stock_before',v_stock_before,
        'stock_after',v_stock_after,
        'reason','sale_cancelled'
      )
    );
  end loop;

  update public.sales
  set status='cancelled',cancelled_at=now(),cancelled_by=auth.uid(),cancelled_reason=p_reason
  where id=p_sale_id
  returning * into v_sale;

  insert into public.audit_logs(
    company_id,actor_user_id,entity_type,entity_id,action,metadata
  )
  values(
    v_sale.company_id,auth.uid(),'sale',p_sale_id,'sale.cancelled',
    jsonb_build_object('reason',p_reason)
  );

  return v_sale;
end;
$$;

revoke all on function public.cancel_sale(uuid,text) from public, anon, authenticated;
grant execute on function public.cancel_sale(uuid,text) to authenticated;

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
  from public.company_members cm
  where cm.user_id=v_user_id
  order by cm.created_at asc
  limit 1;

  if v_company_id is null then raise exception 'Nenhuma empresa encontrada para o usuário atual.'; end if;
  if v_role not in ('owner','admin') then
    raise exception 'Apenas owner/admin podem cancelar recebimentos.';
  end if;

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

  update public.purchase_receipts set status='cancelled' where id=v_receipt.id;
  update public.accounts_payable
  set status='cancelled'
  where purchase_receipt_id=v_receipt.id and status='open';

  select * into v_order
  from public.purchase_orders
  where id=v_receipt.purchase_order_id
  for update;

  if v_order is not null then
    update public.purchase_orders
    set status=case
      when exists(
        select 1 from public.purchase_order_items poi
        where poi.purchase_order_id=v_order.id and poi.received_quantity>0
      ) then 'partially_received'
      else 'ordered'
    end,
    received_at=null
    where id=v_order.id;
  end if;

  insert into public.audit_logs(
    company_id,actor_user_id,entity_type,entity_id,action,metadata
  )
  values(
    v_company_id,v_user_id,'purchase_receipt',v_receipt.id,'purchase.receipt_cancelled',
    jsonb_build_object('reason',p_reason,'purchase_order_id',v_receipt.purchase_order_id)
  );

  return v_receipt;
end;
$$;

revoke all on function public.cancel_purchase_receipt(uuid,text) from public, anon, authenticated;
grant execute on function public.cancel_purchase_receipt(uuid,text) to authenticated;
