-- Phase 3 security hardening.
-- Validate tenant ownership of category/cost center inputs and keep
-- trigger/helper functions non-callable by API roles.

create or replace function public.create_financial_entry(
  p_direction public.financial_entry_direction,
  p_description text,
  p_amount numeric,
  p_occurred_on date,
  p_method public.sale_payment_method,
  p_category_id uuid default null,
  p_cost_center_id uuid default null,
  p_notes text default null
)
returns public.financial_entries
language plpgsql
security definer
set search_path=public
as $$
declare
  v_user_id uuid:=auth.uid();
  v_company_id uuid;
  v_role public.company_role;
  v_entry public.financial_entries;
  v_cash_register_id uuid;
  v_category_kind public.financial_category_kind;
begin
  if v_user_id is null then raise exception 'Usuário não autenticado.'; end if;

  select company_id,role into v_company_id,v_role
  from public.company_members
  where user_id=v_user_id
  limit 1;

  if v_company_id is null then raise exception 'Nenhuma empresa encontrada para o usuário atual.'; end if;
  if v_role not in('owner','admin') then raise exception 'Apenas owner/admin podem lançar no financeiro.'; end if;
  if p_direction is null then raise exception 'Informe o tipo do lançamento.'; end if;
  if p_amount is null or p_amount<=0 then raise exception 'O valor deve ser maior que zero.'; end if;
  if nullif(trim(p_description),'') is null then raise exception 'Informe uma descrição.'; end if;

  perform public.seed_financial_defaults(v_company_id);

  if p_category_id is not null then
    select kind into v_category_kind
    from public.financial_categories
    where id=p_category_id
      and company_id=v_company_id
      and active=true;

    if v_category_kind is null then
      raise exception 'Categoria financeira inválida para esta empresa.';
    end if;

    if v_category_kind::text <> p_direction::text then
      raise exception 'A categoria não corresponde ao tipo do lançamento.';
    end if;
  end if;

  if p_cost_center_id is not null and not exists(
    select 1
    from public.cost_centers
    where id=p_cost_center_id
      and company_id=v_company_id
      and active=true
  ) then
    raise exception 'Centro de custo inválido para esta empresa.';
  end if;

  if p_method='cash' then
    select id into v_cash_register_id
    from public.cash_registers
    where company_id=v_company_id and status='open'
    for update;

    if v_cash_register_id is null then
      raise exception 'Abra o caixa antes de lançar uma movimentação em dinheiro.';
    end if;
  end if;

  insert into public.financial_entries(
    company_id,direction,status,description,amount,occurred_on,paid_at,method,
    category_id,cost_center_id,notes,created_by
  )
  values(
    v_company_id,p_direction,'posted',trim(p_description),
    round(p_amount,2),coalesce(p_occurred_on,current_date),now(),p_method,
    p_category_id,p_cost_center_id,nullif(trim(p_notes),''),v_user_id
  )
  returning * into v_entry;

  if p_method='cash' then
    insert into public.cash_movements(
      company_id,cash_register_id,direction,amount,method,description,source,created_by
    )
    values(
      v_company_id,v_cash_register_id,
      case when p_direction='income' then 'in' else 'out' end,
      round(p_amount,2),p_method,trim(p_description),'manual',v_user_id
    );
  end if;

  insert into public.audit_logs(company_id,actor_user_id,entity_type,entity_id,action,metadata)
  values(
    v_company_id,v_user_id,'financial_entry',v_entry.id,
    'financial_entry.created',
    jsonb_build_object(
      'direction',p_direction,
      'amount',p_amount,
      'method',p_method,
      'category_id',p_category_id,
      'cost_center_id',p_cost_center_id
    )
  );

  return v_entry;
end;
$$;

revoke all on function public.create_financial_entry(
  public.financial_entry_direction,text,numeric,date,public.sale_payment_method,uuid,uuid,text
) from public;
grant execute on function public.create_financial_entry(
  public.financial_entry_direction,text,numeric,date,public.sale_payment_method,uuid,uuid,text
) to authenticated;

revoke all on function public.seed_financial_defaults(uuid) from public, authenticated, anon;
revoke all on function public.seed_financial_defaults_on_company() from public, authenticated, anon;
revoke all on function public.touch_financial_rows() from public, authenticated, anon;
revoke all on function public.create_financial_entry_from_sale_payment() from public, authenticated, anon;