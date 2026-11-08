-- =============================================================================
-- Achados da rodada de uso real (teste1, 08/11/2026):
--
--  1. CAIXA x ESTORNO: ao cancelar uma venda já paga, o Financeiro registrava "Estorno de pagamento",
--     mas o Caixa continuava somando a entrada (o dinheiro/PIX "voltava" ao cliente só no Financeiro).
--     Agora o pagamento que passa a 'refunded' gera uma SAÍDA no caixa aberto (mesma forma de pagamento),
--     desde que aquele pagamento tenha entrado em algum caixa (nunca estorna o que nunca foi contado).
--     Sem caixa aberto, nada é lançado (mesma regra da entrada).
--  2. FIDELIDADE: os pontos eram calculados sobre o valor dos itens ANTES do desconto manual / de pontos
--     resgatados (799 pontos sobre R$ 399,80 numa venda paga com R$ 380,00). Agora cada item vale a sua
--     parte proporcional do TOTAL PAGO da venda (total_amount / soma dos itens). Sem desconto, nada muda.
--
-- Não recalcula vendas passadas. Rollback: supabase/rollback/20261108120000_cash_refund_and_net_loyalty_points.down.sql
-- Bateria: tests/sql/cash_refund_net_loyalty.sql (somente TEST).
-- =============================================================================
begin;

-- ---------------------------------------------------------------------------
-- 1. CAIXA: estorno de pagamento vira saída
-- ---------------------------------------------------------------------------
create or replace function public.create_cash_movement_from_sale_payment()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_register_id uuid;
  v_created_by uuid;
begin
  -- Estorno: só reage à TRANSIÇÃO para 'refunded' e só se esse pagamento chegou a entrar em algum caixa.
  if new.status = 'refunded' then
    if tg_op = 'UPDATE' and old.status = 'refunded' then
      return new;
    end if;

    if not exists (select 1 from public.cash_movements where sale_payment_id = new.id) then
      return new;
    end if;

    select id into v_register_id
      from public.cash_registers
      where company_id = new.company_id and status = 'open'
      for update;

    if v_register_id is null then
      return new; -- Sem caixa aberto: o estorno fica só no Financeiro (igual à entrada).
    end if;

    v_created_by := coalesce(public.current_profile_user_id(), (select s.user_id from public.sales s where s.id = new.sale_id));

    -- source 'manual' porque a constraint cash_movements_source_reference_consistent liga
    -- source='sale_payment' a UMA linha por pagamento (a entrada); o estorno é uma saída avulsa rastreável pela descrição.
    insert into public.cash_movements (
      company_id, cash_register_id, direction, amount, method, description, source, sale_payment_id, created_by
    ) values (
      new.company_id, v_register_id, 'out', new.amount, new.method,
      'Estorno de pagamento de venda — ' || left(new.sale_id::text, 8), 'manual', null, v_created_by
    );

    return new;
  end if;

  if new.status <> 'paid' then
    return new;
  end if;

  -- Só reage à TRANSIÇÃO para 'paid', nunca a um UPDATE que apenas
  -- reafirma um status que já era 'paid' (ex.: um futuro UPDATE de notes).
  if tg_op = 'UPDATE' and old.status = 'paid' then
    return new;
  end if;

  select id into v_register_id
    from public.cash_registers
    where company_id = new.company_id and status = 'open'
    for update;

  if v_register_id is null then
    -- Nenhum caixa aberto: a venda/pagamento prossegue normalmente (não é
    -- responsabilidade deste trigger impedir Vendas de funcionar) — só não
    -- gera lançamento. Fica "fora do caixa", reconciliável olhando Vendas.
    return new;
  end if;

  v_created_by := coalesce(public.current_profile_user_id(), (select s.user_id from public.sales s where s.id = new.sale_id));

  insert into public.cash_movements (
    company_id, cash_register_id, direction, amount, method, description, source, sale_payment_id, created_by
  ) values (
    new.company_id, v_register_id, 'in', new.amount, new.method,
    'Pagamento de venda', 'sale_payment', new.id, v_created_by
  )
  on conflict (sale_payment_id) where sale_payment_id is not null do nothing;

  return new;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 2. FIDELIDADE: pontos sobre o valor realmente pago
-- ---------------------------------------------------------------------------
create or replace function public.grant_loyalty_points_for_sale(p_sale_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_sale public.sales;
  v_settings public.loyalty_settings;
  v_customer public.customers;
  v_item record;
  v_item_multiplier numeric(6, 3);
  v_items_sum numeric;
  v_paid_ratio numeric := 1;
  v_base_points integer := 0;
  v_campaign_multiplier numeric(6, 3);
  v_campaign_bonus integer;
  v_sale_points integer;
  v_first_purchase_points integer;
  v_birthday_points integer;
  v_total_points integer;
  v_is_first_purchase boolean;
  v_already_birthday_bonused boolean;
  v_existing_id uuid;
  v_expires_at timestamptz;
  v_new_balance integer;
begin
  select * into v_sale from public.sales where id = p_sale_id;
  if v_sale is null or v_sale.customer_id is null then
    return; -- Venda balcão (sem cliente) nunca gera pontos.
  end if;

  select * into v_settings from public.loyalty_settings where company_id = v_sale.company_id;
  if v_settings is null or not v_settings.enabled or v_settings.grant_on <> 'completion' then
    return; -- Fidelidade desabilitada, ou grant_on=full_payment (sem gatilho nesta etapa).
  end if;

  -- Idempotência defensiva além do índice único — evita depender de capturar
  -- uma exceção no fluxo normal. Verifica QUALQUER ganho já registrado para
  -- esta venda (não só source='sale'): a venda pode gerar até 3 linhas
  -- (compra/primeira-compra/aniversário — ver abaixo), e basta uma delas já
  -- existir para sabermos que esta venda já foi processada.
  select id into v_existing_id
    from public.loyalty_transactions
    where reference_id = p_sale_id and type = 'ganho'
    limit 1;
  if v_existing_id is not null then
    return;
  end if;

  select * into v_customer from public.customers where id = v_sale.customer_id;

  -- Parte do TOTAL PAGO que cabe a cada item: desconto manual e pontos resgatados reduzem o total da venda
  -- mas não o total de cada item; sem isto o cliente ganhava pontos sobre dinheiro que não pagou.
  select coalesce(sum(total_amount), 0) into v_items_sum from public.sale_items where sale_id = p_sale_id;
  if v_items_sum > 0 then
    v_paid_ratio := least(1, greatest(0, v_sale.total_amount) / v_items_sum);
  end if;

  for v_item in
    select * from public.sale_items where sale_id = p_sale_id
  loop
    v_item_multiplier := null;
    if v_item.item_type = 'product' and v_item.product_id is not null then
      select multiplier into v_item_multiplier
        from public.loyalty_multipliers
        where company_id = v_sale.company_id and product_id = v_item.product_id;
    elsif v_item.item_type = 'service' and v_item.service_id is not null then
      select multiplier into v_item_multiplier
        from public.loyalty_multipliers
        where company_id = v_sale.company_id and service_id = v_item.service_id;
    end if;

    v_base_points := v_base_points
      + floor(v_item.total_amount * v_paid_ratio * v_settings.points_per_currency_unit * coalesce(v_item_multiplier, 1))::integer;
  end loop;

  -- Campanhas ativas de venda inteira no instante da conclusão (alvo por
  -- item específico fica para uma etapa futura — ver comentário na tabela).
  select coalesce(max(multiplier), 1), coalesce(sum(bonus_points), 0)
    into v_campaign_multiplier, v_campaign_bonus
    from public.loyalty_campaigns
    where company_id = v_sale.company_id
      and status = 'active'
      and product_id is null
      and service_id is null
      and starts_at <= v_sale.completed_at
      and ends_at >= v_sale.completed_at;

  v_sale_points := floor(v_base_points * coalesce(v_campaign_multiplier, 1))::integer + coalesce(v_campaign_bonus, 0);
  v_first_purchase_points := 0;
  v_birthday_points := 0;

  select not exists (
    select 1 from public.sales
    where customer_id = v_sale.customer_id
      and company_id = v_sale.company_id
      and status = 'completed'
      and id <> p_sale_id
  ) into v_is_first_purchase;
  if v_is_first_purchase and v_settings.first_purchase_bonus_points > 0 then
    v_first_purchase_points := v_settings.first_purchase_bonus_points;
  end if;

  -- Bônus de aniversário: registrado como uma linha PRÓPRIA do ledger
  -- (source='birthday', não misturado na linha da compra) — é essa linha
  -- que a checagem "já bonificado este ano" abaixo encontra. Sem uma linha
  -- dedicada, não haveria como saber depois que o bônus já foi concedido,
  -- e ele seria repetido em toda venda feita no dia do aniversário.
  if v_customer.birth_date is not null
     and extract(month from v_customer.birth_date) = extract(month from v_sale.completed_at)
     and extract(day from v_customer.birth_date) = extract(day from v_sale.completed_at)
  then
    select exists (
      select 1 from public.loyalty_transactions
      where customer_id = v_sale.customer_id
        and company_id = v_sale.company_id
        and source = 'birthday'
        and created_at >= date_trunc('year', v_sale.completed_at)
    ) into v_already_birthday_bonused;

    if not v_already_birthday_bonused and v_settings.birthday_bonus_points > 0 then
      v_birthday_points := v_settings.birthday_bonus_points;
    end if;
  end if;

  -- Venda abaixo do mínimo configurado não gera pontos de nenhuma origem
  -- (compra, primeira compra ou aniversário) — é a mesma venda, sem valor
  -- suficiente para qualificar em nenhuma das três.
  if v_sale.total_amount < v_settings.min_purchase_amount_for_points then
    v_sale_points := 0;
    v_first_purchase_points := 0;
    v_birthday_points := 0;
  end if;

  v_total_points := v_sale_points + v_first_purchase_points + v_birthday_points;

  if v_total_points <= 0 then
    return;
  end if;

  insert into public.loyalty_accounts (company_id, customer_id)
    values (v_sale.company_id, v_sale.customer_id)
    on conflict (customer_id) do nothing;

  perform 1 from public.loyalty_accounts where customer_id = v_sale.customer_id for update;

  v_expires_at := case when v_settings.points_expire
    then v_sale.completed_at + make_interval(days => v_settings.points_expire_after_days)
    else null end;

  update public.loyalty_accounts
    set balance = balance + v_total_points,
        lifetime_points = lifetime_points + v_total_points
    where customer_id = v_sale.customer_id
    returning balance into v_new_balance;

  -- Até 3 linhas de ganho para a mesma venda, uma por origem — cada uma
  -- rastreável e resgatável (FIFO) separadamente. v_new_balance já é o
  -- saldo FINAL (depois de somar as 3 origens de uma vez só, acima); o
  -- balance_after de cada linha é esse final menos o que ainda "falta
  -- aplicar" das origens seguintes — nunca soma/subtrai de forma
  -- cumulativa, só calcula cada snapshot a partir do saldo final já
  -- conhecido.
  if v_sale_points > 0 then
    insert into public.loyalty_transactions (
      company_id, customer_id, type, points, balance_after, source,
      reference_type, reference_id, performed_by, expires_at, remaining_points
    ) values (
      v_sale.company_id, v_sale.customer_id, 'ganho', v_sale_points,
      v_new_balance - v_first_purchase_points - v_birthday_points, 'sale',
      'sale', p_sale_id, v_sale.user_id, v_expires_at, v_sale_points
    );
  end if;

  if v_first_purchase_points > 0 then
    insert into public.loyalty_transactions (
      company_id, customer_id, type, points, balance_after, source,
      reference_type, reference_id, performed_by, expires_at, remaining_points
    ) values (
      v_sale.company_id, v_sale.customer_id, 'ganho', v_first_purchase_points,
      v_new_balance - v_birthday_points, 'first_purchase',
      'sale', p_sale_id, v_sale.user_id, v_expires_at, v_first_purchase_points
    );
  end if;

  if v_birthday_points > 0 then
    insert into public.loyalty_transactions (
      company_id, customer_id, type, points, balance_after, source,
      reference_type, reference_id, performed_by, expires_at, remaining_points
    ) values (
      v_sale.company_id, v_sale.customer_id, 'ganho', v_birthday_points, v_new_balance, 'birthday',
      'sale', p_sale_id, v_sale.user_id, v_expires_at, v_birthday_points
    );
  end if;

  insert into public.audit_logs (company_id, actor_user_id, entity_type, entity_id, action, metadata)
  values (
    v_sale.company_id, v_sale.user_id, 'loyalty_account', v_sale.customer_id, 'loyalty.points_earned',
    jsonb_build_object(
      'sale_id', p_sale_id, 'points', v_total_points,
      'sale_points', v_sale_points, 'first_purchase_points', v_first_purchase_points, 'birthday_points', v_birthday_points,
      'balance_after', v_new_balance
    )
  );
end;
$function$;

commit;
