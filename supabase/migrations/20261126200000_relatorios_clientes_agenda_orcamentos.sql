-- Relatórios (etapa 3B): abas Clientes, Agenda e Orçamentos. Só leitura; respeitam o isolamento por empresa
-- (invoker/RLS).
-- Rollback: supabase/rollback/20261126200000_relatorios_clientes_agenda_orcamentos.down.sql
begin;

-- Clientes. "Novo": a primeira compra concluída da vida cai no período. "Recorrente": já tinha comprado antes.
-- "Sem comprar" é a posição de hoje, só de clientes ativos que já compraram.
create or replace function public.report_customers(
  p_company_id uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_inactive_days integer default 30
)
returns jsonb
language sql
stable
security invoker
set search_path to ''
as $function$
  with hoje as (
    select (now() at time zone 'America/Sao_Paulo')::date as dia
  ),
  concluidas as (
    select s.customer_id, s.completed_at, s.total_amount
      from public.sales s
     where s.company_id = p_company_id and s.status = 'completed'
  ),
  historico as (
    select customer_id, min(completed_at) as primeira, max(completed_at) as ultima, count(*) as compras, sum(total_amount) as gasto
      from concluidas
     where customer_id is not null
     group by customer_id
  ),
  no_periodo as (
    select customer_id, count(*) as compras, sum(total_amount) as faturamento
      from concluidas
     where completed_at >= p_from and completed_at <= p_to
     group by customer_id
  ),
  compradores as (
    select n.customer_id, c.name, n.compras, n.faturamento, h.primeira >= p_from as novo
      from no_periodo n
      join historico h on h.customer_id = n.customer_id
      join public.customers c on c.id = n.customer_id and c.company_id = p_company_id
  ),
  parados as (
    select c.id, c.name, (h.ultima at time zone 'America/Sao_Paulo')::date as ultima,
           j.dia - (h.ultima at time zone 'America/Sao_Paulo')::date as dias, h.compras, h.gasto
      from public.customers c
      join historico h on h.customer_id = c.id
     cross join hoje j
     where c.company_id = p_company_id and c.status = 'active'
  ),
  lista as (
    select * from parados where dias >= p_inactive_days order by gasto desc, name limit 50
  )
  select jsonb_build_object(
    'new', (select jsonb_build_object('customers', count(*), 'sales', coalesce(sum(compras), 0), 'revenue', coalesce(sum(faturamento), 0)) from compradores where novo),
    'returning', (select jsonb_build_object('customers', count(*), 'sales', coalesce(sum(compras), 0), 'revenue', coalesce(sum(faturamento), 0)) from compradores where not novo),
    'without_customer', (select jsonb_build_object('sales', coalesce(sum(compras), 0), 'revenue', coalesce(sum(faturamento), 0)) from no_periodo where customer_id is null),
    'registered', (select count(*) from public.customers c where c.company_id = p_company_id and c.created_at >= p_from and c.created_at <= p_to),
    'top', (select coalesce(jsonb_agg(jsonb_build_object('id', customer_id, 'name', name, 'sales', compras, 'revenue', faturamento, 'new', novo)
              order by faturamento desc, name), '[]'::jsonb)
              from (select * from compradores order by faturamento desc, name limit 10) t),
    'inactive_30', (select count(*) from parados where dias >= 30),
    'inactive_60', (select count(*) from parados where dias >= 60),
    'inactive_90', (select count(*) from parados where dias >= 90),
    'inactive_total', (select count(*) from parados where dias >= p_inactive_days),
    'inactive', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'last', ultima, 'days', dias, 'sales', compras, 'spent', gasto)
                   order by gasto desc, name), '[]'::jsonb) from lista),
    'never_bought', (select count(*) from public.customers c
                      where c.company_id = p_company_id and c.status = 'active'
                        and not exists (select 1 from historico h where h.customer_id = c.id))
  );
$function$;

-- Agenda por profissional. O valor é o das vendas concluídas ligadas aos atendimentos (cada venda uma vez).
create or replace function public.report_agenda(
  p_company_id uuid,
  p_from timestamptz,
  p_to timestamptz
)
returns jsonb
language sql
stable
security invoker
set search_path to ''
as $function$
  with atendimentos as (
    select a.professional_id, a.status::text as situacao, a.sale_id, a.starts_at
      from public.appointments a
     where a.company_id = p_company_id and a.starts_at >= p_from and a.starts_at <= p_to
  ),
  contagem as (
    select professional_id,
           count(*) as total,
           count(*) filter (where situacao = 'completed') as concluidos,
           count(*) filter (where situacao = 'no_show') as faltas,
           count(*) filter (where situacao = 'cancelled') as cancelados,
           count(*) filter (where situacao in ('scheduled', 'confirmed') and starts_at >= now()) as a_fazer,
           count(*) filter (where situacao in ('scheduled', 'confirmed') and starts_at < now()) as sem_baixa
      from atendimentos
     group by professional_id
  ),
  vendas as (
    select x.professional_id, count(*) as vendas, sum(s.total_amount) as valor
      from (select distinct professional_id, sale_id from atendimentos where sale_id is not null) x
      join public.sales s on s.id = x.sale_id and s.company_id = p_company_id and s.status = 'completed'
     group by x.professional_id
  )
  select jsonb_build_object(
    'professionals', coalesce(jsonb_agg(jsonb_build_object(
      'id', c.professional_id, 'name', p.display_name, 'total', c.total, 'completed', c.concluidos, 'no_show', c.faltas,
      'cancelled', c.cancelados, 'upcoming', c.a_fazer, 'unsettled', c.sem_baixa,
      'sales', coalesce(v.vendas, 0), 'revenue', coalesce(v.valor, 0))
      order by coalesce(v.valor, 0) desc, c.total desc, p.display_name), '[]'::jsonb)
  )
    from contagem c
    left join public.professional_profiles p on p.id = c.professional_id and p.company_id = p_company_id
    left join vendas v on v.professional_id is not distinct from c.professional_id;
$function$;

-- Orçamentos emitidos no período, por situação de hoje. "Vencido": enviado cuja validade já passou.
create or replace function public.report_quotes(
  p_company_id uuid,
  p_from_date date,
  p_to_date date
)
returns jsonb
language sql
stable
security invoker
set search_path to ''
as $function$
  with orcamentos as (
    select case
             when q.status = 'converted' or q.sale_id is not null then 'converted'
             when q.status = 'sent' and q.valid_until < (now() at time zone 'America/Sao_Paulo')::date then 'expired'
             else q.status
           end as situacao,
           q.total_amount, q.sale_id
      from public.quotes q
     where q.company_id = p_company_id and q.issued_on between p_from_date and p_to_date
  )
  select jsonb_build_object(
    'by_status', (select coalesce(jsonb_object_agg(situacao, jsonb_build_object('count', n, 'amount', valor)), '{}'::jsonb)
                    from (select situacao, count(*) as n, sum(total_amount) as valor from orcamentos group by situacao) x),
    -- o que virou venda de fato: vendas concluídas ligadas aos orçamentos
    'sold', (select coalesce(sum(s.total_amount), 0) from public.sales s
              where s.company_id = p_company_id and s.status = 'completed'
                and s.id in (select sale_id from orcamentos where sale_id is not null))
  );
$function$;

revoke all on function public.report_customers(uuid, timestamptz, timestamptz, integer) from public, anon;
revoke all on function public.report_agenda(uuid, timestamptz, timestamptz) from public, anon;
revoke all on function public.report_quotes(uuid, date, date) from public, anon;
grant execute on function public.report_customers(uuid, timestamptz, timestamptz, integer) to authenticated, service_role;
grant execute on function public.report_agenda(uuid, timestamptz, timestamptz) to authenticated, service_role;
grant execute on function public.report_quotes(uuid, date, date) to authenticated, service_role;

commit;
