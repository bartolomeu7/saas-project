-- Correções da bateria de testes de 25/11/2026 (críticos e altos):
--  VDA-2 cancelar venda em dinheiro tirava o valor do caixa duas vezes;
--  VDA-1 dava para a venda ficar com mais dinheiro recebido do que o total;
--  VDA-3 pagamento em rascunho não podia ser desfeito nem o rascunho descartado;
--  FID-2 bônus de aniversário comparava o dia em UTC (falhava das 21h à meia-noite);
--  RH-1  vale lançado errado não tinha estorno.

begin;

CREATE OR REPLACE FUNCTION public.cancel_sale(p_sale_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS sales
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_sale public.sales;
  v_role public.company_role;
  v_item record;
  v_payment record;
  v_stock_before numeric(12,3);
  v_stock_after numeric(12,3);
begin
  if public.current_profile_user_id() is null then raise exception 'Usuário não autenticado.'; end if;

  select * into v_sale from public.sales where id=p_sale_id for update;
  if v_sale is null then raise exception 'Venda não encontrada.'; end if;

  select cm.role into v_role
  from public.company_members cm
  where cm.company_id=v_sale.company_id and cm.user_id=public.current_profile_user_id();

  if v_role is null then raise exception 'Você não tem acesso a esta venda.'; end if;
  if v_role='employee' and v_sale.user_id<>public.current_profile_user_id() then
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
      v_stock_before,v_stock_after,'sale_cancelled','sale_cancellation',p_sale_id,public.current_profile_user_id()
    );

    insert into public.audit_logs(
      company_id,actor_user_id,entity_type,entity_id,action,metadata
    )
    values(
      v_sale.company_id,public.current_profile_user_id(),'sale',p_sale_id,'sale.stock_adjusted',
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
  -- gera o lançamento "Estorno de pagamento"; a saída no caixa é do gatilho sale_payments_create_cash_movement.
  for v_payment in
    select * from public.sale_payments
    where sale_id=p_sale_id and status='paid'
    order by created_at,id
  loop
    update public.sale_payments set status='refunded' where id=v_payment.id;

  end loop;

  update public.sales
  set status='cancelled',cancelled_at=now(),cancelled_by=public.current_profile_user_id(),cancelled_reason=p_reason
  where id=p_sale_id
  returning * into v_sale;

  insert into public.audit_logs(
    company_id,actor_user_id,entity_type,entity_id,action,metadata
  )
  values(
    v_sale.company_id,public.current_profile_user_id(),'sale',p_sale_id,'sale.cancelled',
    jsonb_build_object('reason',p_reason)
  );

  return v_sale;
end;
$function$;

CREATE OR REPLACE FUNCTION public.grant_loyalty_points_for_sale(p_sale_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    return;
  end if;

  select * into v_settings from public.loyalty_settings where company_id = v_sale.company_id;
  if v_settings is null or not v_settings.enabled or v_settings.grant_on <> 'completion' then
    return;
  end if;

  select id into v_existing_id
    from public.loyalty_transactions
    where reference_id = p_sale_id and type = 'ganho'
    limit 1;
  if v_existing_id is not null then
    return;
  end if;

  select * into v_customer from public.customers where id = v_sale.customer_id;

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

  if v_customer.birth_date is not null
     and extract(month from v_customer.birth_date) = extract(month from v_sale.completed_at at time zone 'America/Sao_Paulo')
     and extract(day from v_customer.birth_date) = extract(day from v_sale.completed_at at time zone 'America/Sao_Paulo')
  then
    select exists (
      select 1 from public.loyalty_transactions
      where customer_id = v_sale.customer_id
        and company_id = v_sale.company_id
        and source = 'birthday'
        and created_at >= date_trunc('year', v_sale.completed_at at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo'
    ) into v_already_birthday_bonused;

    if not v_already_birthday_bonused and v_settings.birthday_bonus_points > 0 then
      v_birthday_points := v_settings.birthday_bonus_points;
    end if;
  end if;

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

-- VDA-1: nenhuma alteração pode deixar o total da venda menor do que o que já foi recebido.
create or replace function public.sale_items_guard_paid()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_sale public.sales;
  v_paid numeric(12,2);
  v_total numeric(12,2);
begin
  if tg_op = 'UPDATE' and new.total_amount >= old.total_amount then return null; end if;
  -- exclusão da conta apaga a empresa e tudo em cascata: nada a proteger
  if not exists (select 1 from public.companies where id = old.company_id) then return null; end if;
  select * into v_sale from public.sales where id = old.sale_id for update;
  if v_sale.id is null or v_sale.status <> 'draft' then return null; end if;
  select coalesce(sum(amount), 0) into v_paid from public.sale_payments where sale_id = v_sale.id and status = 'paid';
  if v_paid = 0 then return null; end if;
  select coalesce(sum(total_amount), 0) - v_sale.discount_amount - v_sale.loyalty_discount_amount into v_total
    from public.sale_items where sale_id = v_sale.id;
  if v_total < v_paid then
    raise exception 'O valor já recebido ficaria maior que o total da venda. Remova um pagamento antes de continuar.';
  end if;
  return null;
end $$;

create or replace function public.sales_guard_paid()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_completing boolean := new.status = 'completed' and old.status = 'draft';
  v_paid numeric(12,2);
  v_total numeric(12,2);
begin
  if not (v_completing or new.discount_amount > old.discount_amount or new.loyalty_discount_amount > old.loyalty_discount_amount) then
    return new;
  end if;
  select coalesce(sum(amount), 0) into v_paid from public.sale_payments where sale_id = new.id and status = 'paid';
  if v_paid = 0 then return new; end if;
  if v_completing then
    v_total := new.total_amount;
  else
    select coalesce(sum(total_amount), 0) - new.discount_amount - new.loyalty_discount_amount into v_total
      from public.sale_items where sale_id = new.id;
  end if;
  if v_total < v_paid then
    raise exception 'O valor já recebido ficaria maior que o total da venda. Remova um pagamento antes de continuar.';
  end if;
  return new;
end $$;

revoke all on function public.sale_items_guard_paid() from public, anon, authenticated;
revoke all on function public.sales_guard_paid() from public, anon, authenticated;

drop trigger if exists sale_items_guard_paid on public.sale_items;
create trigger sale_items_guard_paid after update or delete on public.sale_items
  for each row execute function public.sale_items_guard_paid();

drop trigger if exists sales_guard_paid on public.sales;
create trigger sales_guard_paid before update on public.sales
  for each row execute function public.sales_guard_paid();

-- VDA-3: desfazer um pagamento lançado em rascunho (fica como estornado; Financeiro e Caixa recebem o lançamento inverso).
create or replace function public.remove_draft_sale_payment(p_payment_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := public.current_profile_user_id();
  v_role public.company_role;
  v_sale public.sales;
  v_payment public.sale_payments;
begin
  if v_user is null then raise exception 'Usuário não autenticado.'; end if;
  select s.* into v_sale from public.sales s join public.sale_payments p on p.sale_id = s.id where p.id = p_payment_id for update of s;
  select cm.role into v_role from public.company_members cm where cm.company_id = v_sale.company_id and cm.user_id = v_user;
  if v_role is null then raise exception 'Pagamento não encontrado.'; end if;
  if v_role = 'employee' and v_sale.user_id <> v_user then raise exception 'Você só pode alterar vendas registradas por você.'; end if;
  if v_sale.status <> 'draft' then raise exception 'Só é possível remover pagamento de uma venda em rascunho.'; end if;
  select * into v_payment from public.sale_payments where id = p_payment_id for update;
  if v_payment.status <> 'paid' then raise exception 'Este pagamento já foi removido.'; end if;
  -- dinheiro que entrou na gaveta precisa sair de um caixa aberto, senão o caixa fica errado
  if v_payment.method = 'cash'
     and exists (select 1 from public.cash_movements where sale_payment_id = v_payment.id)
     and not exists (select 1 from public.cash_registers where company_id = v_sale.company_id and status = 'open') then
    raise exception 'Abra o caixa antes de remover um pagamento em dinheiro.';
  end if;
  update public.sale_payments set status = 'refunded' where id = v_payment.id;
  insert into public.audit_logs (company_id, actor_user_id, entity_type, entity_id, action, metadata)
  values (v_sale.company_id, v_user, 'sale', v_sale.id, 'sale.payment_removed',
    jsonb_build_object('method', v_payment.method, 'amount', v_payment.amount));
end $$;

create or replace function public.discard_draft_sale(p_sale_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := public.current_profile_user_id();
  v_role public.company_role;
  v_sale public.sales;
begin
  if v_user is null then raise exception 'Usuário não autenticado.'; end if;
  select * into v_sale from public.sales where id = p_sale_id for update;
  select cm.role into v_role from public.company_members cm where cm.company_id = v_sale.company_id and cm.user_id = v_user;
  if v_role is null then raise exception 'Venda não encontrada.'; end if;
  if v_role = 'employee' and v_sale.user_id <> v_user then raise exception 'Você só pode alterar vendas registradas por você.'; end if;
  if v_sale.status <> 'draft' then raise exception 'Só é possível descartar uma venda em rascunho.'; end if;
  if exists (select 1 from public.sale_payments where sale_id = v_sale.id and status = 'paid') then
    raise exception 'Remova os pagamentos antes de descartar o rascunho.';
  end if;
  if v_sale.loyalty_points_redeemed > 0 then
    perform public.undo_loyalty_redemption_for_draft_sale(v_sale.id);
  end if;
  update public.sales
     set status = 'cancelled', cancelled_at = now(), cancelled_by = v_user, cancelled_reason = 'Rascunho descartado'
   where id = v_sale.id;
  insert into public.audit_logs (company_id, actor_user_id, entity_type, entity_id, action, metadata)
  values (v_sale.company_id, v_user, 'sale', v_sale.id, 'sale.cancelled', jsonb_build_object('reason', 'Rascunho descartado'));
end $$;

-- RH-1: estornar um vale ainda não incluído em pagamento.
create or replace function public.hr_reverse_advance(p_adjustment_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := public.current_profile_user_id();
  v_company uuid := public.hr_manager_company_id();
  v_row public.hr_adjustments;
  v_entry public.financial_entries;
  v_register uuid;
begin
  if v_user is null then raise exception 'Usuário não autenticado.'; end if;
  if v_company is null then raise exception 'Acesso negado.'; end if;
  select * into v_row from public.hr_adjustments where id = p_adjustment_id and company_id = v_company for update;
  if not found then raise exception 'Lançamento não encontrado.'; end if;
  if v_row.kind <> 'advance' then raise exception 'Só vale (adiantamento) é estornado por aqui.'; end if;
  if v_row.payment_id is not null then raise exception 'Este vale já entrou em um pagamento. Cancele o pagamento antes.'; end if;
  select * into v_entry from public.financial_entries where id = v_row.financial_entry_id and company_id = v_company for update;
  if v_entry.id is not null and v_entry.status = 'posted' then
    if v_entry.method = 'cash' then
      select id into v_register from public.cash_registers where company_id = v_company and status = 'open' for update;
      if v_register is null then raise exception 'Abra o caixa antes de estornar um vale em dinheiro.'; end if;
      insert into public.cash_movements (company_id, cash_register_id, direction, amount, method, description, source, created_by)
      values (v_company, v_register, 'in', v_entry.amount, 'cash', left('Estorno: ' || v_entry.description, 200), 'manual', v_user);
    end if;
    update public.financial_entries set status = 'cancelled' where id = v_entry.id;
  end if;
  delete from public.hr_adjustments where id = v_row.id;
  insert into public.audit_logs (company_id, actor_user_id, entity_type, entity_id, action, metadata)
  values (v_company, v_user, 'hr_adjustment', v_row.id, 'hr.advance_reversed',
    jsonb_build_object('employee_id', v_row.employee_id, 'amount', v_row.amount, 'financial_entry_id', v_row.financial_entry_id));
end $$;

revoke all on function public.remove_draft_sale_payment(uuid) from public, anon;
revoke all on function public.discard_draft_sale(uuid) from public, anon;
revoke all on function public.hr_reverse_advance(uuid) from public, anon;
grant execute on function public.remove_draft_sale_payment(uuid) to authenticated, service_role;
grant execute on function public.discard_draft_sale(uuid) to authenticated, service_role;
grant execute on function public.hr_reverse_advance(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
