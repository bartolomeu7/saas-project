-- Bateria de Operação (26/11): caixa nunca fica negativo, pagamento de fornecedor sem data futura,
-- recebimento com custo 0 não zera o custo do produto e sempre fica no histórico.
-- Não altera dados existentes. Rollback: supabase/rollback/20261126120000_operacao_caixa_compras.down.sql
begin;

-- Toda saída em dinheiro (Caixa, Financeiro, RH, Compras, estornos) passa por aqui.
create or replace function public.guard_cash_drawer()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_available numeric(14, 2);
  v_opening numeric(12, 2);
begin
  -- trava o caixa: duas saídas simultâneas não podem gastar o mesmo dinheiro
  select r.opening_balance into v_opening from public.cash_registers r where r.id = new.cash_register_id for update;
  select v_opening + coalesce(sum(case when m.direction = 'in' then m.amount else -m.amount end), 0)
    into v_available
    from public.cash_movements m
   where m.cash_register_id = new.cash_register_id and m.method = 'cash';
  if new.amount > v_available then
    raise exception 'Saldo insuficiente no caixa: há R$ % em dinheiro e a saída é de R$ %. Registre uma entrada no caixa ou use outra forma de pagamento.',
      translate(to_char(v_available, 'FM999,999,999,990.00'), ',.', '.,'),
      translate(to_char(new.amount, 'FM999,999,999,990.00'), ',.', '.,');
  end if;
  return new;
end
$function$;

revoke all on function public.guard_cash_drawer() from public, anon, authenticated;

drop trigger if exists cash_movements_guard_drawer on public.cash_movements;
create trigger cash_movements_guard_drawer
  before insert on public.cash_movements
  for each row
  when (new.direction = 'out' and new.method = 'cash')
  execute function public.guard_cash_drawer();

CREATE OR REPLACE FUNCTION public.pay_accounts_payable(p_payable_id uuid, p_amount numeric, p_method sale_payment_method, p_payment_date date DEFAULT today_sao_paulo(), p_notes text DEFAULT NULL::text)
 RETURNS accounts_payable
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid:=public.current_profile_user_id();
  v_company_id uuid;
  v_role public.company_role;
  v_payable public.accounts_payable;
  v_remaining numeric(12,2);
  v_register_id uuid;
begin
  if v_user_id is null then raise exception 'Usuário não autenticado.'; end if;

  select company_id,role into v_company_id,v_role
  from public.company_members
  where user_id=v_user_id
  limit 1;

  if v_company_id is null then raise exception 'Nenhuma empresa encontrada para o usuário atual.'; end if;
  if v_role not in('owner','admin') then raise exception 'Apenas owner/admin podem pagar contas.'; end if;
  if p_amount is null or p_amount<=0 then raise exception 'O valor do pagamento deve ser maior que zero.'; end if;
  if p_payment_date > public.today_sao_paulo() then raise exception 'A data do pagamento não pode ser futura.'; end if;

  select * into v_payable
  from public.accounts_payable
  where id=p_payable_id and company_id=v_company_id
  for update;

  if v_payable is null then raise exception 'Conta a pagar não encontrada.'; end if;
  if v_payable.status in('cancelled','paid') then raise exception 'Esta conta não pode receber novos pagamentos.'; end if;

  v_remaining:=round(v_payable.amount-coalesce(v_payable.paid_amount,0),2);
  if p_amount>v_remaining then raise exception 'O pagamento excede o saldo da conta.'; end if;

  if p_method='cash' then
    select id into v_register_id
    from public.cash_registers
    where company_id=v_company_id and status='open'
    for update;
    if v_register_id is null then raise exception 'Abra o caixa antes de pagar em dinheiro.'; end if;
  end if;

  update public.accounts_payable
  set paid_amount=round(coalesce(paid_amount,0)+p_amount,2),
      status=case
        when round(coalesce(paid_amount,0)+p_amount,2)>=amount
          then 'paid'::public.accounts_payable_status
        else 'partial'::public.accounts_payable_status
      end,
      paid_at=case
        when round(coalesce(paid_amount,0)+p_amount,2)>=amount
          then coalesce(paid_at,now())
        else paid_at
      end,
      paid_method=p_method,
      notes=coalesce(nullif(trim(p_notes),''),notes)
  where id=v_payable.id
  returning * into v_payable;

  perform public.seed_financial_defaults(v_company_id);

  -- Cada pagamento (inclusive parcelas) é um movimento financeiro próprio.
  -- Não reutilizamos accounts_payable.id como source_id porque uma única
  -- conta pode receber vários pagamentos.
  insert into public.financial_entries(
    company_id,direction,status,description,amount,occurred_on,paid_at,method,
    category_id,cost_center_id,supplier_id,source_type,source_id,notes,created_by
  )
  values(
    v_company_id,
    'expense',
    'posted',
    'Pagamento de fornecedor — '||v_payable.description,
    round(p_amount,2),
    coalesce(p_payment_date,public.today_sao_paulo()),
    now(),
    p_method,
    v_payable.category_id,
    v_payable.cost_center_id,
    v_payable.supplier_id,
    'accounts_payable_payment',
    gen_random_uuid(),
    nullif(
      concat_ws(
        ' | ',
        nullif(trim(p_notes),''),
        'Conta a pagar: '||left(v_payable.id::text,8)
      ),
      ''
    ),
    v_user_id
  );

  if p_method='cash' then
    insert into public.cash_movements(
      company_id,cash_register_id,direction,amount,method,description,source,created_by
    )
    values(
      v_company_id,
      v_register_id,
      'out',
      round(p_amount,2),
      p_method,
      'Pagamento de fornecedor — '||v_payable.description,
      'manual',
      v_user_id
    );
  end if;

  insert into public.audit_logs(company_id,actor_user_id,entity_type,entity_id,action,metadata)
  values(
    v_company_id,
    v_user_id,
    'accounts_payable',
    v_payable.id,
    'accounts_payable.payment',
    jsonb_build_object(
      'amount',p_amount,
      'paid_amount',v_payable.paid_amount,
      'remaining_after',round(v_payable.amount-v_payable.paid_amount,2)
    )
  );

  return v_payable;
end;
$function$;

CREATE OR REPLACE FUNCTION public.receive_purchase_order(p_purchase_order_id uuid, p_items jsonb, p_notes text DEFAULT NULL::text)
 RETURNS purchase_receipts
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid := public.current_profile_user_id();
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
        cost_price = case when v_unit_cost > 0 then v_unit_cost else cost_price end
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
  set status=case
        when v_all_received then 'received'::public.purchase_order_status
        else 'partially_received'::public.purchase_order_status
      end,
      received_at=case when v_all_received then now() else received_at end
  where id=v_order.id;

  /* zero-payable */ if round(v_total,2) > 0 then insert into public.accounts_payable(
    company_id,supplier_id,purchase_order_id,purchase_receipt_id,
    description,amount,issue_date,due_date,status,created_by
  )
  values(
    v_company_id,v_order.supplier_id,v_order.id,v_receipt.id,
    'Compra #'||coalesce(v_order.order_number,left(v_order.id::text,8)),
    round(v_total,2),public.today_sao_paulo(),v_order.due_date,'open',v_user_id
  ); end if; /* /zero-payable */

  insert into public.audit_logs(company_id,actor_user_id,entity_type,entity_id,action,metadata)
  values(
    v_company_id,v_user_id,'purchase_receipt',v_receipt.id,'purchase.received',
    jsonb_build_object('purchase_order_id',v_order.id,'total_amount',v_total,'all_received',v_all_received)
  );

  return v_receipt;
end;
$function$;

CREATE OR REPLACE FUNCTION public.cancel_purchase_receipt(p_purchase_receipt_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS purchase_receipts
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid := public.current_profile_user_id();
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

  /* block-partial */ if v_payable_status in ('paid','partial') then
    raise exception 'Não é possível estornar este recebimento: a conta a pagar dele já tem pagamento registrado (total ou parcial).';
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

    if v_item.unit_cost > 0 then
    if not exists(
      select 1
      from public.purchase_receipt_items pri2
      join public.purchase_receipts pr2 on pr2.id=pri2.purchase_receipt_id
      where pri2.product_id=v_item.product_id
        and pr2.status='posted'
        and pr2.id<>v_receipt.id
        and pri2.unit_cost>0
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
          and pri2.unit_cost>0
        order by pri2.created_at desc
        limit 1
      )
      where p.id=v_product.id;
    end if;
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

  -- `v_order is not null` em variável composta só é verdadeiro se TODOS os campos
  -- forem não nulos (received_at costuma ser null): usar v_order.id.
  if v_order.id is not null then
    update public.purchase_orders
    set status=case
      when exists(
        select 1 from public.purchase_order_items poi
        where poi.purchase_order_id=v_order.id and poi.received_quantity>0
      ) then 'partially_received'::public.purchase_order_status
      else 'ordered'::public.purchase_order_status
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
$function$;

commit;
