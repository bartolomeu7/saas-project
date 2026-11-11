-- Rollback: volta a reverter só o ganho da venda (comportamento original da migration 012).
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
  v_already_reversed boolean;
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

  -- 1) Reverte o GANHO desta venda, se existir e ainda não tiver sido revertido.
  select * into v_ganho
    from public.loyalty_transactions
    where reference_id = p_sale_id and type = 'ganho' and source = 'sale'
    limit 1;

  -- IMPORTANTE: "v_ganho is not null" NÃO funciona aqui — para um tipo
  -- linha/composto, "IS NOT NULL" só é verdadeiro se TODOS os campos forem
  -- não-nulos, e "reason" é sempre null numa linha de ganho (só é
  -- obrigatório em 'ajuste'). Checar um campo escalar sempre-preenchido
  -- (id) evita essa armadilha clássica do PL/pgSQL.
  if v_ganho.id is not null then
    select exists (
      select 1 from public.loyalty_transactions
      where reference_id = v_ganho.id and type = 'reversao'
    ) into v_already_reversed;

    if not v_already_reversed then
      update public.loyalty_accounts
        set balance = balance - v_ganho.points,
            lifetime_points = greatest(0, lifetime_points - v_ganho.points)
        where customer_id = v_sale.customer_id
        returning balance into v_new_balance;

      -- Anula o lote por completo: o que ainda não tinha sido gasto/expirado
      -- deixa de estar disponível para resgate ou expiração futura.
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
          'sale_id', p_sale_id, 'reversed_transaction_id', v_ganho.id, 'kind', 'earn',
          'points_reversed', v_ganho.points, 'balance_after', v_new_balance
        )
      );
    end if;
  end if;

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
