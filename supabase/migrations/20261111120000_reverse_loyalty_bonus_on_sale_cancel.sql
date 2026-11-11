-- =============================================================================
-- Cancelar a venda também reverte os bônus de pontos que ela gerou (primeira compra e aniversário).
-- Bug achado nos testes reais de 11/11/2026: o cliente ganhou +50 de "primeira compra" numa venda que foi cancelada;
-- só os pontos da compra eram revertidos, então o bônus ficava e era concedido de novo na venda seguinte (100 pontos).
-- Rollback: supabase/rollback/20261111120000_reverse_loyalty_bonus_on_sale_cancel.down.sql
-- =============================================================================
create or replace function public.reverse_loyalty_points_for_sale(p_sale_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_sale public.sales;
  v_ganho public.loyalty_transactions;
  v_resgate record;
  v_new_balance integer;
  v_credit integer;
begin
  select * into v_sale from public.sales where id = p_sale_id;
  if v_sale is null or v_sale.customer_id is null then
    return;
  end if;

  -- Trava a conta uma única vez: cobre as duas atualizações de saldo
  -- abaixo (ganho e resgate) na mesma transação.
  perform 1 from public.loyalty_accounts where customer_id = v_sale.customer_id for update;

  -- 1) Reverte TODO ganho desta venda que ainda não foi revertido: os pontos da compra e também os bônus que
  --    ela gerou (primeira compra e aniversário). Antes só o da compra era revertido, e o bônus de primeira
  --    compra ficava com o cliente mesmo com a venda cancelada — e era concedido de novo na venda seguinte.
  for v_ganho in
    select lt.* from public.loyalty_transactions lt
    where lt.reference_id = p_sale_id and lt.type = 'ganho' and lt.source in ('sale', 'first_purchase', 'birthday')
      and not exists (
        select 1 from public.loyalty_transactions r
        where r.reference_id = lt.id and r.type = 'reversao'
      )
    order by lt.created_at
    for update
  loop
    update public.loyalty_accounts
      set balance = balance - v_ganho.points,
          lifetime_points = greatest(0, lifetime_points - v_ganho.points)
      where customer_id = v_sale.customer_id
      returning balance into v_new_balance;

    update public.loyalty_transactions set remaining_points = 0 where id = v_ganho.id;

    insert into public.loyalty_transactions (
      company_id, customer_id, type, points, balance_after, source, reference_type, reference_id, performed_by
    ) values (
      v_sale.company_id, v_sale.customer_id, 'reversao', -v_ganho.points, v_new_balance, 'reversal',
      'loyalty_transaction', v_ganho.id, v_sale.cancelled_by
    );

    insert into public.audit_logs (company_id, actor_user_id, entity_type, entity_id, action, metadata)
    values (
      v_sale.company_id, v_sale.cancelled_by, 'loyalty_account', v_sale.customer_id, 'loyalty.points_reversed',
      jsonb_build_object(
        'sale_id', p_sale_id, 'reversed_transaction_id', v_ganho.id, 'kind', 'earn', 'source', v_ganho.source,
        'points_reversed', v_ganho.points, 'balance_after', v_new_balance
      )
    );
  end loop;

  -- 2) Reverte cada RESGATE desta venda ainda não revertido — devolve
  -- exatamente os pontos gastos naquela venda, como um novo lote
  -- imediatamente disponível (sem expiração: crédito corretivo, não ganho
  -- genuíno) e sem afetar lifetime_points (resgatar nunca reduziu o nível,
  -- então devolver também não deve alterá-lo).
  for v_resgate in
    select lt.* from public.loyalty_transactions lt
    where lt.reference_id = p_sale_id and lt.type = 'resgate' and lt.source = 'sale'
      and not exists (
        select 1 from public.loyalty_transactions r
        where r.reference_id = lt.id and r.type = 'reversao'
      )
    for update
  loop
    v_credit := -v_resgate.points; -- resgate.points é negativo; o crédito de volta é positivo.

    update public.loyalty_accounts
      set balance = balance + v_credit
      where customer_id = v_sale.customer_id
      returning balance into v_new_balance;

    insert into public.loyalty_transactions (
      company_id, customer_id, type, points, balance_after, source, reference_type, reference_id,
      performed_by, remaining_points
    ) values (
      v_sale.company_id, v_sale.customer_id, 'reversao', v_credit, v_new_balance, 'reversal',
      'loyalty_transaction', v_resgate.id, v_sale.cancelled_by, v_credit
    );

    insert into public.audit_logs (company_id, actor_user_id, entity_type, entity_id, action, metadata)
    values (
      v_sale.company_id, v_sale.cancelled_by, 'loyalty_account', v_sale.customer_id, 'loyalty.points_reversed',
      jsonb_build_object(
        'sale_id', p_sale_id, 'reversed_transaction_id', v_resgate.id, 'kind', 'redeem',
        'points_reversed', v_credit, 'balance_after', v_new_balance
      )
    );
  end loop;
end;
$$;
