-- Phase 3 hardening: allow multiple partial payments per payable and
-- remove an identical duplicate index.

drop index if exists public.accounts_payable_company_due_idx;

create or replace function public.pay_accounts_payable(
  p_payable_id uuid,
  p_amount numeric,
  p_method public.sale_payment_method,
  p_payment_date date default current_date,
  p_notes text default null
)
returns public.accounts_payable
language plpgsql
security definer
set search_path=public
as $$
declare
  v_user_id uuid:=auth.uid();
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
    coalesce(p_payment_date,current_date),
    now(),
    p_method,
    v_payable.category_id,
    v_payable.cost_center_id,
    v_payable.supplier_id,
    'accounts_payable_payment',
    gen_random_uuid(),
    nullif(concat_ws(
      ' | ',
      nullif(trim(p_notes),''),
      'Conta a pagar: '||left(v_payable.id::text,8)
    ),''),
    v_user_id
  );

  if p_method='cash' then
    insert into public.cash_movements(
      company_id,cash_register_id,direction,amount,method,description,source,created_by
    )
    values(
      v_company_id,v_register_id,'out',round(p_amount,2),p_method,
      'Pagamento de fornecedor — '||v_payable.description,'manual',v_user_id
    );
  end if;

  insert into public.audit_logs(company_id,actor_user_id,entity_type,entity_id,action,metadata)
  values(
    v_company_id,v_user_id,'accounts_payable',v_payable.id,
    'accounts_payable.payment',
    jsonb_build_object(
      'amount',p_amount,
      'paid_amount',v_payable.paid_amount,
      'remaining_after',round(v_payable.amount-v_payable.paid_amount,2)
    )
  );

  return v_payable;
end;
$$;

revoke all on function public.pay_accounts_payable(
  uuid,numeric,public.sale_payment_method,date,text
) from public;
grant execute on function public.pay_accounts_payable(
  uuid,numeric,public.sale_payment_method,date,text
) to authenticated;