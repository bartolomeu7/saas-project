-- 041 — Correções da auditoria funcional (Fases 4–8)
--
-- *** NÃO APLICADA EM PRODUÇÃO. ***
-- Validada apenas no projeto Supabase de TESTE isolado (zlmxbqlpjstmllrvafmy).
-- A aplicação em produção (fpbcruinppjbwtinzrdg) depende de autorização
-- explícita depois do relatório da Fase 8.
--
-- Bugs cobertos (IDs da matriz de bugs do relatório):
--   BUG-01  receive_purchase_order  — CASE devolvia text para coluna enum (42804)
--   BUG-02  cancel_purchase_receipt — idem
--   BUG-03  list_company_team       — coluna OUT ambígua com colunas da tabela (42702)
--   BUG-04  list_platform_admin_companies — idem
--   BUG-05  H1: estoque/totais/status de venda alteráveis direto pela API
--           (o trigger guard_direct_critical_mutations nunca bloqueava: em
--           SECURITY DEFINER, current_user é sempre o dono da função).
--           Substituído por privilégio de COLUNA para o papel `authenticated`.
--   BUG-06  sale_payments sem INSERT para authenticated (migration 036) mas o
--           app ainda inserindo direto -> "Registrar pagamento" falhava sempre.
--           Nova RPC add_sale_payment.
--   BUG-07  audit_logs sem INSERT para authenticated (036 + 20260923115135):
--           eventos gravados pelo app (Server Actions) eram descartados.
--           Nova RPC write_audit_log (contexto usuário com lista de ações permitidas e
--           contexto sistema/service_role só para subscription_payment.*).
--   BUG-08  cancel_sale não estornava pagamentos/caixa/financeiro.
--   BUG-09  adjust_loyalty_points aceitava ajuste que deixava o saldo negativo.
--   BUG-10  H3: add_existing_company_member não aplicava o limite do plano.
--   BUG-11  H4: plano TEST_R1 (R$ 1) ativo no catálogo público.
--   BUG-12  H2: benefícios (tickets/grupos/acesso antecipado) sem implementação.
--   BUG-13  cancel_purchase_receipt não revertia o status do pedido (IS NOT NULL em
--           variável composta com received_at nulo).
--
-- Todas as funções abaixo usam CREATE OR REPLACE / IF EXISTS: é seguro reexecutar.
-- ATENÇÃO (privilégios por coluna): novas colunas em public.products/public.sales
-- NÃO ficam atualizáveis por `authenticated` até serem incluídas nos GRANTs abaixo.

-- ---------------------------------------------------------------------------
-- BUG-01 — receive_purchase_order
-- ---------------------------------------------------------------------------
create or replace function public.receive_purchase_order(
  p_purchase_order_id uuid,
  p_items jsonb,
  p_notes text default null
)
returns public.purchase_receipts
language plpgsql
security definer
set search_path to 'public'
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
  set status=case
        when v_all_received then 'received'::public.purchase_order_status
        else 'partially_received'::public.purchase_order_status
      end,
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

revoke all on function public.receive_purchase_order(uuid,jsonb,text) from public, anon, authenticated;
grant execute on function public.receive_purchase_order(uuid,jsonb,text) to authenticated;

-- ---------------------------------------------------------------------------
-- BUG-02 — cancel_purchase_receipt
-- ---------------------------------------------------------------------------
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
$$;

revoke all on function public.cancel_purchase_receipt(uuid,text) from public, anon, authenticated;
grant execute on function public.cancel_purchase_receipt(uuid,text) to authenticated;

-- ---------------------------------------------------------------------------
-- BUG-03 — list_company_team (colunas OUT `role`/`user_id`/`company_id` colidiam
-- com as colunas da tabela no SELECT inicial)
-- ---------------------------------------------------------------------------
create or replace function public.list_company_team()
returns table(
  member_id uuid, user_id uuid, role public.company_role, full_name text, email text,
  avatar_url text, professional_id uuid, display_name text, phone text, specialty text,
  color text, notes text, professional_active boolean
)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_company_id uuid;
  v_role public.company_role;
begin
  select cm0.company_id, cm0.role into v_company_id, v_role
  from public.company_members cm0
  where cm0.user_id = auth.uid()
  order by cm0.created_at asc
  limit 1;

  if v_company_id is null then
    raise exception 'Nenhuma empresa encontrada.';
  end if;

  if v_role not in ('owner','admin','employee') then
    raise exception 'Acesso negado.';
  end if;

  return query
  select
    cm.id,
    cm.user_id,
    cm.role,
    p.full_name,
    p.email,
    p.avatar_url,
    pp.id,
    pp.display_name,
    pp.phone,
    pp.specialty,
    pp.color,
    pp.notes,
    pp.active
  from public.company_members cm
  left join public.profiles p on p.user_id = cm.user_id
  left join public.professional_profiles pp on pp.company_member_id = cm.id
  where cm.company_id = v_company_id
  order by
    case when cm.role = 'owner' then 0 when cm.role = 'admin' then 1 else 2 end,
    coalesce(nullif(trim(p.full_name), ''), p.email, pp.display_name);
end;
$$;

revoke all on function public.list_company_team() from public, anon;
grant execute on function public.list_company_team() to authenticated;

-- ---------------------------------------------------------------------------
-- BUG-04 — list_platform_admin_companies
-- ---------------------------------------------------------------------------
create or replace function public.list_platform_admin_companies()
returns table(
  company_id uuid, name text, business_type public.business_type, status public.company_status,
  members_count bigint, subscription_status public.subscription_status,
  subscription_expires_at timestamp with time zone
)
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'not authorized';
  end if;

  return query
  select
    c.id,
    c.name,
    c.business_type,
    c.status,
    (select count(*) from public.company_members cm where cm.company_id = c.id),
    s.sub_status,
    s.sub_expires_at
  from public.companies c
  left join lateral (
    select sb.status as sub_status, sb.expires_at as sub_expires_at
    from public.subscriptions sb
    where sb.company_id = c.id
    order by sb.updated_at desc
    limit 1
  ) s on true
  order by c.created_at desc
  limit 100;
end;
$$;

revoke all on function public.list_platform_admin_companies() from public, anon;
grant execute on function public.list_platform_admin_companies() to authenticated;

-- ---------------------------------------------------------------------------
-- BUG-09 — adjust_loyalty_points: não permite ajuste que deixe o saldo negativo
-- ---------------------------------------------------------------------------
create or replace function public.adjust_loyalty_points(p_customer_id uuid, p_points integer, p_reason text)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_customer public.customers;
  v_role public.company_role;
  v_current_balance integer;
  v_new_balance integer;
  v_remaining_points integer;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.';
  end if;

  if p_points is null or p_points = 0 then
    raise exception 'Informe uma quantidade de pontos diferente de zero.';
  end if;

  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'Informe o motivo do ajuste.';
  end if;

  select * into v_customer from public.customers where id = p_customer_id;
  if v_customer is null then
    raise exception 'Cliente não encontrado.';
  end if;

  select cm.role into v_role
    from public.company_members cm
    where cm.company_id = v_customer.company_id and cm.user_id = auth.uid();

  if v_role is null or v_role not in ('owner', 'admin') then
    raise exception 'Apenas owner/admin podem ajustar pontos manualmente.';
  end if;

  insert into public.loyalty_accounts (company_id, customer_id)
    values (v_customer.company_id, p_customer_id)
    on conflict (customer_id) do nothing;

  select la.balance into v_current_balance
    from public.loyalty_accounts la
    where la.customer_id = p_customer_id
    for update;

  if v_current_balance + p_points < 0 then
    raise exception 'O ajuste deixaria o saldo negativo (saldo atual: % pontos).', v_current_balance;
  end if;

  update public.loyalty_accounts
    set balance = balance + p_points,
        lifetime_points = greatest(0, lifetime_points + p_points)
    where customer_id = p_customer_id
    returning balance into v_new_balance;

  -- Ajuste positivo vira um lote resgatável (como um ganho), sem expiração
  -- (crédito corretivo). Ajuste negativo não é lote (remaining_points=0).
  v_remaining_points := case when p_points > 0 then p_points else 0 end;

  insert into public.loyalty_transactions (
    company_id, customer_id, type, points, balance_after, source, reason, performed_by, remaining_points
  ) values (
    v_customer.company_id, p_customer_id, 'ajuste', p_points, v_new_balance, 'manual', p_reason, auth.uid(), v_remaining_points
  );

  insert into public.audit_logs (company_id, actor_user_id, entity_type, entity_id, action, metadata)
  values (
    v_customer.company_id, auth.uid(), 'loyalty_account', p_customer_id, 'loyalty.points_adjusted',
    jsonb_build_object('points', p_points, 'reason', p_reason, 'balance_after', v_new_balance)
  );

  return v_new_balance;
end;
$$;

revoke all on function public.adjust_loyalty_points(uuid,integer,text) from public, anon;
grant execute on function public.adjust_loyalty_points(uuid,integer,text) to authenticated;

-- ---------------------------------------------------------------------------
-- BUG-10 (H3) — add_existing_company_member aplica company_entitlements.max_additional_users
-- "Adicionais" = membros que não são o proprietário. O UPDATE ... FOR UPDATE na
-- linha de entitlement serializa adições concorrentes (sem corrida de limite).
-- Empresas que JÁ excedem o limite não são alteradas: só novas adições são barradas.
-- ---------------------------------------------------------------------------
create or replace function public.add_existing_company_member(
  p_email text,
  p_role public.company_role default 'employee'
)
returns public.company_members
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_user_id uuid;
  v_company_id uuid;
  v_actor_role public.company_role;
  v_row public.company_members;
  v_max_additional integer;
  v_current_additional integer;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.';
  end if;

  select cm0.company_id, cm0.role into v_company_id, v_actor_role
  from public.company_members cm0
  where cm0.user_id = auth.uid()
  order by cm0.created_at asc
  limit 1;

  if v_company_id is null then raise exception 'Nenhuma empresa encontrada.'; end if;
  if v_actor_role not in ('owner','admin') then raise exception 'Apenas owner/admin podem adicionar colaboradores.'; end if;
  if p_role = 'owner' then raise exception 'Novo colaborador deve entrar como admin ou employee.'; end if;
  if nullif(trim(p_email), '') is null then raise exception 'Informe o e-mail do colaborador.'; end if;

  select pr.user_id into v_user_id
  from public.profiles pr
  where lower(pr.email) = lower(trim(p_email))
  limit 1;

  if v_user_id is null then
    raise exception 'Usuário não encontrado. A pessoa precisa criar a conta no Prime Ges antes de ser adicionada.';
  end if;

  if exists (
    select 1 from public.company_members cm1
    where cm1.company_id = v_company_id and cm1.user_id = v_user_id
  ) then
    raise exception 'Este usuário já pertence à empresa.';
  end if;

  -- Limite do plano (H3). Sem linha de entitlement => limite 0.
  select ce.max_additional_users into v_max_additional
  from public.company_entitlements ce
  where ce.company_id = v_company_id
  for update;

  select count(*) into v_current_additional
  from public.company_members cm2
  where cm2.company_id = v_company_id and cm2.role <> 'owner';

  if v_current_additional >= coalesce(v_max_additional, 0) then
    raise exception 'Limite de usuários do plano atingido (% usuário(s) adicional(is) além do proprietário). Altere o plano para adicionar mais pessoas.',
      coalesce(v_max_additional, 0);
  end if;

  insert into public.company_members(company_id, user_id, role)
  values(v_company_id, v_user_id, p_role)
  returning * into v_row;

  insert into public.audit_logs (
    company_id, actor_user_id, entity_type, entity_id, action, metadata
  ) values (
    v_company_id, auth.uid(), 'company_member', v_row.id, 'company_member.added',
    jsonb_build_object('member_user_id', v_row.user_id, 'role', v_row.role)
  );

  return v_row;
end;
$$;

revoke all on function public.add_existing_company_member(text, public.company_role) from public, anon;
grant execute on function public.add_existing_company_member(text, public.company_role) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- BUG-05 (H1) — proteção real de estoque e campos críticos da venda.
--
-- O trigger guard_direct_critical_mutations testava current_user<>'postgres'
-- dentro de uma função SECURITY DEFINER (onde current_user é sempre o dono),
-- então nunca bloqueava nada. A proteção correta é por privilégio de coluna:
-- o papel `authenticated` (PostgREST/JWT) só pode alterar as colunas listadas.
-- As RPCs SECURITY DEFINER (complete_sale, cancel_sale, adjust_product_stock,
-- receive_purchase_order, cancel_purchase_receipt, redeem_loyalty_points,
-- recalculate_sale_totals, ...) rodam como dono e continuam podendo escrever.
-- ---------------------------------------------------------------------------
drop trigger if exists products_guard_direct_critical_mutations on public.products;
drop trigger if exists sales_guard_direct_critical_mutations on public.sales;
drop function if exists public.guard_direct_critical_mutations();

revoke update on table public.products from authenticated;
grant update (category_id, name, sku, barcode, description, unit, cost_price, sale_price, minimum_stock, status)
  on public.products to authenticated;

revoke insert, update on table public.sales from authenticated;
grant insert (company_id, customer_id, user_id, notes) on public.sales to authenticated;
grant update (customer_id, discount_amount, notes) on public.sales to authenticated;

-- recompute_sale_payment_status altera sales.payment_status; agora que esse
-- campo não é mais gravável por `authenticated`, o trigger precisa rodar como dono.
alter function public.recompute_sale_payment_status() security definer;
alter function public.recompute_sale_payment_status() set search_path = public;
revoke all on function public.recompute_sale_payment_status() from public, anon, authenticated;

-- Recalcula subtotal/custo/desconto/total/margem de um RASCUNHO a partir dos itens
-- (lógica que antes vivia em src/lib/sales/totals.ts com UPDATE direto).
create or replace function public.recalculate_sale_totals(p_sale_id uuid)
returns public.sales
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sale public.sales;
  v_subtotal numeric(12,2);
  v_cost numeric(12,2);
  v_discount numeric(12,2);
  v_total numeric(12,2);
begin
  if auth.uid() is null then raise exception 'Usuário não autenticado.'; end if;

  select * into v_sale from public.sales where id = p_sale_id for update;
  if v_sale is null or not exists (
    select 1 from public.company_members cm
    where cm.company_id = v_sale.company_id and cm.user_id = auth.uid()
  ) then
    raise exception 'Venda não encontrada.';
  end if;

  if v_sale.status <> 'draft' then
    raise exception 'Apenas vendas em rascunho podem ter os totais recalculados.';
  end if;

  select round(coalesce(sum(si.total_amount), 0), 2),
         round(coalesce(sum(si.quantity * si.unit_cost), 0), 2)
    into v_subtotal, v_cost
  from public.sale_items si
  where si.sale_id = p_sale_id;

  if v_sale.loyalty_discount_amount > v_subtotal + 0.005 then
    raise exception 'LOYALTY_DISCOUNT_EXCEEDS_SUBTOTAL';
  end if;

  v_discount := least(v_sale.discount_amount, round(v_subtotal - v_sale.loyalty_discount_amount, 2));
  v_total := greatest(0, round(v_subtotal - v_discount - v_sale.loyalty_discount_amount, 2));

  update public.sales
  set subtotal = v_subtotal,
      discount_amount = v_discount,
      total_amount = v_total,
      total_cost = v_cost,
      estimated_margin = round(v_total - v_cost, 2)
  where id = p_sale_id
  returning * into v_sale;

  return v_sale;
end;
$$;

revoke all on function public.recalculate_sale_totals(uuid) from public, anon, authenticated;
grant execute on function public.recalculate_sale_totals(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- BUG-06 — pagamento na tela da venda (rascunho ou concluída) via RPC.
-- O FOR UPDATE na venda serializa pagamentos concorrentes (substitui o
-- "insere e desfaz" que o app fazia).
-- ---------------------------------------------------------------------------
create or replace function public.add_sale_payment(
  p_sale_id uuid,
  p_method public.sale_payment_method,
  p_amount numeric,
  p_notes text default null
)
returns public.sale_payments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sale public.sales;
  v_paid numeric(12,2);
  v_remaining numeric(12,2);
  v_amount numeric(12,2);
  v_payment public.sale_payments;
begin
  if auth.uid() is null then raise exception 'Usuário não autenticado.'; end if;

  select * into v_sale from public.sales where id = p_sale_id for update;
  if v_sale is null or not exists (
    select 1 from public.company_members cm
    where cm.company_id = v_sale.company_id and cm.user_id = auth.uid()
  ) then
    raise exception 'Venda não encontrada.';
  end if;

  if v_sale.status = 'cancelled' then
    raise exception 'Não é possível registrar pagamento em uma venda cancelada.';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'O valor do pagamento deve ser maior que zero.';
  end if;
  v_amount := round(p_amount, 2);

  select coalesce(sum(sp.amount), 0) into v_paid
  from public.sale_payments sp
  where sp.sale_id = v_sale.id and sp.status = 'paid';

  v_remaining := round(v_sale.total_amount - v_paid, 2);
  if v_amount > v_remaining then
    raise exception 'O valor do pagamento excede o saldo restante da venda.';
  end if;

  insert into public.sale_payments(company_id, sale_id, method, amount, status, paid_at, notes)
  values (v_sale.company_id, v_sale.id, p_method, v_amount, 'paid', now(), nullif(trim(p_notes), ''))
  returning * into v_payment;

  insert into public.audit_logs(company_id, actor_user_id, entity_type, entity_id, action, metadata)
  values (
    v_sale.company_id, auth.uid(), 'sale', v_sale.id, 'sale.payment_added',
    jsonb_build_object('method', p_method, 'amount', v_amount)
  );

  return v_payment;
end;
$$;

revoke all on function public.add_sale_payment(uuid, public.sale_payment_method, numeric, text) from public, anon, authenticated;
grant execute on function public.add_sale_payment(uuid, public.sale_payment_method, numeric, text) to authenticated;

-- ---------------------------------------------------------------------------
-- BUG-08 — cancel_sale estorna pagamentos (financeiro via trigger existente
-- sale_payments_create_financial_entry) e a saída de caixa dos pagamentos em dinheiro.
-- ---------------------------------------------------------------------------
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
  v_payment record;
  v_register_id uuid;
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

  -- Estorno dos pagamentos já recebidos. O trigger sale_payments_create_financial_entry
  -- gera o lançamento "Estorno de pagamento"; dinheiro também sai do caixa aberto (se houver).
  for v_payment in
    select * from public.sale_payments
    where sale_id=p_sale_id and status='paid'
    order by created_at,id
  loop
    update public.sale_payments set status='refunded' where id=v_payment.id;

    if v_payment.method='cash' then
      select cr.id into v_register_id
      from public.cash_registers cr
      where cr.company_id=v_sale.company_id and cr.status='open'
      order by cr.opened_at desc
      limit 1
      for update;

      if v_register_id is not null then
        insert into public.cash_movements(
          company_id,cash_register_id,direction,amount,method,description,source,created_by
        )
        values(
          v_sale.company_id,v_register_id,'out',v_payment.amount,v_payment.method,
          'Estorno de venda '||left(p_sale_id::text,8),'manual',auth.uid()
        );
      end if;
    end if;
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

-- ---------------------------------------------------------------------------
-- BUG-07 — gravação de auditoria pelo app (Server Actions e rotas de API).
-- Dois contextos, nunca misturados:
--   * USUÁRIO (auth.uid() presente): o ator é sempre auth.uid() (p_actor_user_id, se vier,
--     precisa ser o próprio usuário), a empresa precisa ser uma das do chamador e a ação
--     precisa estar na lista de eventos que o app grava por Server Action. Eventos críticos
--     (sale.completed, sale.cancelled, estoque, caixa, financeiro, assinatura/pagamento...)
--     NÃO estão na lista: só são gravados dentro de RPCs do banco ou pelo sistema.
--   * SISTEMA (service_role, sem auth.uid()): só eventos de assinatura/pagamento
--     (subscription.* e subscription_payment.*). O ator é opcional e só é registrado se for
--     membro da empresa. Necessário porque /api/billing/create-payment grava
--     subscription_payment.created com o cliente service_role.
-- Todo evento recebe metadata._origin = 'user' | 'system' (definido pelo servidor, sobrescreve
-- qualquer valor enviado pelo cliente).
-- ---------------------------------------------------------------------------
create or replace function public.write_audit_log(
  p_company_id uuid,
  p_entity_type text,
  p_entity_id uuid,
  p_action text,
  p_metadata jsonb default '{}'::jsonb,
  p_actor_user_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_actor uuid;
  v_origin text;
  v_meta jsonb := coalesce(p_metadata, '{}'::jsonb);
begin
  if p_company_id is null or p_entity_id is null
     or nullif(trim(p_entity_type), '') is null or char_length(p_entity_type) > 64
     or nullif(trim(p_action), '') is null or char_length(p_action) > 96 then
    raise exception 'Evento de auditoria inválido.';
  end if;

  if jsonb_typeof(v_meta) <> 'object' then
    raise exception 'Metadados de auditoria inválidos.';
  end if;

  if pg_column_size(v_meta) > 8192 then
    raise exception 'Metadados de auditoria grandes demais.';
  end if;

  if v_uid is not null then
    if not exists (
      select 1 from public.company_members cm
      where cm.company_id = p_company_id and cm.user_id = v_uid
    ) then
      raise exception 'Empresa inválida.';
    end if;

    if p_actor_user_id is not null and p_actor_user_id <> v_uid then
      raise exception 'Ator inválido.';
    end if;

    if not (p_action = any (array[
      'customer.created', 'customer.updated', 'customer.deactivated', 'customer.reactivated',
      'customer.birth_date_updated', 'customer.preferences_updated',
      'customer_document.uploaded', 'customer_document.deleted', 'raffle.executed',
      'product.created', 'product.updated', 'product.activated', 'product.deactivated',
      'category.created', 'category.updated', 'category.activated', 'category.deactivated',
      'service.created', 'service.updated', 'service.activated', 'service.deactivated',
      'service_category.created', 'service_category.updated',
      'service_category.activated', 'service_category.deactivated',
      'sale.created', 'sale.updated',
      'supplier.created', 'supplier.updated', 'purchase_order.created'
    ])) then
      raise exception 'Evento de auditoria não permitido.';
    end if;

    v_actor := v_uid;
    v_origin := 'user';
  elsif auth.role() = 'service_role' then
    if not exists (select 1 from public.companies c where c.id = p_company_id) then
      raise exception 'Empresa inválida.';
    end if;

    if p_action !~ '^(subscription|subscription_payment)\.[a-z_]+$' then
      raise exception 'Evento de auditoria não permitido.';
    end if;

    if p_actor_user_id is not null and exists (
      select 1 from public.company_members cm
      where cm.company_id = p_company_id and cm.user_id = p_actor_user_id
    ) then
      v_actor := p_actor_user_id;
    end if;

    v_origin := 'system';
  else
    raise exception 'Usuário não autenticado.';
  end if;

  insert into public.audit_logs(company_id, actor_user_id, entity_type, entity_id, action, metadata)
  values (p_company_id, v_actor, p_entity_type, p_entity_id, p_action,
          v_meta || jsonb_build_object('_origin', v_origin));
end;
$$;

revoke all on function public.write_audit_log(uuid, text, uuid, text, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.write_audit_log(uuid, text, uuid, text, jsonb, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- BUG-11 (H4) — plano de teste fora do catálogo. get_public_plans, a tela de
-- planos e /api/billing/create-payment só consideram status='active'.
-- ---------------------------------------------------------------------------
update public.plans set status = 'inactive', updated_at = now()
where code = 'TEST_R1' and status <> 'inactive';

-- ---------------------------------------------------------------------------
-- BUG-12 (H2) — benefícios sem implementação deixam de ser anunciados/concedidos.
-- Suporte continua (canal de e-mail existente).
-- ---------------------------------------------------------------------------
update public.plans
set tickets_enabled = false, exclusive_groups_enabled = false, early_access_enabled = false, updated_at = now()
where tickets_enabled or exclusive_groups_enabled or early_access_enabled;

update public.company_entitlements
set tickets_enabled = false, exclusive_groups_enabled = false, early_access_enabled = false, updated_at = now()
where tickets_enabled or exclusive_groups_enabled or early_access_enabled;
