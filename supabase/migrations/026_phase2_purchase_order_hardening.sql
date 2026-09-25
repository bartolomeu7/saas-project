-- =============================================================================
-- Migration 026 — reconstruída a partir do SQL REALMENTE aplicado no Supabase.
--
-- Fonte da verdade: supabase_migrations.schema_migrations
--   version 20260922001218, name "026_phase2_purchase_order_hardening".
-- O corpo abaixo (a partir da linha "-- FASE 2 refinamentos — ...") é o texto
-- aplicado no banco live, sem alterações. NÃO reaplicar no banco existente.
-- Os triggers de validação de compras têm o nome criado na 024
-- (*_validate_links); esta migration não cria triggers.
-- Ver supabase/migrations/README.md (mapa arquivo ↔ histórico live).
-- =============================================================================

-- FASE 2 refinamentos — identificador de pedido e cancelamento seguro.

create unique index if not exists purchase_orders_company_order_number_unique
on public.purchase_orders(company_id,order_number)
where order_number is not null;

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

    if v_qty<=0 or v_unit_cost<0 then raise exception 'Quantidade e custo do item precisam ser válidos.'; end if;

    select * into v_product
    from public.products
    where id=(v_item->>'product_id')::uuid and company_id=v_company_id and status='active'
    for share;

    if v_product is null then raise exception 'Produto inválido ou inativo no pedido.'; end if;

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

  update public.purchase_orders set subtotal=round(v_subtotal,2),total_amount=round(v_subtotal,2)
  where id=v_order.id returning * into v_order;

  insert into public.audit_logs(company_id,actor_user_id,entity_type,entity_id,action,metadata)
  values(
    v_company_id,v_user_id,'purchase_order',v_order.id,'purchase_order.created',
    jsonb_build_object('supplier_id',p_supplier_id,'total_amount',v_subtotal,'item_count',v_count)
  );

  return v_order;
end;
$$;

create or replace function public.cancel_purchase_order(
  p_purchase_order_id uuid,
  p_reason text default null
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

  update public.purchase_orders set status='cancelled' where id=v_order.id returning * into v_order;

  insert into public.audit_logs(company_id,actor_user_id,entity_type,entity_id,action,metadata)
  values(
    v_company_id,v_user_id,'purchase_order',v_order.id,'purchase_order.cancelled',
    jsonb_build_object('reason',p_reason)
  );

  return v_order;
end;
$$;

revoke all on function public.cancel_purchase_order(uuid,text) from public;
revoke execute on function public.cancel_purchase_order(uuid,text) from anon;
grant execute on function public.cancel_purchase_order(uuid,text) to authenticated;
