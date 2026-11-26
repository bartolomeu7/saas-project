-- Relatórios (etapa 1): os números do período são somados no banco, numa consulta só, em vez de trazer todas as
-- vendas, itens e pagamentos para o site. Recebimentos passam a valer pela data do recebimento, a partir do
-- lançamento no Financeiro (recebido menos estornado). Só leitura; respeita o isolamento por empresa (invoker/RLS).
-- Rollback: supabase/rollback/20261126160000_relatorios_resumo.down.sql
begin;

create or replace function public.report_summary(
  p_company_id uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_appointments_to timestamptz
)
returns jsonb
language sql
stable
security invoker
set search_path to ''
as $function$
  with limites as (
    -- datas-calendário de São Paulo: do período e de hoje
    select (p_from at time zone 'America/Sao_Paulo')::date as de,
           (p_to at time zone 'America/Sao_Paulo')::date as ate,
           (now() at time zone 'America/Sao_Paulo')::date as hoje
  ),
  vendas as (
    select s.id, s.total_amount, s.total_cost, (s.completed_at at time zone 'America/Sao_Paulo')::date as dia
      from public.sales s
     where s.company_id = p_company_id and s.status = 'completed' and s.completed_at >= p_from and s.completed_at <= p_to
  ),
  dias as (
    select dia, sum(total_amount) as valor from vendas group by dia
  ),
  itens as (
    select i.item_type, i.description, sum(i.quantity) as quantidade, sum(i.total_amount) as faturamento
      from public.sale_items i
      join vendas v on v.id = i.sale_id
     where i.company_id = p_company_id
     group by i.item_type, i.description
  ),
  lancamentos as (
    select f.direction, f.source_type, f.method, f.amount
      from public.financial_entries f, limites l
     where f.company_id = p_company_id and f.status = 'posted' and f.occurred_on between l.de and l.ate
  ),
  recebimentos as (
    select method,
           coalesce(sum(amount) filter (where source_type = 'sale_payment'), 0) as recebido,
           coalesce(sum(amount) filter (where source_type = 'sale_payment_refund'), 0) as estornado
      from lancamentos
     where source_type in ('sale_payment', 'sale_payment_refund')
     group by method
  ),
  totais as (
    select direction, source_type, sum(amount) as amount from lancamentos group by direction, source_type
  ),
  a_receber as (
    select (s.sold_at at time zone 'America/Sao_Paulo')::date as dia,
           greatest(0, s.total_amount - coalesce((
             select sum(p.amount) from public.sale_payments p
              where p.sale_id = s.id and p.company_id = p_company_id and p.status = 'paid'), 0)) as saldo
      from public.sales s
     where s.company_id = p_company_id and s.status = 'completed' and s.payment_status = 'pending'
  ),
  a_pagar as (
    select a.due_date, greatest(0, a.amount - coalesce(a.paid_amount, 0)) as saldo
      from public.accounts_payable a
     where a.company_id = p_company_id and a.status in ('open', 'partial')
  ),
  agenda as (
    select a.status::text as situacao, count(*) as total
      from public.appointments a
     where a.company_id = p_company_id and a.starts_at >= p_from and a.starts_at <= p_appointments_to
     group by a.status
  )
  select jsonb_build_object(
    'revenue', (select coalesce(sum(total_amount), 0) from vendas),
    'cost_of_goods', (select coalesce(sum(total_cost), 0) from vendas),
    'completed_sales', (select count(*) from vendas),
    'days', (select coalesce(jsonb_agg(jsonb_build_object('date', dia, 'value', valor) order by dia), '[]'::jsonb) from dias),
    'items', (select coalesce(jsonb_agg(jsonb_build_object(
                'item_type', item_type, 'description', description, 'quantity', quantidade, 'revenue', faturamento)
                order by faturamento desc, description), '[]'::jsonb) from itens),
    'payments', (select coalesce(jsonb_agg(jsonb_build_object(
                   'method', method, 'received', recebido, 'refunded', estornado)
                   order by recebido - estornado desc), '[]'::jsonb) from recebimentos),
    'entries', (select coalesce(jsonb_agg(jsonb_build_object(
                  'direction', direction, 'source_type', source_type, 'amount', amount)), '[]'::jsonb) from totais),
    'receivable', (select coalesce(sum(saldo), 0) from a_receber),
    'receivable_overdue', (select count(*) from a_receber r, limites l where r.saldo > 0 and r.dia < l.hoje),
    'payable', (select coalesce(sum(saldo), 0) from a_pagar),
    'payable_overdue', (select count(*) from a_pagar p, limites l where p.saldo > 0 and p.due_date < l.hoje),
    'appointments', (select coalesce(jsonb_object_agg(situacao, total), '{}'::jsonb) from agenda)
  );
$function$;

revoke all on function public.report_summary(uuid, timestamptz, timestamptz, timestamptz) from public, anon;
grant execute on function public.report_summary(uuid, timestamptz, timestamptz, timestamptz) to authenticated, service_role;

commit;
