-- Phase 3 — Finance foundation
-- Reuses existing sales/sale_payments and operational cash instead of
-- duplicating accounts receivable or a second cash-register model.

do $$
begin
  create type public.financial_category_kind as enum ('income','expense');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.financial_entry_direction as enum ('income','expense');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.financial_entry_status as enum ('posted','cancelled');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.accounts_receivable_status as enum ('open','paid','cancelled');
exception when duplicate_object then null;
end $$;

alter type public.accounts_payable_status
  add value if not exists 'partial';

alter table public.accounts_payable
  add column if not exists paid_amount numeric(12,2) not null default 0,
  add column if not exists category_id uuid,
  add column if not exists cost_center_id uuid,
  add column if not exists notes text,
  add column if not exists paid_method public.sale_payment_method;

create table if not exists public.financial_categories (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  kind public.financial_category_kind not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, kind, name)
);

create table if not exists public.cost_centers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, name)
);

create table if not exists public.financial_entries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  direction public.financial_entry_direction not null,
  status public.financial_entry_status not null default 'posted',
  description text not null,
  amount numeric(12,2) not null check (amount > 0),
  occurred_on date not null default current_date,
  paid_at timestamptz,
  method public.sale_payment_method,
  category_id uuid references public.financial_categories(id) on delete set null,
  cost_center_id uuid references public.cost_centers(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  supplier_id uuid references public.suppliers(id) on delete set null,
  source_type text,
  source_id uuid,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists financial_entries_source_unique
  on public.financial_entries(source_type, source_id, direction)
  where source_type is not null and source_id is not null;

create index if not exists financial_entries_company_date_idx
  on public.financial_entries(company_id, occurred_on desc);

create index if not exists financial_entries_company_direction_idx
  on public.financial_entries(company_id, direction, status);

create index if not exists financial_entries_category_idx
  on public.financial_entries(category_id);

create index if not exists financial_entries_cost_center_idx
  on public.financial_entries(cost_center_id);

create table if not exists public.finance_default_seed_guard (
  company_id uuid primary key references public.companies(id) on delete cascade
);

create or replace function public.seed_financial_defaults(p_company_id uuid)
returns void
language plpgsql
security definer
set search_path=public
as $$
begin
  insert into public.financial_categories(company_id,name,kind)
  values
    (p_company_id,'Vendas','income'),
    (p_company_id,'Outros recebimentos','income'),
    (p_company_id,'Despesas operacionais','expense'),
    (p_company_id,'Pessoal','expense'),
    (p_company_id,'Impostos','expense'),
    (p_company_id,'Serviços','expense'),
    (p_company_id,'Compra / estoque','expense')
  on conflict (company_id,kind,name) do nothing;

  insert into public.cost_centers(company_id,name)
  values(p_company_id,'Geral')
  on conflict (company_id,name) do nothing;

  insert into public.finance_default_seed_guard(company_id)
  values(p_company_id)
  on conflict (company_id) do nothing;
end;
$$;

create or replace function public.seed_financial_defaults_on_company()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  perform public.seed_financial_defaults(new.id);
  return new;
end;
$$;

drop trigger if exists companies_seed_financial_defaults on public.companies;
create trigger companies_seed_financial_defaults
after insert on public.companies
for each row execute function public.seed_financial_defaults_on_company();

create or replace function public.touch_financial_rows()
returns trigger
language plpgsql
set search_path=public
as $$
begin
  new.updated_at:=now();
  return new;
end;
$$;

drop trigger if exists financial_categories_set_updated_at on public.financial_categories;
create trigger financial_categories_set_updated_at
before update on public.financial_categories
for each row execute function public.touch_financial_rows();

drop trigger if exists cost_centers_set_updated_at on public.cost_centers;
create trigger cost_centers_set_updated_at
before update on public.cost_centers
for each row execute function public.touch_financial_rows();

drop trigger if exists financial_entries_set_updated_at on public.financial_entries;
create trigger financial_entries_set_updated_at
before update on public.financial_entries
for each row execute function public.touch_financial_rows();

alter table public.financial_categories enable row level security;
alter table public.cost_centers enable row level security;
alter table public.financial_entries enable row level security;

drop policy if exists financial_categories_select_own_company on public.financial_categories;
create policy financial_categories_select_own_company
on public.financial_categories for select
using (company_id in (
  select cm.company_id from public.company_members cm where cm.user_id=auth.uid()
));

drop policy if exists financial_categories_insert_owner_admin on public.financial_categories;
create policy financial_categories_insert_owner_admin
on public.financial_categories for insert
with check (company_id in (
  select cm.company_id
  from public.company_members cm
  where cm.user_id=auth.uid() and cm.role in ('owner','admin')
));

drop policy if exists financial_categories_update_owner_admin on public.financial_categories;
create policy financial_categories_update_owner_admin
on public.financial_categories for update
using (company_id in (
  select cm.company_id
  from public.company_members cm
  where cm.user_id=auth.uid() and cm.role in ('owner','admin')
))
with check (company_id in (
  select cm.company_id
  from public.company_members cm
  where cm.user_id=auth.uid() and cm.role in ('owner','admin')
));

drop policy if exists cost_centers_select_own_company on public.cost_centers;
create policy cost_centers_select_own_company
on public.cost_centers for select
using (company_id in (
  select cm.company_id from public.company_members cm where cm.user_id=auth.uid()
));

drop policy if exists cost_centers_insert_owner_admin on public.cost_centers;
create policy cost_centers_insert_owner_admin
on public.cost_centers for insert
with check (company_id in (
  select cm.company_id
  from public.company_members cm
  where cm.user_id=auth.uid() and cm.role in ('owner','admin')
));

drop policy if exists cost_centers_update_owner_admin on public.cost_centers;
create policy cost_centers_update_owner_admin
on public.cost_centers for update
using (company_id in (
  select cm.company_id
  from public.company_members cm
  where cm.user_id=auth.uid() and cm.role in ('owner','admin')
))
with check (company_id in (
  select cm.company_id
  from public.company_members cm
  where cm.user_id=auth.uid() and cm.role in ('owner','admin')
));

drop policy if exists financial_entries_select_own_company on public.financial_entries;
create policy financial_entries_select_own_company
on public.financial_entries for select
using (company_id in (
  select cm.company_id from public.company_members cm where cm.user_id=auth.uid()
));

do $$
declare r record;
begin
  for r in select id from public.companies loop
    perform public.seed_financial_defaults(r.id);
  end loop;
end $$;

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
begin
  if v_user_id is null then raise exception 'Usuário não autenticado.'; end if;
  select company_id,role into v_company_id,v_role
  from public.company_members where user_id=v_user_id limit 1;
  if v_company_id is null then raise exception 'Nenhuma empresa encontrada para o usuário atual.'; end if;
  if v_role not in('owner','admin') then raise exception 'Apenas owner/admin podem lançar no financeiro.'; end if;
  if p_amount is null or p_amount<=0 then raise exception 'O valor deve ser maior que zero.'; end if;
  if nullif(trim(p_description),'') is null then raise exception 'Informe uma descrição.'; end if;

  perform public.seed_financial_defaults(v_company_id);

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
    round(p_amount,2),coalesce(p_occurred_on,current_date),
    now(),p_method,p_category_id,p_cost_center_id,
    nullif(trim(p_notes),''),v_user_id
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
    jsonb_build_object('direction',p_direction,'amount',p_amount,'method',p_method)
  );

  return v_entry;
end;
$$;

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
  from public.company_members where user_id=v_user_id limit 1;
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
    if v_register_id is null then
      raise exception 'Abra o caixa antes de pagar em dinheiro.';
    end if;
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
    v_company_id,'expense','posted',
    'Pagamento de fornecedor — '||v_payable.description,
    round(p_amount,2),coalesce(p_payment_date,current_date),now(),p_method,
    v_payable.category_id,v_payable.cost_center_id,v_payable.supplier_id,
    'accounts_payable_payment',gen_random_uuid(),
    nullif(concat_ws(' | ',nullif(trim(p_notes),''),'Conta a pagar: '||left(v_payable.id::text,8)),''),
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

create or replace function public.receive_sale_payment(
  p_sale_id uuid,
  p_amount numeric,
  p_method public.sale_payment_method,
  p_paid_at timestamptz default now(),
  p_notes text default null
)
returns public.sale_payments
language plpgsql
security definer
set search_path=public
as $$
declare
  v_user_id uuid:=auth.uid();
  v_company_id uuid;
  v_role public.company_role;
  v_sale public.sales;
  v_paid numeric(12,2);
  v_remaining numeric(12,2);
  v_payment public.sale_payments;
begin
  if v_user_id is null then raise exception 'Usuário não autenticado.'; end if;
  select company_id,role into v_company_id,v_role
  from public.company_members where user_id=v_user_id limit 1;
  if v_company_id is null then raise exception 'Nenhuma empresa encontrada para o usuário atual.'; end if;
  if v_role not in('owner','admin') then raise exception 'Apenas owner/admin podem registrar recebimentos.'; end if;

  select * into v_sale
  from public.sales
  where id=p_sale_id and company_id=v_company_id
  for update;

  if v_sale is null then raise exception 'Venda não encontrada.'; end if;
  if v_sale.status<>'completed' then raise exception 'Somente vendas concluídas podem receber pagamento.'; end if;
  if p_amount is null or p_amount<=0 then raise exception 'O valor do recebimento deve ser maior que zero.'; end if;

  select coalesce(sum(amount),0) into v_paid
  from public.sale_payments
  where sale_id=v_sale.id and status='paid';

  v_remaining:=round(v_sale.total_amount-v_paid,2);
  if p_amount>v_remaining then raise exception 'O recebimento excede o saldo da venda.'; end if;

  insert into public.sale_payments(
    company_id,sale_id,method,amount,status,paid_at,notes
  )
  values(
    v_company_id,v_sale.id,p_method,round(p_amount,2),
    'paid',coalesce(p_paid_at,now()),nullif(trim(p_notes),'')
  )
  returning * into v_payment;

  insert into public.audit_logs(company_id,actor_user_id,entity_type,entity_id,action,metadata)
  values(
    v_company_id,v_user_id,'sale_payment',v_payment.id,
    'sale_payment.received',
    jsonb_build_object(
      'sale_id',v_sale.id,
      'amount',p_amount,
      'remaining_after',round(v_remaining-p_amount,2)
    )
  );

  return v_payment;
end;
$$;

create or replace function public.create_financial_category(
  p_name text,
  p_kind public.financial_category_kind
)
returns public.financial_categories
language plpgsql
security definer
set search_path=public
as $$
declare
  v_company_id uuid;
  v_role public.company_role;
  v_row public.financial_categories;
begin
  select company_id,role into v_company_id,v_role
  from public.company_members
  where user_id=auth.uid()
  limit 1;

  if v_company_id is null then raise exception 'Nenhuma empresa encontrada para o usuário atual.'; end if;
  if v_role not in('owner','admin') then raise exception 'Apenas owner/admin podem cadastrar categorias.'; end if;
  if nullif(trim(p_name),'') is null then raise exception 'Informe o nome da categoria.'; end if;

  insert into public.financial_categories(company_id,name,kind)
  values(v_company_id,trim(p_name),p_kind)
  on conflict(company_id,kind,name)
  do update set active=true,updated_at=now()
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.create_cost_center(p_name text)
returns public.cost_centers
language plpgsql
security definer
set search_path=public
as $$
declare
  v_company_id uuid;
  v_role public.company_role;
  v_row public.cost_centers;
begin
  select company_id,role into v_company_id,v_role
  from public.company_members
  where user_id=auth.uid()
  limit 1;

  if v_company_id is null then raise exception 'Nenhuma empresa encontrada para o usuário atual.'; end if;
  if v_role not in('owner','admin') then raise exception 'Apenas owner/admin podem cadastrar centros de custo.'; end if;
  if nullif(trim(p_name),'') is null then raise exception 'Informe o nome do centro de custo.'; end if;

  insert into public.cost_centers(company_id,name)
  values(v_company_id,trim(p_name))
  on conflict(company_id,name)
  do update set active=true,updated_at=now()
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.create_financial_entry_from_sale_payment()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  v_sale public.sales;
  v_category uuid;
begin
  select * into v_sale from public.sales where id=new.sale_id;
  if v_sale.id is null then return new; end if;

  perform public.seed_financial_defaults(new.company_id);

  select id into v_category
  from public.financial_categories
  where company_id=new.company_id
    and kind='income'
    and name='Vendas'
  limit 1;

  if new.status='paid' then
    insert into public.financial_entries(
      company_id,direction,status,description,amount,occurred_on,paid_at,method,
      category_id,customer_id,source_type,source_id,notes,created_by
    )
    values(
      new.company_id,'income','posted',
      'Recebimento da venda — '||left(new.sale_id::text,8),
      new.amount,coalesce(new.paid_at::date,current_date),new.paid_at,new.method,
      v_category,v_sale.customer_id,'sale_payment',new.id,new.notes,
      coalesce(auth.uid(),v_sale.user_id)
    )
    on conflict do nothing;
  elsif new.status='refunded' then
    insert into public.financial_entries(
      company_id,direction,status,description,amount,occurred_on,paid_at,method,
      category_id,customer_id,source_type,source_id,notes,created_by
    )
    values(
      new.company_id,'expense','posted',
      'Estorno de pagamento — '||left(new.sale_id::text,8),
      new.amount,coalesce(new.updated_at::date,current_date),new.updated_at,new.method,
      (
        select id
        from public.financial_categories
        where company_id=new.company_id
          and kind='expense'
          and name='Despesas operacionais'
        limit 1
      ),
      v_sale.customer_id,'sale_payment_refund',new.id,new.notes,
      coalesce(auth.uid(),v_sale.user_id)
    )
    on conflict do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists sale_payments_create_financial_entry on public.sale_payments;
create trigger sale_payments_create_financial_entry
after insert or update on public.sale_payments
for each row execute function public.create_financial_entry_from_sale_payment();

insert into public.financial_entries(
  company_id,direction,status,description,amount,occurred_on,paid_at,method,
  category_id,customer_id,source_type,source_id,notes,created_by
)
select
  sp.company_id,'income','posted',
  'Recebimento da venda — '||left(sp.sale_id::text,8),
  sp.amount,coalesce(sp.paid_at::date,current_date),sp.paid_at,sp.method,
  fc.id,s.customer_id,'sale_payment',sp.id,sp.notes,s.user_id
from public.sale_payments sp
join public.sales s on s.id=sp.sale_id
left join public.financial_categories fc
  on fc.company_id=sp.company_id
 and fc.kind='income'
 and fc.name='Vendas'
where sp.status='paid'
on conflict do nothing;

revoke all on function public.create_financial_entry(
  public.financial_entry_direction,text,numeric,date,public.sale_payment_method,uuid,uuid,text
) from public;
grant execute on function public.create_financial_entry(
  public.financial_entry_direction,text,numeric,date,public.sale_payment_method,uuid,uuid,text
) to authenticated;

revoke all on function public.pay_accounts_payable(
  uuid,numeric,public.sale_payment_method,date,text
) from public;
grant execute on function public.pay_accounts_payable(
  uuid,numeric,public.sale_payment_method,date,text
) to authenticated;

revoke all on function public.receive_sale_payment(
  uuid,numeric,public.sale_payment_method,timestamptz,text
) from public;
grant execute on function public.receive_sale_payment(
  uuid,numeric,public.sale_payment_method,timestamptz,text
) to authenticated;

revoke all on function public.create_financial_category(
  text,public.financial_category_kind
) from public;
grant execute on function public.create_financial_category(
  text,public.financial_category_kind
) to authenticated;

revoke all on function public.create_cost_center(text) from public;
grant execute on function public.create_cost_center(text) to authenticated;

revoke all on function public.seed_financial_defaults(uuid) from public, authenticated, anon;
revoke all on function public.seed_financial_defaults_on_company() from public, authenticated, anon;
revoke all on function public.touch_financial_rows() from public, authenticated, anon;
revoke all on function public.create_financial_entry_from_sale_payment() from public, authenticated, anon;