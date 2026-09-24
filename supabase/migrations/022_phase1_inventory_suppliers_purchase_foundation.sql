-- FASE 1 — Estoque completo + Fornecedores + fundação de Compras.
-- Modelagem funcional inspirada em Dolibarr/OCA; implementação própria Prime Ges.

create type public.supplier_status as enum ('active','inactive');
create type public.stock_movement_direction as enum ('in','out','adjustment');
create type public.stock_movement_source as enum ('opening','manual','sale','sale_cancellation','purchase','purchase_cancellation');
create type public.purchase_order_status as enum ('draft','ordered','partially_received','received','cancelled');

create table public.suppliers (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
 name text not null, legal_name text, document text, email text, phone text, whatsapp text, address text, address_number text,
 complement text, neighborhood text, city text, state text, postal_code text, notes text,
 status public.supplier_status not null default 'active', created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 constraint suppliers_name_length check (char_length(trim(name)) between 1 and 180)
);
create index suppliers_company_id_idx on public.suppliers(company_id);
create index suppliers_company_status_idx on public.suppliers(company_id,status);
create unique index suppliers_document_per_company_unique on public.suppliers(company_id,document) where document is not null and trim(document)<>'';
create trigger suppliers_set_updated_at before update on public.suppliers for each row execute function public.set_updated_at();
create trigger suppliers_protect_company_id before update on public.suppliers for each row execute function public.protect_company_id();

create table public.supplier_products (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
 supplier_id uuid not null references public.suppliers(id) on delete cascade, product_id uuid not null references public.products(id) on delete cascade,
 supplier_code text, unit_cost numeric(12,2) not null default 0, minimum_order_quantity numeric(12,3) not null default 1,
 lead_time_days integer, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 constraint supplier_products_unique unique(supplier_id,product_id), constraint supplier_products_cost_non_negative check(unit_cost>=0),
 constraint supplier_products_min_qty_positive check(minimum_order_quantity>0), constraint supplier_products_lead_time_non_negative check(lead_time_days is null or lead_time_days>=0)
);
create index supplier_products_company_idx on public.supplier_products(company_id);
create index supplier_products_product_idx on public.supplier_products(product_id);
create trigger supplier_products_set_updated_at before update on public.supplier_products for each row execute function public.set_updated_at();
create trigger supplier_products_protect_company_id before update on public.supplier_products for each row execute function public.protect_company_id();

create table public.stock_movements (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
 product_id uuid not null references public.products(id) on delete cascade, direction public.stock_movement_direction not null,
 quantity numeric(12,3) not null, stock_before numeric(12,3) not null, stock_after numeric(12,3) not null,
 reason text not null, source public.stock_movement_source not null, reference_id uuid, created_by uuid references auth.users(id),
 created_at timestamptz not null default now(), constraint stock_movements_quantity_positive check(quantity>0),
 constraint stock_movements_stock_non_negative check(stock_before>=0 and stock_after>=0)
);
create index stock_movements_company_product_created_idx on public.stock_movements(company_id,product_id,created_at desc);
create unique index stock_movements_reference_unique on public.stock_movements(source,reference_id) where reference_id is not null;
insert into public.stock_movements(company_id,product_id,direction,quantity,stock_before,stock_after,reason,source)
select company_id,id,'in',stock_quantity,0,stock_quantity,'Saldo existente na implantação da Fase 1','opening' from public.products where stock_quantity>0 on conflict do nothing;

create or replace function public.record_stock_movement_from_audit() returns trigger language plpgsql security definer set search_path=public as $$
declare p uuid; b numeric; a numeric; d numeric; s public.stock_movement_source; dir public.stock_movement_direction;
begin
 if new.action not in ('product_stock_adjusted','sale.stock_adjusted') then return new; end if;
 p:=coalesce(nullif(new.metadata->>'product_id','')::uuid,case when new.entity_type='product' then new.entity_id else null end);
 if p is null then return new; end if;
 b:=coalesce(nullif(new.metadata->>'previousStock','')::numeric,nullif(new.metadata->>'stock_before','')::numeric);
 a:=coalesce(nullif(new.metadata->>'newStock','')::numeric,nullif(new.metadata->>'stock_after','')::numeric);
 d:=abs(coalesce(a,0)-coalesce(b,0)); if d<=0 then return new; end if;
 if new.action='sale.stock_adjusted' then
   if coalesce(new.metadata->>'reason','')='sale_cancelled' then s:='sale_cancellation'; dir:='in'; else s:='sale'; dir:='out'; end if;
 else s:='manual'; dir:=case when coalesce(a,0)>=coalesce(b,0) then 'in' else 'out' end; end if;
 insert into public.stock_movements(company_id,product_id,direction,quantity,stock_before,stock_after,reason,source,reference_id,created_by)
 values(new.company_id,p,dir,d,coalesce(b,0),coalesce(a,0),coalesce(new.metadata->>'reason',new.action),s,new.entity_id,new.actor_user_id) on conflict do nothing;
 return new;
end $$;
drop trigger if exists audit_logs_record_stock_movement on public.audit_logs;
create trigger audit_logs_record_stock_movement after insert on public.audit_logs for each row execute function public.record_stock_movement_from_audit();

create table public.purchase_orders (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
 supplier_id uuid not null references public.suppliers(id) on delete restrict, status public.purchase_order_status not null default 'draft',
 order_number text, ordered_at timestamptz, expected_at timestamptz, received_at timestamptz,
 subtotal numeric(12,2) not null default 0, discount_amount numeric(12,2) not null default 0, total_amount numeric(12,2) not null default 0,
 notes text, created_by uuid references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 constraint purchase_orders_amounts_non_negative check(subtotal>=0 and discount_amount>=0 and total_amount>=0)
);
create index purchase_orders_company_status_idx on public.purchase_orders(company_id,status);
create index purchase_orders_supplier_idx on public.purchase_orders(supplier_id);
create trigger purchase_orders_set_updated_at before update on public.purchase_orders for each row execute function public.set_updated_at();
create trigger purchase_orders_protect_company_id before update on public.purchase_orders for each row execute function public.protect_company_id();

create table public.purchase_order_items (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
 purchase_order_id uuid not null references public.purchase_orders(id) on delete cascade, product_id uuid not null references public.products(id) on delete restrict,
 description text not null, quantity numeric(12,3) not null, received_quantity numeric(12,3) not null default 0,
 unit_cost numeric(12,2) not null, total_amount numeric(12,2) not null, created_at timestamptz not null default now(),
 constraint purchase_items_qty_positive check(quantity>0), constraint purchase_items_received_valid check(received_quantity>=0 and received_quantity<=quantity),
 constraint purchase_items_cost_non_negative check(unit_cost>=0), constraint purchase_items_total_valid check(total_amount>=0)
);
create index purchase_items_order_idx on public.purchase_order_items(purchase_order_id);
create index purchase_items_product_idx on public.purchase_order_items(product_id);

alter table public.suppliers enable row level security;
alter table public.supplier_products enable row level security;
alter table public.stock_movements enable row level security;
alter table public.purchase_orders enable row level security;
alter table public.purchase_order_items enable row level security;

create policy "suppliers_select_own_company" on public.suppliers for select to authenticated using(company_id in(select company_id from public.company_members where user_id=auth.uid()));
create policy "suppliers_insert_own_company" on public.suppliers for insert to authenticated with check(company_id in(select company_id from public.company_members where user_id=auth.uid()));
create policy "suppliers_update_own_company" on public.suppliers for update to authenticated using(company_id in(select company_id from public.company_members where user_id=auth.uid())) with check(company_id in(select company_id from public.company_members where user_id=auth.uid()));
create policy "supplier_products_select_own_company" on public.supplier_products for select to authenticated using(company_id in(select company_id from public.company_members where user_id=auth.uid()));
create policy "supplier_products_insert_own_company" on public.supplier_products for insert to authenticated with check(company_id in(select company_id from public.company_members where user_id=auth.uid()));
create policy "supplier_products_update_own_company" on public.supplier_products for update to authenticated using(company_id in(select company_id from public.company_members where user_id=auth.uid())) with check(company_id in(select company_id from public.company_members where user_id=auth.uid()));
create policy "stock_movements_select_own_company" on public.stock_movements for select to authenticated using(company_id in(select company_id from public.company_members where user_id=auth.uid()));
create policy "purchase_orders_select_own_company" on public.purchase_orders for select to authenticated using(company_id in(select company_id from public.company_members where user_id=auth.uid()));
create policy "purchase_orders_insert_own_company" on public.purchase_orders for insert to authenticated with check(company_id in(select company_id from public.company_members where user_id=auth.uid()));
create policy "purchase_orders_update_own_company" on public.purchase_orders for update to authenticated using(company_id in(select company_id from public.company_members where user_id=auth.uid())) with check(company_id in(select company_id from public.company_members where user_id=auth.uid()));
create policy "purchase_order_items_select_own_company" on public.purchase_order_items for select to authenticated using(company_id in(select company_id from public.company_members where user_id=auth.uid()));
create policy "purchase_order_items_insert_own_company" on public.purchase_order_items for insert to authenticated with check(company_id in(select company_id from public.company_members where user_id=auth.uid()));
create policy "purchase_order_items_update_own_company" on public.purchase_order_items for update to authenticated using(company_id in(select company_id from public.company_members where user_id=auth.uid())) with check(company_id in(select company_id from public.company_members where user_id=auth.uid()));

-- Reconciliação com o live: índices presentes no SQL aplicado (versão 20260921235749)
-- que não estavam neste arquivo.
create index stock_movements_company_source_idx on public.stock_movements using btree (company_id, source);
create index suppliers_name_idx on public.suppliers using btree (name);

comment on table public.stock_movements is 'Ledger imutável de estoque da Fase 1.';
comment on table public.supplier_products is 'Relação fornecedor-produto preparada para Compras.';
comment on table public.purchase_orders is 'Fundação do fluxo de Compras; recebimento e integração financeira entram na Fase 2.';
