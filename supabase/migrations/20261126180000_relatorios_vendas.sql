-- Relatórios (etapa 3A): aba Vendas, com todos os itens e a margem, filtros por item, cliente e quem registrou.
-- Só leitura; respeita o isolamento por empresa (invoker/RLS).
-- Rollback: supabase/rollback/20261126180000_relatorios_vendas.down.sql
begin;

create or replace function public.report_sales(
  p_company_id uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_customer_id uuid default null,
  p_without_customer boolean default false,
  p_user_id uuid default null,
  p_item text default null
)
returns jsonb
language sql
stable
security invoker
set search_path to ''
as $function$
  with filtro as (
    select nullif(lower(btrim(coalesce(p_item, ''))), '') as item
  ),
  periodo as (
    select s.id, s.customer_id, s.user_id, s.total_amount, s.total_cost
      from public.sales s
     where s.company_id = p_company_id and s.status = 'completed' and s.completed_at >= p_from and s.completed_at <= p_to
  ),
  itens_filtrados as (
    -- itens das vendas do período que passam por todos os filtros
    select i.sale_id, i.item_type, i.description, i.quantity, i.total_amount,
           round(i.quantity * coalesce(i.unit_cost, 0), 2) as custo,
           coalesce(i.unit_cost, 0) = 0 as sem_custo
      from public.sale_items i
      join periodo v on v.id = i.sale_id, filtro f
     where i.company_id = p_company_id
       and (p_customer_id is null or v.customer_id = p_customer_id)
       and (not p_without_customer or v.customer_id is null)
       and (p_user_id is null or v.user_id = p_user_id)
       and (f.item is null or position(f.item in lower(i.description)) > 0)
  ),
  vendas as (
    -- com filtro de item, a venda vale pelos itens que combinam; sem ele, pelo total dela (já com descontos)
    select v.id, v.user_id,
           case when f.item is null then v.total_amount else x.faturamento end as faturamento,
           case when f.item is null then v.total_cost else x.custo end as custo,
           case when f.item is null then x.faturamento - v.total_amount else 0 end as desconto
      from periodo v
      cross join filtro f
      join (select sale_id, sum(total_amount) as faturamento, sum(custo) as custo from itens_filtrados group by sale_id) x
        on x.sale_id = v.id
  ),
  itens as (
    select item_type, description, sum(quantity) as quantidade, sum(total_amount) as faturamento, sum(custo) as custo,
           coalesce(sum(quantity) filter (where sem_custo), 0) as quantidade_sem_custo,
           coalesce(sum(total_amount) filter (where sem_custo), 0) as faturamento_sem_custo
      from itens_filtrados
     group by item_type, description
  ),
  vendedores as (
    select user_id, count(*) as vendas, sum(faturamento) as faturamento, sum(custo) as custo from vendas group by user_id
  ),
  clientes as (
    -- opções do filtro: todos que compraram no período, sem depender do que já está filtrado
    select distinct c.id, c.name
      from periodo v
      join public.customers c on c.id = v.customer_id and c.company_id = p_company_id
  )
  select jsonb_build_object(
    'sales', (select count(*) from vendas),
    'revenue', (select coalesce(sum(faturamento), 0) from vendas),
    'cost', (select coalesce(sum(custo), 0) from vendas),
    'discounts', (select coalesce(sum(desconto), 0) from vendas),
    'items', (select coalesce(jsonb_agg(jsonb_build_object(
                'item_type', item_type, 'description', description, 'quantity', quantidade, 'revenue', faturamento,
                'cost', custo, 'uncosted_quantity', quantidade_sem_custo, 'uncosted_revenue', faturamento_sem_custo)
                order by faturamento desc, description), '[]'::jsonb) from itens),
    'sellers', (select coalesce(jsonb_agg(jsonb_build_object(
                  'user_id', user_id, 'sales', vendas, 'revenue', faturamento, 'cost', custo)
                  order by faturamento desc), '[]'::jsonb) from vendedores),
    'customers', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name) order by name), '[]'::jsonb) from clientes)
  );
$function$;

revoke all on function public.report_sales(uuid, timestamptz, timestamptz, uuid, boolean, uuid, text) from public, anon;
grant execute on function public.report_sales(uuid, timestamptz, timestamptz, uuid, boolean, uuid, text) to authenticated, service_role;

commit;
