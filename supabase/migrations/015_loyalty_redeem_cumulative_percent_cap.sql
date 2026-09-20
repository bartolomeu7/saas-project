-- Manutenção autônoma: redeem_loyalty_points validava o percentual máximo
-- de resgate (max_redeem_percent_per_sale) só contra o desconto da
-- CHAMADA ATUAL, nunca contra o que já tinha sido resgatado antes nessa
-- mesma venda (sales.loyalty_discount_amount). Como a própria mensagem de
-- erro já diz "não pode exceder X% do valor da venda" (a venda inteira,
-- não "esta chamada"), duas ou mais chamadas parciais de
-- redeemLoyaltyPointsAction na mesma venda em rascunho podiam, somadas,
-- ultrapassar o teto configurado — o comportamento nunca bateu com o que
-- a própria mensagem já prometia.
--
-- Corpo idêntico ao aplicado na Etapa 1D.6B, exceto a comparação marcada
-- abaixo. Ledger, FIFO, saldo e lifetime_points continuam exatamente
-- iguais. Nenhuma tabela, coluna, constraint ou policy de RLS é alterada.

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
    -- Correção: soma o que esta venda JÁ tem resgatado
    -- (loyalty_discount_amount) ao novo desconto antes de comparar —
    -- antes só v_discount (desta chamada) era comparado, permitindo que
    -- vários resgates parciais somados ultrapassassem o teto.
    if (v_sale.loyalty_discount_amount + v_discount) > v_max_discount then
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
  'Resgata pontos de fidelidade como desconto numa venda em rascunho. Valida max_redeem_percent_per_sale contra o desconto ACUMULADO da venda (loyalty_discount_amount + este resgate), não só contra o resgate atual — corrigido na manutenção autônoma. Incrementa somente loyalty_points_redeemed/loyalty_discount_amount, nunca discount_amount (Etapa 1D.6B). Ledger/FIFO/saldo/lifetime_points inalterados.';
