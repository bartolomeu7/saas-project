-- Etapa 1D.6B: corrige os dois problemas de integração encontrados no
-- relatório da Etapa 1D.6A entre a separação de descontos
-- (discount_amount = manual / loyalty_discount_amount = fidelidade) e as
-- duas funções que ainda não sabiam da separação:
--
-- 1) redeem_loyalty_points somava o desconto de fidelidade também em
--    discount_amount (resquício de antes da 1D.6A, quando os dois
--    conceitos dividiam a mesma coluna) — isso fazia o desconto ser
--    contado em dobro assim que recalculateSaleTotals rodasse depois.
-- 2) complete_sale calculava total_amount = subtotal - discount_amount,
--    ignorando loyalty_discount_amount por completo — concluir uma venda
--    com resgate ativo cobrava o valor cheio do cliente.
--
-- Nenhuma tabela, coluna, constraint ou policy de RLS é alterada; nenhuma
-- outra função é tocada; migrations 012 e 013 permanecem exatamente como
-- estão. Ledger, regra de saldo, FIFO e lifetime_points de
-- redeem_loyalty_points não mudam — só o UPDATE final em public.sales.

-- -----------------------------------------------------------------------------
-- 1. redeem_loyalty_points — para de somar o desconto em discount_amount.
--    Corpo idêntico ao da migration 012, exceto o UPDATE final em sales.
-- -----------------------------------------------------------------------------
create or replace function public.redeem_loyalty_points(p_sale_id uuid, p_points integer)
returns numeric
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_sale public.sales;
  v_is_member boolean;
  v_settings public.loyalty_settings;
  v_account public.loyalty_accounts;
  v_current_subtotal numeric(12, 2);
  v_discount numeric(12, 2);
  v_max_discount numeric(12, 2);
  v_new_balance integer;
  v_remaining_to_consume integer;
  v_lot record;
  v_consume integer;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.';
  end if;

  if p_points is null or p_points <= 0 then
    raise exception 'Informe uma quantidade de pontos válida.';
  end if;

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
    raise exception 'Só é possível usar pontos em uma venda ainda em rascunho.';
  end if;

  if v_sale.customer_id is null then
    raise exception 'Selecione um cliente para usar pontos de fidelidade.';
  end if;

  select * into v_settings from public.loyalty_settings where company_id = v_sale.company_id;
  if v_settings is null or not v_settings.enabled then
    raise exception 'A fidelidade não está habilitada para esta empresa.';
  end if;

  if p_points < v_settings.min_points_to_redeem then
    raise exception 'Quantidade mínima de pontos para resgate: %.', v_settings.min_points_to_redeem;
  end if;

  select * into v_account
    from public.loyalty_accounts
    where customer_id = v_sale.customer_id
    for update;

  if v_account is null or v_account.balance <= 0 then
    raise exception 'Saldo de pontos insuficiente.';
  end if;

  if p_points > v_account.balance then
    raise exception 'Saldo insuficiente: disponível %, solicitado %.', v_account.balance, p_points;
  end if;

  v_discount := round(p_points * v_settings.redemption_value_per_point, 2);

  if v_settings.max_redeem_percent_per_sale is not null then
    -- sales.subtotal só é calculado por complete_sale() na conclusão —
    -- durante o rascunho (única fase em que resgate é permitido) essa
    -- coluna ainda não reflete os itens já adicionados. Recalcula aqui a
    -- partir de sale_items, mesmo padrão de complete_sale().
    select coalesce(sum(total_amount), 0) into v_current_subtotal
      from public.sale_items where sale_id = p_sale_id;
    v_max_discount := round(v_current_subtotal * v_settings.max_redeem_percent_per_sale / 100, 2);
    if v_discount > v_max_discount then
      raise exception 'O desconto por pontos não pode exceder % por cento do valor da venda.', v_settings.max_redeem_percent_per_sale;
    end if;
  end if;

  -- Consome qualquer crédito positivo disponível (ganho, ajuste positivo,
  -- ou reversão que devolveu um resgate) — todos são "lotes" resgatáveis,
  -- não só ganho. Lotes que expiram em breve são consumidos primeiro;
  -- créditos sem expiração (ajuste/reversão) ficam por último.
  v_remaining_to_consume := p_points;
  for v_lot in
    select id, remaining_points
      from public.loyalty_transactions
      where customer_id = v_sale.customer_id
        and remaining_points > 0
        and (expires_at is null or expires_at > now())
      order by (expires_at is null), expires_at asc, created_at asc
      for update
  loop
    exit when v_remaining_to_consume <= 0;
    v_consume := least(v_lot.remaining_points, v_remaining_to_consume);
    update public.loyalty_transactions
      set remaining_points = remaining_points - v_consume
      where id = v_lot.id;
    v_remaining_to_consume := v_remaining_to_consume - v_consume;
  end loop;

  if v_remaining_to_consume > 0 then
    raise exception 'Inconsistência no saldo de fidelidade — contate o suporte.';
  end if;

  update public.loyalty_accounts
    set balance = balance - p_points
    where customer_id = v_sale.customer_id
    returning balance into v_new_balance;

  insert into public.loyalty_transactions (
    company_id, customer_id, type, points, balance_after, source, reference_type, reference_id, performed_by
  ) values (
    v_sale.company_id, v_sale.customer_id, 'resgate', -p_points, v_new_balance, 'sale', 'sale', p_sale_id, auth.uid()
  );

  -- Etapa 1D.6B: só as colunas de fidelidade são incrementadas aqui.
  -- discount_amount é exclusivamente do desconto MANUAL desde a Etapa
  -- 1D.6A — somar v_discount nela (como esta função fazia antes) contava
  -- o desconto de fidelidade duas vezes assim que recalculateSaleTotals
  -- rodasse (uma vez em discount_amount, outra em loyalty_discount_amount).
  update public.sales
    set loyalty_points_redeemed = loyalty_points_redeemed + p_points,
        loyalty_discount_amount = loyalty_discount_amount + v_discount
    where id = p_sale_id;

  insert into public.audit_logs (company_id, actor_user_id, entity_type, entity_id, action, metadata)
  values (
    v_sale.company_id, auth.uid(), 'loyalty_account', v_sale.customer_id, 'loyalty.points_redeemed',
    jsonb_build_object('sale_id', p_sale_id, 'points', p_points, 'discount_amount', v_discount, 'balance_after', v_new_balance)
  );

  return v_discount;
end;
$$;

comment on function public.redeem_loyalty_points(uuid, integer) is
  'Resgata pontos de fidelidade como desconto numa venda em rascunho. Desde a Etapa 1D.6B incrementa somente loyalty_points_redeemed/loyalty_discount_amount — nunca discount_amount, que é exclusivamente o desconto manual (Etapa 1D.6A). Ledger/FIFO/saldo/lifetime_points inalterados.';

-- -----------------------------------------------------------------------------
-- 2. complete_sale — total_amount passa a subtrair também
--    loyalty_discount_amount, e a validação de "desconto maior que o
--    subtotal" passa a considerar a soma dos dois descontos. Corpo
--    idêntico ao da migration 008 (com o ajuste de loyalty_discount_amount
--    já presente desde a criação da coluna), exceto os pontos marcados.
-- -----------------------------------------------------------------------------
create or replace function public.complete_sale(p_sale_id uuid)
returns sales
language plpgsql
security definer
set search_path to 'public'
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

  -- Etapa 1D.6B: a soma dos DOIS descontos (manual + fidelidade) é quem
  -- não pode ultrapassar o subtotal — antes só discount_amount entrava
  -- nesta conta, deixando loyalty_discount_amount livre para nunca ser
  -- validado nem descontado do total final.
  if v_sale.discount_amount + v_sale.loyalty_discount_amount > v_subtotal then
    raise exception 'O desconto da venda não pode ser maior que o subtotal.';
  end if;

  v_total := greatest(0, v_subtotal - v_sale.discount_amount - v_sale.loyalty_discount_amount);
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
  'Conclui uma venda em rascunho: recalcula subtotal/custo a partir dos itens reais, valida e desconta discount_amount (manual) E loyalty_discount_amount (fidelidade) do total (Etapa 1D.6B — antes só o manual entrava na conta), baixa estoque atomicamente e grava auditoria. total_amount nunca fica negativo.';
