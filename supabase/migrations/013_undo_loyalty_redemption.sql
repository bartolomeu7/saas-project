-- Etapa 1D.6A: permitir desfazer um resgate de pontos de fidelidade
-- aplicado a uma venda ainda em rascunho — necessário para bloquear com
-- segurança a troca/remoção de cliente e a alteração de itens quando há
-- resgate ativo (o usuário precisa de uma saída: remover o resgate).
--
-- Não altera nenhuma tabela, coluna, constraint ou policy de RLS
-- existente (migration 012 ou anteriores) — só adiciona UMA função nova,
-- no mesmo espírito e estilo de public.redeem_loyalty_points e
-- public.reverse_loyalty_points_for_sale: trava a venda e a conta com
-- FOR UPDATE porque o cliente Supabase via REST não consegue fazer
-- "balance = balance + x" atomicamente nem travar linhas entre chamadas
-- HTTP separadas — sem isso, duas remoções de resgate concorrentes do
-- mesmo cliente (em vendas diferentes) poderiam perder um incremento de
-- saldo (lost update), exatamente o problema que FOR UPDATE já evita em
-- toda outra mutação de loyalty_accounts.balance neste projeto.

-- -----------------------------------------------------------------------------
-- 1. Função
-- -----------------------------------------------------------------------------
create or replace function public.undo_loyalty_redemption_for_draft_sale(p_sale_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_sale public.sales;
  v_is_member boolean;
  v_resgate record;
  v_credit integer;
  v_new_balance integer;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.';
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
    raise exception 'Só é possível remover o resgate de pontos enquanto a venda está em rascunho.';
  end if;

  -- Idempotente: sem resgate ativo, não há nada a desfazer — repetir a
  -- chamada (duplo clique, retry de rede) nunca credita pontos duas vezes.
  if v_sale.loyalty_points_redeemed <= 0 then
    return;
  end if;

  if v_sale.customer_id is null then
    raise exception 'Venda sem cliente vinculado.';
  end if;

  -- Trava a conta antes de qualquer crédito — mesma trava usada por
  -- redeem_loyalty_points/adjust_loyalty_points/grant e
  -- reverse_loyalty_points_for_sale, fecha a mesma janela de corrida para
  -- este cliente em qualquer outra operação de saldo concorrente.
  perform 1 from public.loyalty_accounts where customer_id = v_sale.customer_id for update;

  -- Mesmo laço de reverse_loyalty_points_for_sale (migration 012, parte
  -- 2 — reversão de resgate por cancelamento): devolve cada resgate desta
  -- venda ainda não revertido como um novo lote imediatamente disponível
  -- (sem expiração — crédito corretivo, não ganho genuíno) e sem tocar
  -- lifetime_points (resgatar nunca reduziu o nível; devolver também não
  -- deve alterá-lo). A transação 'resgate' original nunca é apagada nem
  -- editada — só passa a ter uma linha 'reversao' associada, preservando
  -- o histórico completo no ledger.
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
      'loyalty_transaction', v_resgate.id, auth.uid(), v_credit
    );

    insert into public.audit_logs (company_id, actor_user_id, entity_type, entity_id, action, metadata)
    values (
      v_sale.company_id, auth.uid(), 'loyalty_account', v_sale.customer_id, 'loyalty.points_reversed',
      jsonb_build_object(
        'sale_id', p_sale_id, 'reversed_transaction_id', v_resgate.id, 'kind', 'redeem_undo_draft',
        'points_reversed', v_credit, 'balance_after', v_new_balance
      )
    );
  end loop;

  -- subtotal/discount_amount/total_amount continuam de responsabilidade
  -- exclusiva de recalculateSaleTotals (aplicação) — mesma divisão de
  -- responsabilidade já usada por redeem_loyalty_points, que também só
  -- grava as colunas de fidelidade e deixa os totais para a próxima
  -- chamada da aplicação.
  update public.sales
    set loyalty_points_redeemed = 0,
        loyalty_discount_amount = 0
    where id = p_sale_id;
end;
$$;

comment on function public.undo_loyalty_redemption_for_draft_sale(uuid) is
  'Desfaz o(s) resgate(s) de pontos de fidelidade de uma venda em rascunho: devolve os pontos como novo lote (sem tocar lifetime_points), grava reversao no ledger sem apagar o resgate original, e zera loyalty_points_redeemed/loyalty_discount_amount da venda. Idempotente. subtotal/discount_amount/total_amount continuam recalculados pela aplicação (recalculateSaleTotals).';

-- -----------------------------------------------------------------------------
-- 2. Permissões de execução — mesma postura efetiva de redeem_loyalty_points/
--    adjust_loyalty_points: sem EXECUTE para PUBLIC nem para anon, só
--    authenticated/service_role.
--
--    Dois revokes distintos são necessários aqui, por duas razões
--    independentes:
--    - "from public" — o Postgres concede EXECUTE a PUBLIC automaticamente
--      em toda função nova (comportamento padrão do CREATE FUNCTION, não é
--      específico deste projeto).
--    - "from anon" — além disso, este projeto Supabase tem um DEFAULT
--      PRIVILEGE que concede EXECUTE diretamente a anon/authenticated/
--      service_role em toda função nova do schema public (um grant
--      individual por role, não via PUBLIC — por isso "revoke ... from
--      public" sozinho não seria suficiente para tirar o acesso de anon).
-- -----------------------------------------------------------------------------
revoke execute on function public.undo_loyalty_redemption_for_draft_sale(uuid) from public;
revoke execute on function public.undo_loyalty_redemption_for_draft_sale(uuid) from anon;
grant execute on function public.undo_loyalty_redemption_for_draft_sale(uuid) to authenticated;
