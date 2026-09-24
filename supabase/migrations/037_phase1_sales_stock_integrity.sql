-- Phase 1: move stock movements out of audit side effects.
-- Operational event -> stock movement + audit log.
-- Audit log is never an operational command source.

create or replace function public.complete_sale(p_sale_id uuid)
returns public.sales language plpgsql security definer set search_path=public
as $function$
declare
  v_sale public.sales; v_is_member boolean; v_item record; v_item_count integer;
  v_subtotal numeric(12,2):=0; v_total_cost numeric(12,2):=0; v_total numeric(12,2):=0;
  v_margin numeric(12,2):=0; v_stock_before numeric(12,3); v_stock_after numeric(12,3);
begin
  if auth.uid() is null then raise exception 'Usuário não autenticado.'; end if;
  select * into v_sale from public.sales where id=p_sale_id for update;
  if v_sale is null then raise exception 'Venda não encontrada.'; end if;
  select exists(select 1 from public.company_members cm where cm.company_id=v_sale.company_id and cm.user_id=auth.uid()) into v_is_member;
  if not v_is_member then raise exception 'Você não tem acesso a esta venda.'; end if;
  if v_sale.status<>'draft' then raise exception 'Apenas vendas em rascunho podem ser concluídas.'; end if;
  select count(*) into v_item_count from public.sale_items where sale_id=p_sale_id;
  if v_item_count=0 then raise exception 'Adicione ao menos um item antes de concluir a venda.'; end if;
  select coalesce(sum(total_amount),0),coalesce(sum(quantity*unit_cost),0) into v_subtotal,v_total_cost from public.sale_items where sale_id=p_sale_id;
  if v_sale.discount_amount+v_sale.loyalty_discount_amount>v_subtotal then raise exception 'O desconto da venda não pode ser maior que o subtotal.'; end if;
  v_total:=greatest(0,v_subtotal-v_sale.discount_amount-v_sale.loyalty_discount_amount); v_margin:=v_total-v_total_cost;
  for v_item in select * from public.sale_items where sale_id=p_sale_id and item_type='product' loop
    select stock_quantity into v_stock_before from public.products where id=v_item.product_id for update;
    update public.products set stock_quantity=stock_quantity-v_item.quantity where id=v_item.product_id and company_id=v_sale.company_id and stock_quantity>=v_item.quantity returning stock_quantity into v_stock_after;
    if not found then raise exception 'Estoque insuficiente para "%".',v_item.description; end if;
    insert into public.stock_movements(company_id,product_id,direction,quantity,stock_before,stock_after,reason,source,reference_id,created_by)
    values(v_sale.company_id,v_item.product_id,'out',v_item.quantity,v_stock_before,v_stock_after,'sale','sale',p_sale_id,auth.uid());
    insert into public.audit_logs(company_id,actor_user_id,entity_type,entity_id,action,metadata)
    values(v_sale.company_id,auth.uid(),'sale',p_sale_id,'sale.stock_adjusted',jsonb_build_object('product_id',v_item.product_id,'quantity',v_item.quantity,'stock_before',v_stock_before,'stock_after',v_stock_after,'reason','sale'));
  end loop;
  update public.sales set status='completed',subtotal=v_subtotal,total_cost=v_total_cost,total_amount=v_total,estimated_margin=v_margin,completed_at=now() where id=p_sale_id returning * into v_sale;
  insert into public.audit_logs(company_id,actor_user_id,entity_type,entity_id,action,metadata)
  values(v_sale.company_id,auth.uid(),'sale',p_sale_id,'sale.completed',jsonb_build_object('total_amount',v_total,'total_cost',v_total_cost,'estimated_margin',v_margin));
  return v_sale;
end;
$function$;

create or replace function public.cancel_sale(p_sale_id uuid,p_reason text default null)
returns public.sales language plpgsql security definer set search_path=public
as $function$
declare
  v_sale public.sales; v_role public.company_role; v_item record;
  v_stock_before numeric(12,3); v_stock_after numeric(12,3);
begin
  if auth.uid() is null then raise exception 'Usuário não autenticado.'; end if;
  select * into v_sale from public.sales where id=p_sale_id for update;
  if v_sale is null then raise exception 'Venda não encontrada.'; end if;
  select cm.role into v_role from public.company_members cm where cm.company_id=v_sale.company_id and cm.user_id=auth.uid();
  if v_role is null then raise exception 'Você não tem acesso a esta venda.'; end if;
  if v_role='employee' and v_sale.user_id<>auth.uid() then raise exception 'Você só pode cancelar vendas registradas por você.'; end if;
  if v_sale.status<>'completed' then raise exception 'Apenas vendas concluídas podem ser canceladas.'; end if;
  for v_item in select * from public.sale_items where sale_id=p_sale_id and item_type='product' loop
    update public.products set stock_quantity=stock_quantity+v_item.quantity where id=v_item.product_id and company_id=v_sale.company_id returning stock_quantity into v_stock_after;
    if not found then raise exception 'Produto do item "%" não encontrado para restaurar estoque.',v_item.description; end if;
    v_stock_before:=v_stock_after-v_item.quantity;
    insert into public.stock_movements(company_id,product_id,direction,quantity,stock_before,stock_after,reason,source,reference_id,created_by)
    values(v_sale.company_id,v_item.product_id,'in',v_item.quantity,v_stock_before,v_stock_after,'sale_cancelled','sale_cancellation',p_sale_id,auth.uid());
    insert into public.audit_logs(company_id,actor_user_id,entity_type,entity_id,action,metadata)
    values(v_sale.company_id,auth.uid(),'sale',p_sale_id,'sale.stock_adjusted',jsonb_build_object('product_id',v_item.product_id,'quantity',v_item.quantity,'stock_before',v_stock_before,'stock_after',v_stock_after,'reason','sale_cancelled'));
  end loop;
  update public.sales set status='cancelled',cancelled_at=now(),cancelled_by=auth.uid(),cancelled_reason=p_reason where id=p_sale_id returning * into v_sale;
  insert into public.audit_logs(company_id,actor_user_id,entity_type,entity_id,action,metadata)
  values(v_sale.company_id,auth.uid(),'sale',p_sale_id,'sale.cancelled',jsonb_build_object('reason',p_reason));
  return v_sale;
end;
$function$;