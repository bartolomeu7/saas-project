-- Reversao de 20261125160000_payment_orders_support: volta as funcoes do painel e remove chamados e numero da ordem.
-- Atencao: APAGA os chamados abertos pelos clientes (exporte antes, se precisar).
begin;

drop function public.list_platform_payments(text, public.subscription_payment_status, text, text, text, timestamptz, timestamptz, text, integer, integer);
CREATE OR REPLACE FUNCTION public.list_platform_payments(p_search text DEFAULT NULL::text, p_status subscription_payment_status DEFAULT NULL::subscription_payment_status, p_provider text DEFAULT NULL::text, p_method text DEFAULT NULL::text, p_plan_code text DEFAULT NULL::text, p_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_to timestamp with time zone DEFAULT NULL::timestamp with time zone, p_sort text DEFAULT 'created_desc'::text, p_limit integer DEFAULT 25, p_offset integer DEFAULT 0)
 RETURNS TABLE(payment_id uuid, company_id uuid, company_name text, plan_code text, plan_name text, provider text, method text, status subscription_payment_status, amount numeric, currency text, external_reference text, paid_at timestamp with time zone, created_at timestamp with time zone, recorded_by_email text, total_count bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
declare
  v_pattern text;
  v_limit integer := least(greatest(coalesce(p_limit, 25), 1), 100);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
begin
  if not public.is_platform_admin() then
    raise exception 'not authorized';
  end if;
  if nullif(trim(coalesce(p_search, '')), '') is not null then
    v_pattern := '%' || replace(replace(replace(trim(p_search), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;

  return query
  select sp.id, sp.company_id, c.name, pl.code, pl.name, sp.provider, sp.method, sp.status, sp.amount, sp.currency,
         sp.external_reference, sp.paid_at, sp.created_at, rp.email, count(*) over ()
  from public.subscription_payments sp
  join public.companies c on c.id = sp.company_id
  join public.plans pl on pl.id = sp.plan_id
  left join public.profiles rp on rp.user_id = sp.recorded_by
  where (p_status is null or sp.status = p_status)
    and (p_provider is null or sp.provider = p_provider)
    and (p_method is null or sp.method = p_method)
    and (p_plan_code is null or pl.code = p_plan_code)
    and (p_from is null or sp.created_at >= p_from)
    and (p_to is null or sp.created_at < p_to)
    and (v_pattern is null or c.name ilike v_pattern escape '\' or sp.external_reference ilike v_pattern escape '\')
  order by
    case when p_sort = 'amount_desc' then sp.amount end desc,
    case when p_sort = 'created_asc' then sp.created_at end asc,
    sp.created_at desc, sp.id
  limit v_limit offset v_offset;
end;
$function$;
revoke all on function public.list_platform_payments(text, public.subscription_payment_status, text, text, text, timestamptz, timestamptz, text, integer, integer) from public, anon;
grant execute on function public.list_platform_payments(text, public.subscription_payment_status, text, text, text, timestamptz, timestamptz, text, integer, integer) to authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_platform_payment_detail(p_payment_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_actor uuid := public.current_profile_user_id();
  v_is_super boolean := public.is_super_admin();
  v_p public.subscription_payments;
begin
  if not public.is_platform_admin() then
    raise exception 'not authorized';
  end if;

  select * into v_p from public.subscription_payments where id = p_payment_id;
  if not found then
    raise exception 'Pagamento não encontrado.';
  end if;

  return jsonb_build_object(
    'payment', jsonb_build_object(
      'id', v_p.id, 'company_id', v_p.company_id,
      'company_name', (select name from public.companies where id = v_p.company_id),
      'plan_code', (select code from public.plans where id = v_p.plan_id),
      'plan_name', (select name from public.plans where id = v_p.plan_id),
      'provider', v_p.provider, 'method', v_p.method, 'status', v_p.status,
      'amount', v_p.amount, 'amount_with_tax', v_p.amount_with_tax, 'currency', v_p.currency,
      'external_reference', v_p.external_reference, 'notes', v_p.notes,
      'provider_transaction_id', v_p.provider_transaction_id, 'end_to_end_id', v_p.end_to_end_id,
      'payer_name', v_p.payer_name,
      'payer_document_masked', case when v_p.payer_document is null then null
                                    else '***' || right(regexp_replace(v_p.payer_document, '\D', '', 'g'), 4) end,
      'due_at', v_p.due_at, 'paid_at', v_p.paid_at, 'created_at', v_p.created_at, 'updated_at', v_p.updated_at,
      'recorded_by_email', (select email from public.profiles where user_id = v_p.recorded_by)
    ),
    'events', coalesce((
      select jsonb_agg(jsonb_build_object('event_id', e.event_id, 'event_type', e.event_type,
                                          'processed', e.processed, 'processed_at', e.processed_at, 'created_at', e.created_at)
                       order by e.created_at desc)
      from public.payment_events e where e.subscription_payment_id = v_p.id
    ), '[]'::jsonb),
    'deliveries', coalesce((
      select jsonb_agg(jsonb_build_object('provider', d.provider, 'outcome', d.outcome, 'detail', d.detail, 'received_at', d.received_at)
                       order by d.received_at desc)
      from public.webhook_deliveries d where d.payment_id = v_p.id
    ), '[]'::jsonb),
    'audit', coalesce((
      select jsonb_agg(y order by y.created_at desc) from (
        select a.id, a.action, public.platform_audit_category(a.action) as category, a.created_at,
               ap.email as actor_email, public.platform_safe_metadata(a.metadata) as metadata
        from public.audit_logs a left join public.profiles ap on ap.user_id = a.actor_user_id
        where a.entity_type = 'subscription_payment' and a.entity_id = v_p.id
          and (v_is_super or a.actor_user_id = v_actor)
        order by a.created_at desc limit 20
      ) y
    ), '[]'::jsonb)
  );
end;
$function$;

drop function if exists public.resolve_platform_payment_ticket(uuid, text);
drop function if exists public.list_platform_payment_tickets(text, integer, integer);
drop function if exists public.open_payment_ticket(uuid, text, text);
drop table if exists public.payment_support_tickets;
drop function if exists public.payment_order_code(bigint);
alter table public.subscription_payments drop column if exists order_number;

commit;
